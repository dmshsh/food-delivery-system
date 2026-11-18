import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { DbService } from '../db/db.service';
import { BLOCK_MINUTES, WARN_FROM_ATTEMPT, blockSecondsLeft, describeWait } from '../domain/security';
import { ValidationError, validateRegistration } from '../domain/validation';
import { IpGuardService, SecurityService } from '../security/security.service';
import { UniquenessService } from '../uniqueness/uniqueness.service';
import { AuthUser, Role } from './types';

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DbService,
    private readonly jwt: JwtService,
    private readonly security: SecurityService,
    private readonly ipGuard: IpGuardService,
    private readonly unique: UniquenessService,
  ) {}

  /** Registration always creates a CUSTOMER. Staff accounts exist only in the database seed. */
  async register(body: unknown, ip: string): Promise<{ user: AuthUser; token: string }> {
    let input;
    try {
      input = validateRegistration(body);
    } catch (e) {
      if (e instanceof ValidationError) throw new BadRequestException({ code: e.code, message: e.message });
      throw e;
    }
    // Asked before the insert so the person is told which field clashes; the
    // unique indexes behind them are what actually guarantees it.
    await this.unique.assertEmailFree(input.email);
    await this.unique.assertPhoneFree(input.phone);

    const hash = await bcrypt.hash(input.password, 10);
    const id = await this.unique.guard(() =>
      this.db.tx(async (client) => {
        const u = await client.query(
          `INSERT INTO users(email, password_hash, full_name, role, preferred_language)
           VALUES ($1,$2,$3,'CUSTOMER',$4) RETURNING id`,
          [input.email, hash, input.fullName, input.language],
        );
        await client.query('INSERT INTO customers(user_id, phone, address) VALUES ($1,$2,$3)', [
          u.rows[0].id,
          input.phone,
          input.address,
        ]);
        return u.rows[0].id as number;
      }),
    );
    const user: AuthUser = {
      id,
      email: input.email,
      fullName: input.fullName,
      role: 'CUSTOMER',
      language: input.language,
    };
    await this.security.log({ kind: 'REGISTERED', userId: id, email: input.email, ip, detail: `language ${input.language}` });
    return { user, token: await this.sign(user) };
  }

  /**
   * Sign-in with a limit on wrong passwords.
   *
   * Order of the checks matters: a blocked account is refused BEFORE the password is
   * compared, so a blocked attacker cannot use the answer to learn whether a guess was
   * right. A wrong password for an email that does not exist is still counted, so
   * guessing addresses is slowed down too, but the answer stays the same either way and
   * never reveals which part was wrong.
   */
  async login(body: unknown, ip: string): Promise<{ user: AuthUser; token: string }> {
    const { email, password } = (body ?? {}) as { email?: unknown; password?: unknown };
    const invalid = (extra?: string) =>
      new UnauthorizedException({
        code: 'bad_credentials',
        message: `Email or password is incorrect.${extra ? ` ${extra}` : ''}`,
      });
    if (typeof email !== 'string' || typeof password !== 'string' || password.length > 128) throw invalid();

    const now = new Date();
    const address = email.trim();

    // 0. Is the machine itself blocked? This comes before everything, including
    // before the email is looked up: someone working through a list of accounts
    // should not even learn which of them exist.
    const ipBlock = await this.ipGuard.blockFor(ip);
    if (ipBlock) {
      await this.security.log({
        kind: 'BLOCKED_LOGIN_ATTEMPT',
        email: address,
        ip,
        detail: `sign-in refused: this address is blocked (${ipBlock.reason || 'no reason given'})`,
      });
      throw new ForbiddenException({
        code: 'ip_blocked',
        message: ipBlock.manual
          ? 'Sign-in from this network has been blocked by an administrator.'
          : `Too many failed sign-ins from this network. Try again in ${describeWait(
              blockSecondsLeft(ipBlock.blocked_until, now),
            )}.`,
      });
    }

    const { rows } = await this.db.pool.query(
      `SELECT id, email, full_name, role, password_hash, blocked_until, is_active, block_reason,
              preferred_language
       FROM users WHERE lower(email) = lower($1)`,
      [address],
    );
    const row = rows[0];

    // 1. Blocked by an administrator: no automatic way back in.
    if (row && !row.is_active) {
      await this.security.log({
        kind: 'BLOCKED_LOGIN_ATTEMPT',
        userId: row.id,
        email: address,
        ip,
        detail: `account disabled: ${row.block_reason || 'no reason given'}`,
      });
      throw new ForbiddenException({
        code: 'account_disabled',
        message: 'This account has been blocked by an administrator. Please contact support.',
      });
    }

    // 2. Blocked automatically after too many failures: refused until the block runs out.
    const secondsLeft = blockSecondsLeft(row?.blocked_until, now);
    if (row && secondsLeft > 0) {
      await this.security.log({
        kind: 'BLOCKED_LOGIN_ATTEMPT',
        userId: row.id,
        email: address,
        ip,
        detail: `sign-in refused, ${secondsLeft}s of the block left`,
      });
      throw new ForbiddenException({
        code: 'account_blocked',
        message: `Too many failed sign-ins. Try again in ${describeWait(secondsLeft)}.`,
        retryAfterSeconds: secondsLeft,
      });
    }

    // 3. Only now is the password compared.
    if (!row || !(await bcrypt.compare(password, row.password_hash))) {
      const result = await this.security.registerFailure(address, ip, row?.id ?? null, now);
      // The same failure counts twice: once against the account it named, and
      // once against the machine it came from. The two limits catch different
      // attacks — one person's password, or a sweep across many accounts.
      const fromIp = await this.ipGuard.registerFailure(ip, now);
      if (fromIp.blocked) {
        throw new ForbiddenException({
          code: 'ip_blocked',
          message: 'Too many failed sign-ins from this network. Sign-in from here is blocked for an hour.',
        });
      }
      if (result.blocked && row) {
        throw new ForbiddenException({
          code: 'account_blocked',
          message: `Too many failed sign-ins. This account is blocked for ${describeWait(BLOCK_MINUTES * 60)}.`,
        });
      }
      const warn =
        result.failures >= WARN_FROM_ATTEMPT
          ? `${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? '' : 's'} left before the account is blocked.`
          : undefined;
      throw invalid(warn);
    }

    await this.security.registerSuccess(row.id, row.email, ip);
    const user: AuthUser = {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      role: row.role as Role,
      language: row.preferred_language,
    };
    return { user, token: await this.sign(user) };
  }

  async profile(user: AuthUser): Promise<{ phone: string; address: string; bonusPoints: number } | null> {
    if (user.role !== 'CUSTOMER') return null;
    const { rows } = await this.db.pool.query(
      'SELECT phone, address, bonus_points AS "bonusPoints" FROM customers WHERE user_id = $1',
      [user.id],
    );
    return rows[0] ?? null;
  }

  /**
   * A fresh token for a session that must survive a password change.
   *
   * Changing a password refuses every token issued before it, which is what
   * signs the other devices out. The browser doing the changing would sign
   * itself out too, which is not what anyone means by "change my password", so
   * it is handed a new token at the same moment.
   */
  reissue(user: AuthUser): Promise<string> {
    return this.sign(user);
  }

  /**
   * Signs a token stamped with the account's current session generation.
   *
   * Read from the database each time rather than passed in, so there is one
   * place that decides which generation a new token belongs to, and no caller
   * can accidentally hand out a token from the previous one.
   */
  private async sign(user: AuthUser) {
    const { rows } = await this.db.pool.query('SELECT token_version FROM users WHERE id = $1', [user.id]);
    return this.jwt.signAsync({ sub: user.id, role: user.role, ver: Number(rows[0]?.token_version ?? 1) });
  }
}

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
import { SecurityService } from '../security/security.service';
import { AuthUser, Role } from './types';

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DbService,
    private readonly jwt: JwtService,
    private readonly security: SecurityService,
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
    const hash = await bcrypt.hash(input.password, 10);
    try {
      const id = await this.db.tx(async (client) => {
        const u = await client.query(
          `INSERT INTO users(email, password_hash, full_name, role) VALUES ($1,$2,$3,'CUSTOMER') RETURNING id`,
          [input.email, hash, input.fullName],
        );
        await client.query('INSERT INTO customers(user_id, phone, address) VALUES ($1,$2,$3)', [
          u.rows[0].id,
          input.phone,
          input.address,
        ]);
        return u.rows[0].id as number;
      });
      const user: AuthUser = { id, email: input.email, fullName: input.fullName, role: 'CUSTOMER' };
      await this.security.log({ kind: 'REGISTERED', userId: id, email: input.email, ip });
      return { user, token: await this.sign(user) };
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        throw new ConflictException({
          code: 'email_taken',
          message: 'This email is already registered. Please sign in.',
        });
      }
      throw e;
    }
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
    const { rows } = await this.db.pool.query(
      `SELECT id, email, full_name, role, password_hash, blocked_until, is_active, block_reason
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
    const user: AuthUser = { id: row.id, email: row.email, fullName: row.full_name, role: row.role as Role };
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

  private sign(user: AuthUser) {
    return this.jwt.signAsync({ sub: user.id, role: user.role });
  }
}

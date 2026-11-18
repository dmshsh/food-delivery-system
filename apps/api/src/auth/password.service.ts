import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { DbService } from '../db/db.service';
import {
  RESET_TOKEN_MINUTES,
  hashResetToken,
  isResetTokenLive,
  newResetToken,
  resetExpiry,
} from '../domain/password';
import { ValidationError, validateEmail, validatePasswordChange, validateReset } from '../domain/validation';
import { SecurityService } from '../security/security.service';
import { AuthUser } from './types';

function validated<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof ValidationError) throw new BadRequestException({ code: e.code, message: e.message });
    throw e;
  }
}

/**
 * Forgetting, resetting and changing a password.
 *
 * There is no mail server in this project, so a reset link cannot be delivered
 * by email. Rather than pretend, the link is written to the server log and — in
 * development only — returned in the answer, so the flow can be demonstrated end
 * to end. In production the answer never carries it, and the log line is the
 * stand-in for the email that a real deployment would send.
 */
@Injectable()
export class PasswordService {
  /** The answer is the same whether or not the email belongs to an account. */
  private static readonly SAME_ANSWER =
    'If that email belongs to an account, a reset link is on its way. The link is valid for 30 minutes.';

  constructor(private readonly db: DbService, private readonly security: SecurityService) {}

  /**
   * "I forgot my password."
   *
   * The answer never says whether the address exists. A form that replies
   * "no such user" is a way to find out who has an account here, and that is a
   * question a stranger should not be able to ask.
   */
  async forgot(body: unknown, ip: string, isProduction: boolean) {
    const email = validated(() => validateEmail(body));
    const { rows } = await this.db.pool.query(
      'SELECT id, email, full_name, is_active FROM users WHERE lower(email) = lower($1)',
      [email],
    );
    const user = rows[0];

    if (!user || !user.is_active) {
      // Nothing is created, and the answer is the same as the successful one.
      await this.security.log({
        kind: 'PASSWORD_RESET_REQUESTED',
        email,
        ip,
        detail: user ? 'refused: the account is blocked' : 'refused: no such account',
      });
      return { message: PasswordService.SAME_ANSWER };
    }

    const token = newResetToken();
    const now = new Date();
    await this.db.tx(async (c) => {
      // Asking again retires the earlier link, so only the newest one works.
      await c.query('UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [user.id]);
      await c.query(
        'INSERT INTO password_resets(user_id, token_hash, expires_at, created_ip) VALUES ($1,$2,$3,$4)',
        [user.id, hashResetToken(token), resetExpiry(now), ip],
      );
    });

    await this.security.log({
      kind: 'PASSWORD_RESET_REQUESTED',
      userId: user.id,
      email: user.email,
      ip,
      detail: `reset link issued, valid for ${RESET_TOKEN_MINUTES} minutes`,
    });

    // The stand-in for the email this project does not send.
    console.log(`[password reset] ${user.email}: /reset-password?token=${token}`);

    return {
      message: PasswordService.SAME_ANSWER,
      // Development only. In production the link exists solely in the log above.
      ...(isProduction ? {} : { demoToken: token, demoNote: 'Development only: a real deployment emails this link.' }),
    };
  }

  /** Setting a new password from a reset link. */
  async reset(body: unknown, ip: string) {
    const input = validated(() => validateReset(body));
    const now = new Date();
    const refuse = () =>
      new BadRequestException({
        code: 'bad_reset_token',
        message: 'This reset link has expired or has already been used. Ask for a new one.',
      });

    // Looked up BY HASH: the token itself is never stored, so this is the only
    // way to find the row, and a stolen database contains no usable links.
    const { rows } = await this.db.pool.query(
      `SELECT r.id, r.user_id, r.expires_at, r.used_at, u.email, u.full_name, u.is_active
       FROM password_resets r JOIN users u ON u.id = r.user_id
       WHERE r.token_hash = $1`,
      [hashResetToken(input.token)],
    );
    const row = rows[0];
    if (!isResetTokenLive(row, now) || !row.is_active) {
      await this.security.log({
        kind: 'PASSWORD_RESET_USED',
        userId: row?.user_id ?? null,
        email: row?.email ?? '',
        ip,
        detail: 'refused: the link was expired, already used, or the account is blocked',
      });
      throw refuse();
    }

    const hash = await bcrypt.hash(input.password, 10);
    await this.db.tx(async (c) => {
      // Marked used inside the same transaction as the new password, so a link
      // can never set two passwords even if it is submitted twice at once.
      const spent = await c.query('UPDATE password_resets SET used_at = now() WHERE id = $1 AND used_at IS NULL', [
        row.id,
      ]);
      if (spent.rowCount === 0) throw refuse();
      await c.query(
        // Raising the version is what signs the other devices out: every token
        // carrying the old number stops being accepted from this moment.
        `UPDATE users SET password_hash = $2, password_changed_at = now(),
                          token_version = token_version + 1,
                          failed_attempts = 0, blocked_until = NULL, block_reason = ''
         WHERE id = $1`,
        [row.user_id, hash],
      );
      // Whoever was locked out by failed guesses can get back in with the new password.
      await c.query('DELETE FROM login_attempts WHERE lower(email) = lower($1) AND success = FALSE', [row.email]);
    });

    await this.security.log({
      kind: 'PASSWORD_RESET_USED',
      userId: row.user_id,
      email: row.email,
      ip,
      detail: 'password set from a reset link; other sessions signed out',
    });
    return { ok: true, message: 'Your password has been changed. Please sign in.' };
  }

  /** Changing a password while signed in: the current one has to be given. */
  async change(user: AuthUser, body: unknown, ip: string) {
    const input = validated(() => validatePasswordChange(body));
    const { rows } = await this.db.pool.query('SELECT password_hash, full_name, email FROM users WHERE id = $1', [
      user.id,
    ]);
    const row = rows[0];
    if (!row || !(await bcrypt.compare(input.currentPassword, row.password_hash))) {
      await this.security.log({
        kind: 'PASSWORD_CHANGED',
        userId: user.id,
        email: user.email,
        ip,
        detail: 'refused: the current password was wrong',
      });
      throw new UnauthorizedException({
        code: 'bad_current_password',
        message: 'Your current password is not correct.',
      });
    }

    const hash = await bcrypt.hash(input.newPassword, 10);
    await this.db.tx(async (c) => {
      await c.query(
        `UPDATE users SET password_hash = $2, password_changed_at = now(),
                          token_version = token_version + 1
         WHERE id = $1`,
        [user.id, hash],
      );
      // Any reset link still in someone's inbox stops working now.
      await c.query('UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [user.id]);
    });

    await this.security.log({
      kind: 'PASSWORD_CHANGED',
      userId: user.id,
      email: user.email,
      ip,
      detail: 'password changed; other sessions signed out',
    });
    return { ok: true, message: 'Your password has been changed. Other devices have been signed out.' };
  }
}

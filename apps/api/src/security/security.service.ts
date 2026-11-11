import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DbService } from '../db/db.service';
import {
  EVENT_SEVERITY,
  MAX_FAILED_ATTEMPTS,
  SecurityEventKind,
  attemptsLeft,
  blockUntil,
  isSecurityEventKind,
  shouldBlock,
  windowStart,
} from '../domain/security';

export interface JournalEntry {
  kind: SecurityEventKind;
  userId?: number | null;
  email?: string;
  ip?: string;
  detail?: string;
}

/** The result of counting one failed sign-in. */
export interface FailureResult {
  failures: number;
  blocked: boolean;
  attemptsLeft: number;
}

/**
 * Everything the system records about who tried to get in, and the rule that
 * blocks an account after too many wrong passwords in a short time.
 *
 * Writing to the journal must never break the action that is being recorded, so
 * every write is best-effort: if the journal insert fails, the request carries on.
 */
@Injectable()
export class SecurityService {
  constructor(private readonly db: DbService) {}

  /** Adds one line to the security journal. Never throws. */
  async log(entry: JournalEntry, client?: PoolClient): Promise<void> {
    const runner = client ?? this.db.pool;
    try {
      await runner.query(
        `INSERT INTO security_events(kind, severity, user_id, email, ip, detail)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          entry.kind,
          EVENT_SEVERITY[entry.kind] ?? 'INFO',
          entry.userId ?? null,
          (entry.email ?? '').slice(0, 160),
          (entry.ip ?? '').slice(0, 60),
          (entry.detail ?? '').slice(0, 300),
        ],
      );
    } catch {
      /* the journal must never break the request it is describing */
    }
  }

  /** Records a sign-in try (successful or not) for the rate limiter to count. */
  async recordAttempt(email: string, ip: string, success: boolean): Promise<void> {
    try {
      await this.db.pool.query('INSERT INTO login_attempts(email, ip, success) VALUES ($1,$2,$3)', [
        email.slice(0, 160),
        ip.slice(0, 60),
        success,
      ]);
    } catch {
      /* same reasoning as log() */
    }
  }

  /** Failed sign-ins for this email inside the current window. */
  async failuresInWindow(email: string, now: Date): Promise<number> {
    const { rows } = await this.db.pool.query(
      `SELECT COUNT(*) AS n FROM login_attempts
       WHERE lower(email) = lower($1) AND success = FALSE AND created_at > $2`,
      [email, windowStart(now)],
    );
    return Number(rows[0]?.n ?? 0);
  }

  /**
   * Counts one more failure. When the limit is reached, the matching account
   * (if the email belongs to one) is blocked and the block is written to the journal.
   */
  async registerFailure(email: string, ip: string, userId: number | null, now: Date): Promise<FailureResult> {
    await this.recordAttempt(email, ip, false);
    const failures = await this.failuresInWindow(email, now);
    const blocked = shouldBlock(failures);

    if (userId !== null) {
      await this.db.pool.query('UPDATE users SET failed_attempts = $2 WHERE id = $1', [userId, failures]);
    }

    if (blocked && userId !== null) {
      const until = blockUntil(now);
      await this.db.pool.query('UPDATE users SET blocked_until = $2, block_reason = $3 WHERE id = $1', [
        userId,
        until,
        `${MAX_FAILED_ATTEMPTS} failed sign-ins in a row`,
      ]);
      await this.log({
        kind: 'ACCOUNT_BLOCKED',
        userId,
        email,
        ip,
        detail: `${failures} failed sign-ins; blocked until ${until.toISOString()}`,
      });
    } else {
      await this.log({
        kind: 'LOGIN_FAILED',
        userId,
        email,
        ip,
        detail: `failure ${failures} of ${MAX_FAILED_ATTEMPTS}`,
      });
    }

    return { failures, blocked, attemptsLeft: attemptsLeft(failures) };
  }

  /** A correct password clears the counter and the window, so the next mistake starts from zero. */
  async registerSuccess(userId: number, email: string, ip: string): Promise<void> {
    await this.recordAttempt(email, ip, true);
    await this.db.pool.query(
      `UPDATE users SET failed_attempts = 0, blocked_until = NULL, block_reason = '' WHERE id = $1`,
      [userId],
    );
    await this.db.pool.query('DELETE FROM login_attempts WHERE lower(email) = lower($1) AND success = FALSE', [email]);
    await this.log({ kind: 'LOGIN_OK', userId, email, ip });
  }

  /** The journal, newest first, with the filters the admin page offers. */
  async journal(filter: { kind?: string; severity?: string; limit?: number } = {}) {
    const params: unknown[] = [];
    const where: string[] = [];
    if (filter.kind && isSecurityEventKind(filter.kind)) {
      params.push(filter.kind);
      where.push(`e.kind = $${params.length}`);
    }
    if (filter.severity && ['INFO', 'WARNING', 'CRITICAL'].includes(filter.severity)) {
      params.push(filter.severity);
      where.push(`e.severity = $${params.length}`);
    }
    params.push(Math.min(Math.max(filter.limit ?? 100, 1), 500));
    const { rows } = await this.db.pool.query(
      `SELECT e.id, e.kind, e.severity, e.email, e.ip, e.detail, e.created_at AS "createdAt",
              e.user_id AS "userId", u.full_name AS "userName"
       FROM security_events e
       LEFT JOIN users u ON u.id = e.user_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY e.created_at DESC, e.id DESC
       LIMIT $${params.length}`,
      params,
    );
    const counts = await this.db.pool.query(
      `SELECT severity, COUNT(*) AS n FROM security_events
       WHERE created_at > now() - interval '24 hours' GROUP BY severity`,
    );
    const summary: Record<string, number> = { INFO: 0, WARNING: 0, CRITICAL: 0 };
    for (const row of counts.rows) summary[row.severity] = Number(row.n);
    return { events: rows, last24h: summary };
  }
}

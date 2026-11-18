import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DbService } from '../db/db.service';
import {
  EVENT_SEVERITY,
  IP_BLOCK_MINUTES,
  IP_WINDOW_MINUTES,
  MAX_FAILED_ATTEMPTS,
  MAX_IP_FAILURES,
  SecurityEventKind,
  attemptsLeft,
  blockUntil,
  ipBlockUntil,
  ipWindowStart,
  isBlockableIp,
  isIpBlocked,
  isSecurityEventKind,
  shouldBlock,
  shouldBlockIp,
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

/**
 * Blocking by address.
 *
 * Kept in the same service as the account limiter because the two share the one
 * table of sign-in attempts: a failure counts once for the account it names and
 * once for the machine it came from.
 */
@Injectable()
export class IpGuardService {
  constructor(private readonly db: DbService, private readonly security: SecurityService) {}

  /** The block on this address, if there is one. */
  async blockFor(ip: string): Promise<{ manual: boolean; blocked_until: Date | null; reason: string } | null> {
    if (!isBlockableIp(ip)) return null;
    const { rows } = await this.db.pool.query(
      'SELECT manual, blocked_until, reason FROM blocked_ips WHERE ip = $1',
      [ip],
    );
    const row = rows[0];
    return row && isIpBlocked(row, new Date()) ? row : null;
  }

  /** Failed sign-ins from this address, across every account, inside the window. */
  async failuresFromIp(ip: string, now: Date): Promise<number> {
    const { rows } = await this.db.pool.query(
      `SELECT COUNT(*) AS n FROM login_attempts WHERE ip = $1 AND success = FALSE AND created_at > $2`,
      [ip, ipWindowStart(now)],
    );
    return Number(rows[0]?.n ?? 0);
  }

  /**
   * Counts one failure against the address and blocks it once the limit is reached.
   * Loopback addresses are counted but never blocked: behind the site's own proxy
   * every request appears to come from there, and blocking it would lock out
   * everybody at once.
   */
  async registerFailure(ip: string, now: Date): Promise<{ failures: number; blocked: boolean }> {
    if (!isBlockableIp(ip)) return { failures: 0, blocked: false };
    const failures = await this.failuresFromIp(ip, now);
    if (!shouldBlockIp(failures)) return { failures, blocked: false };

    const until = ipBlockUntil(now);
    await this.db.pool.query(
      `INSERT INTO blocked_ips(ip, reason, failures, blocked_until, manual)
       VALUES ($1,$2,$3,$4,FALSE)
       ON CONFLICT (ip) DO UPDATE
         SET failures = EXCLUDED.failures,
             reason = EXCLUDED.reason,
             -- a manual block is never shortened or lifted by an automatic one
             blocked_until = CASE WHEN blocked_ips.manual THEN blocked_ips.blocked_until ELSE EXCLUDED.blocked_until END`,
      [ip, `${failures} failed sign-ins from this address in ${IP_WINDOW_MINUTES} minutes`, failures, until],
    );
    await this.security.log({
      kind: 'IP_BLOCKED',
      ip,
      detail: `${failures} failed sign-ins from this address; blocked for ${IP_BLOCK_MINUTES} minutes`,
    });
    return { failures, blocked: true };
  }

  /** An administrator blocks an address by hand. A manual block has no end time. */
  async blockByHand(ip: string, reason: string, adminId: number, adminEmail: string) {
    await this.db.pool.query(
      `INSERT INTO blocked_ips(ip, reason, manual, blocked_until, blocked_by)
       VALUES ($1,$2,TRUE,NULL,$3)
       ON CONFLICT (ip) DO UPDATE SET reason = EXCLUDED.reason, manual = TRUE, blocked_until = NULL, blocked_by = EXCLUDED.blocked_by`,
      [ip, reason, adminId],
    );
    await this.security.log({
      kind: 'IP_BLOCKED',
      userId: adminId,
      email: adminEmail,
      ip,
      detail: `blocked by hand: ${reason}`,
    });
  }

  async unblock(ip: string, adminId: number, adminEmail: string) {
    const { rowCount } = await this.db.pool.query('DELETE FROM blocked_ips WHERE ip = $1', [ip]);
    // Clearing the failures as well, so the address does not block itself again
    // on the next mistake from inside the window that caused the block.
    await this.db.pool.query('DELETE FROM login_attempts WHERE ip = $1 AND success = FALSE', [ip]);
    await this.security.log({
      kind: 'IP_UNBLOCKED',
      userId: adminId,
      email: adminEmail,
      ip,
      detail: `unblocked by ${adminEmail}`,
    });
    return rowCount ?? 0;
  }

  /** The list behind the admin panel's "Addresses" tab. */
  async list() {
    const now = new Date();
    const { rows } = await this.db.pool.query(
      `SELECT b.ip, b.reason, b.failures, b.manual, b.blocked_until AS "blockedUntil",
              b.created_at AS "createdAt", u.email AS "blockedByEmail",
              (SELECT COUNT(*) FROM login_attempts a
                WHERE a.ip = b.ip AND a.success = FALSE AND a.created_at > now() - interval '24 hours') AS "failures24h"
       FROM blocked_ips b
       LEFT JOIN users u ON u.id = b.blocked_by
       ORDER BY b.created_at DESC`,
    );
    return {
      addresses: rows.map((r) => ({
        ...r,
        failures: Number(r.failures),
        failures24h: Number(r.failures24h),
        active: isIpBlocked({ manual: r.manual, blocked_until: r.blockedUntil }, now),
      })),
      // What the limiter is working with, so the numbers in the panel are explainable.
      rules: { maxFailures: MAX_IP_FAILURES, windowMinutes: IP_WINDOW_MINUTES, blockMinutes: IP_BLOCK_MINUTES },
    };
  }

  /** Addresses with many recent failures that are not blocked yet: what to watch. */
  async suspicious() {
    const { rows } = await this.db.pool.query(
      `SELECT a.ip, COUNT(*) AS failures, COUNT(DISTINCT lower(a.email)) AS accounts, MAX(a.created_at) AS "lastAt"
       FROM login_attempts a
       WHERE a.success = FALSE AND a.created_at > now() - interval '24 hours'
         AND a.ip <> '' AND a.ip NOT IN (SELECT ip FROM blocked_ips)
       GROUP BY a.ip
       HAVING COUNT(*) >= 3
       ORDER BY COUNT(*) DESC
       LIMIT 20`,
    );
    return rows.map((r) => ({ ...r, failures: Number(r.failures), accounts: Number(r.accounts) }));
  }
}

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser, Role, isRole } from '../auth/types';
import { DbService } from '../db/db.service';
import { SecurityService } from '../security/security.service';
import {
  ValidationError,
  validateAccess,
  validateMenuItem,
  validateReorder,
} from '../domain/validation';

function validated<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof ValidationError) throw new BadRequestException({ code: e.code, message: e.message });
    throw e;
  }
}

@Injectable()
export class AdminService {
  constructor(private readonly db: DbService, private readonly security: SecurityService) {}

  // -------------------------------------------------------------- overview

  /** The numbers the admin dashboard shows, in one round trip each. */
  async overview() {
    const [users, orders, money, feedback, bonus, security] = await Promise.all([
      this.db.pool.query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE NOT is_active) AS disabled,
                COUNT(*) FILTER (WHERE blocked_until > now()) AS blocked
         FROM users`,
      ),
      this.db.pool.query('SELECT status, COUNT(*) AS n FROM orders GROUP BY status'),
      this.db.pool.query(
        `SELECT COALESCE(SUM(amount_tiyn), 0) AS paid, COUNT(*) AS n
         FROM payment_attempts WHERE outcome = 'APPROVED'`,
      ),
      this.db.pool.query('SELECT COUNT(*) AS n, COALESCE(AVG(rating), 0) AS avg FROM order_feedback'),
      this.db.pool.query(
        `SELECT COALESCE(SUM(bonus_points), 0) AS outstanding FROM customers`,
      ),
      this.db.pool.query(
        `SELECT COUNT(*) AS n FROM security_events
         WHERE severity = 'CRITICAL' AND created_at > now() - interval '24 hours'`,
      ),
    ]);

    const ordersByStatus: Record<string, number> = {};
    let orderTotal = 0;
    for (const row of orders.rows) {
      ordersByStatus[row.status] = Number(row.n);
      orderTotal += Number(row.n);
    }

    return {
      users: {
        total: Number(users.rows[0].total),
        disabled: Number(users.rows[0].disabled),
        blocked: Number(users.rows[0].blocked),
      },
      orders: { total: orderTotal, byStatus: ordersByStatus },
      money: { approvedPayments: Number(money.rows[0].n), approvedTotalTiyn: Number(money.rows[0].paid) },
      feedback: {
        count: Number(feedback.rows[0].n),
        average: Math.round(Number(feedback.rows[0].avg) * 100) / 100,
      },
      bonus: { outstandingPoints: Number(bonus.rows[0].outstanding) },
      security: { criticalLast24h: Number(security.rows[0].n) },
    };
  }

  // ------------------------------------------------------------------ menu

  /** The whole menu, unavailable dishes included, in the order the admin arranged. */
  async menu() {
    const { rows } = await this.db.pool.query(
      `SELECT m.id, m.name, m.description, m.category, m.price_tiyn AS "priceTiyn",
              m.available, m.sort_order AS "sortOrder",
              COALESCE(COUNT(i.order_id), 0) AS "timesOrdered"
       FROM menu_items m
       LEFT JOIN order_items i ON i.item_id = m.id
       GROUP BY m.id
       ORDER BY m.sort_order, m.id`,
    );
    return { items: rows.map((r) => ({ ...r, timesOrdered: Number(r.timesOrdered) })) };
  }

  async createMenuItem(user: AuthUser, body: unknown) {
    const input = validated(() => validateMenuItem(body));
    const { rows } = await this.db.pool.query(
      `INSERT INTO menu_items(name, description, category, price_tiyn, available, sort_order)
       VALUES ($1,$2,$3,$4,$5, COALESCE((SELECT MAX(sort_order) + 1 FROM menu_items), 0))
       RETURNING id, name, description, category, price_tiyn AS "priceTiyn", available, sort_order AS "sortOrder"`,
      [input.name, input.description, input.category, input.priceTiyn, input.available],
    );
    await this.logAction(user, `created dish "${input.name}" (#${rows[0].id})`);
    return { item: { ...rows[0], timesOrdered: 0 } };
  }

  async updateMenuItem(user: AuthUser, id: number, body: unknown) {
    const input = validated(() => validateMenuItem(body));
    const { rows } = await this.db.pool.query(
      `UPDATE menu_items SET name = $2, description = $3, category = $4, price_tiyn = $5, available = $6
       WHERE id = $1
       RETURNING id, name, description, category, price_tiyn AS "priceTiyn", available, sort_order AS "sortOrder"`,
      [id, input.name, input.description, input.category, input.priceTiyn, input.available],
    );
    if (!rows[0]) throw new NotFoundException({ code: 'not_found', message: 'This dish was not found.' });
    await this.logAction(user, `edited dish #${id} ("${input.name}", ${input.priceTiyn} tiyn, available=${input.available})`);
    return { item: rows[0] };
  }

  /**
   * Removing a dish.
   *
   * A dish that was never ordered is deleted outright. One that appears in an order is
   * only hidden: deleting it would rewrite the history of orders already paid for, and
   * the prices stored with those orders have to keep pointing at a real dish.
   */
  async removeMenuItem(user: AuthUser, id: number) {
    const used = await this.db.pool.query('SELECT 1 FROM order_items WHERE item_id = $1 LIMIT 1', [id]);
    if (used.rowCount) {
      const { rows } = await this.db.pool.query(
        'UPDATE menu_items SET available = FALSE WHERE id = $1 RETURNING id, name',
        [id],
      );
      if (!rows[0]) throw new NotFoundException({ code: 'not_found', message: 'This dish was not found.' });
      await this.logAction(user, `hid dish #${id} ("${rows[0].name}") because it appears in past orders`);
      return { removed: false, hidden: true };
    }
    const { rows } = await this.db.pool.query('DELETE FROM menu_items WHERE id = $1 RETURNING id, name', [id]);
    if (!rows[0]) throw new NotFoundException({ code: 'not_found', message: 'This dish was not found.' });
    await this.logAction(user, `deleted dish #${id} ("${rows[0].name}")`);
    return { removed: true, hidden: false };
  }

  /**
   * The new menu order after a drag and drop.
   *
   * The whole list is written in one transaction: either the menu shows the new order
   * completely, or it stays exactly as it was. A half-applied drag would leave two
   * dishes claiming the same place.
   */
  async reorderMenu(user: AuthUser, body: unknown) {
    const ids = validated(() => validateReorder(body));
    const moved = await this.db.tx(async (c) => {
      const existing = await c.query('SELECT id FROM menu_items WHERE id = ANY($1::int[])', [ids]);
      if (existing.rowCount !== ids.length) {
        throw new BadRequestException({
          code: 'unknown_dish',
          message: 'The new order contains a dish that no longer exists. Refresh the page.',
        });
      }
      await c.query(
        `UPDATE menu_items m SET sort_order = n.position
         FROM unnest($1::int[]) WITH ORDINALITY AS n(id, position)
         WHERE m.id = n.id`,
        [ids],
      );
      return ids.length;
    });
    await this.logAction(user, `reordered the menu (${moved} dishes)`);
    return this.menu();
  }

  // ----------------------------------------------------------------- users

  async users() {
    const { rows } = await this.db.pool.query(
      `SELECT u.id, u.email, u.full_name AS "fullName", u.role, u.is_active AS "isActive",
              u.blocked_until AS "blockedUntil", u.block_reason AS "blockReason",
              u.failed_attempts AS "failedAttempts",
              c.bonus_points AS "bonusPoints",
              COALESCE(COUNT(o.id), 0) AS "orderCount"
       FROM users u
       LEFT JOIN customers c ON c.user_id = u.id
       LEFT JOIN orders o ON o.customer_id = c.id
       GROUP BY u.id, c.bonus_points
       ORDER BY u.id`,
    );
    return { users: rows.map((r) => ({ ...r, orderCount: Number(r.orderCount) })) };
  }

  /**
   * Blocking or unblocking an account.
   *
   * An admin may not block their own account: that would lock the last door from the
   * inside and leave nobody able to open it again.
   */
  async setAccess(user: AuthUser, targetId: number, body: unknown) {
    const input = validated(() => validateAccess(body));
    if (targetId === user.id) {
      throw new ConflictException({ code: 'self_block', message: 'You cannot block your own account.' });
    }
    const found = await this.db.pool.query('SELECT id, email, role FROM users WHERE id = $1', [targetId]);
    if (!found.rows[0]) throw new NotFoundException({ code: 'not_found', message: 'This user was not found.' });
    const target = found.rows[0];

    if (input.action === 'block') {
      await this.db.pool.query(
        `UPDATE users SET is_active = FALSE, block_reason = $2 WHERE id = $1`,
        [targetId, input.reason],
      );
      await this.security.log({
        kind: 'ACCOUNT_BLOCKED',
        userId: targetId,
        email: target.email,
        detail: `blocked by ${user.email}: ${input.reason}`,
      });
    } else {
      await this.db.pool.query(
        `UPDATE users SET is_active = TRUE, blocked_until = NULL, block_reason = '', failed_attempts = 0 WHERE id = $1`,
        [targetId],
      );
      await this.db.pool.query('DELETE FROM login_attempts WHERE lower(email) = lower($1) AND success = FALSE', [
        target.email,
      ]);
      await this.security.log({
        kind: 'ACCOUNT_UNBLOCKED',
        userId: targetId,
        email: target.email,
        detail: `unblocked by ${user.email}${input.reason ? `: ${input.reason}` : ''}`,
      });
    }
    return this.users();
  }

  /** Changing someone's role. The admin cannot take the role away from themselves. */
  async setRole(user: AuthUser, targetId: number, role: unknown) {
    if (!isRole(role)) {
      throw new BadRequestException({ code: 'bad_role', message: 'Choose customer, kitchen, accountant or admin.' });
    }
    if (targetId === user.id) {
      throw new ConflictException({ code: 'self_role', message: 'You cannot change your own role.' });
    }
    const found = await this.db.pool.query('SELECT id, email, role FROM users WHERE id = $1', [targetId]);
    if (!found.rows[0]) throw new NotFoundException({ code: 'not_found', message: 'This user was not found.' });
    const previous: Role = found.rows[0].role;

    await this.db.tx(async (c) => {
      await c.query('UPDATE users SET role = $2 WHERE id = $1', [targetId, role]);
      // A customer needs a customers row to be able to order at all.
      if (role === 'CUSTOMER') {
        await c.query(
          `INSERT INTO customers(user_id, phone, address) VALUES ($1, '+70000000000', 'Address not set')
           ON CONFLICT (user_id) DO NOTHING`,
          [targetId],
        );
      }
    });
    await this.logAction(user, `changed the role of ${found.rows[0].email} from ${previous} to ${role}`);
    return this.users();
  }

  // -------------------------------------------------------------- internal

  private logAction(user: AuthUser, detail: string) {
    return this.security.log({ kind: 'ADMIN_ACTION', userId: user.id, email: user.email, detail });
  }
}

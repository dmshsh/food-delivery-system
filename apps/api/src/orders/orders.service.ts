import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { AuthUser } from '../auth/types';
import { DbService } from '../db/db.service';
import { KITCHEN_VISIBLE, OrderStatus, isKitchenStep, isOrderStatus } from '../domain/status';
import { ValidationError, validateOrderInput, validateOutcome } from '../domain/validation';

const CHECKOUT_SECONDS = 120;

interface OrderRow {
  id: number;
  attempt_id: string;
  status: OrderStatus;
  delivery_address: string;
  delivery_time: Date | null;
  notes: string;
  created_at: Date;
  expires_at: Date;
  items: { itemId: number; name: string; quantity: number; unitPriceTiyn: number }[];
}

/** Turn a ValidationError from the pure domain code into an HTTP 400. */
function validated<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof ValidationError) throw new BadRequestException({ code: e.code, message: e.message });
    throw e;
  }
}

@Injectable()
export class OrdersService {
  constructor(private readonly db: DbService) {}

  // ---------------------------------------------------------------- reads

  async list(user: AuthUser, status?: string) {
    await this.expirePending();
    if (status && !isOrderStatus(status)) throw new BadRequestException({ code: 'bad_status', message: 'Choose a valid order status.' });
    const where: string[] = [];
    const params: unknown[] = [];
    if (user.role === 'CUSTOMER') {
      params.push(await this.customerId(user));
      where.push(`o.customer_id = $${params.length}`);
    } else {
      // Kitchen sees only paid orders.
      params.push([...KITCHEN_VISIBLE]);
      where.push(`o.status = ANY($${params.length}::text[])`);
    }
    if (status) {
      params.push(status);
      where.push(`o.status = $${params.length}`);
    }
    return { orders: (await this.load(where.join(' AND '), params)).map((r) => this.present(user, r)) };
  }

  async detail(user: AuthUser, orderId: number) {
    await this.expirePending();
    await this.assertCanRead(user, orderId);
    const [row] = await this.load('o.id = $1', [orderId]);
    return { order: this.present(user, row) };
  }

  // --------------------------------------------------------------- create

  /**
   * Saves a PENDING order and its items in ONE transaction. Prices come from the menu table,
   * never from the browser. The same (customer, attemptId) always returns the same order.
   */
  async create(user: AuthUser, body: unknown) {
    const input = validated(() => validateOrderInput(body, new Date()));
    const customerId = await this.customerId(user);

    const { orderId, replayed } = await this.db.tx(async (c) => {
      const inserted = await c.query(
        `INSERT INTO orders(customer_id, attempt_id, request_hash, delivery_address, delivery_time, notes, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6, now() + make_interval(secs => $7))
         ON CONFLICT (customer_id, attempt_id) DO NOTHING
         RETURNING id`,
        [customerId, input.attemptId, input.hash, input.deliveryAddress, input.deliveryTime, input.notes, CHECKOUT_SECONDS],
      );
      if (inserted.rowCount === 0) {
        const existing = await c.query('SELECT id, request_hash FROM orders WHERE customer_id = $1 AND attempt_id = $2', [
          customerId, input.attemptId,
        ]);
        if (existing.rows[0].request_hash !== input.hash) {
          throw new ConflictException({ code: 'attempt_conflict', message: 'This attempt belongs to different order details. Start a new order.' });
        }
        return { orderId: existing.rows[0].id as number, replayed: true };
      }
      const id: number = inserted.rows[0].id;
      const items = await c.query(
        `INSERT INTO order_items(order_id, item_id, quantity, unit_price_tiyn)
         SELECT $1, m.id, l.quantity, m.price_tiyn
         FROM unnest($2::int[], $3::int[]) AS l(item_id, quantity)
         JOIN menu_items m ON m.id = l.item_id AND m.available`,
        [id, input.lines.map((l) => l.itemId), input.lines.map((l) => l.quantity)],
      );
      if (items.rowCount !== input.lines.length) {
        // Throwing rolls the whole transaction back: no half-saved order.
        throw new BadRequestException({ code: 'item_unavailable', message: 'A selected dish is unavailable. Refresh the menu.' });
      }
      await this.event(c, id, null, 'PENDING', user.id);
      return { orderId: id, replayed: false };
    });

    const [row] = await this.load('o.id = $1', [orderId]);
    return { order: this.present(user, row), replayed };
  }

  // ------------------------------------------------------------- checkout

  /** Simulated payment (no real money). Repeating a checkout returns the saved result, it never pays twice. */
  async checkout(user: AuthUser, orderId: number, body: unknown) {
    const outcome = validated(() => validateOutcome((body as { outcome?: unknown } | undefined)?.outcome));
    const customerId = await this.customerId(user);

    const result = await this.db.tx(async (c) => {
      const found = await c.query('SELECT customer_id, status, expires_at <= now() AS expired FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
      const order = found.rows[0];
      if (!order) throw new NotFoundException({ code: 'not_found', message: 'This order was not found.' });
      if (order.customer_id !== customerId) {
        throw new ForbiddenException({ code: 'ownership_denied', message: 'You can view only your own orders.' });
      }
      const paid = await c.query('SELECT 1 FROM payment_attempts WHERE order_id = $1', [orderId]);
      if (paid.rowCount) return { replayed: true, status: order.status as OrderStatus };
      if (order.status !== 'PENDING') throw new ConflictException({ code: 'not_pending', message: 'This order cannot be checked out again.' });

      let payment: 'APPROVED' | 'REJECTED' | 'TIMEOUT' = 'APPROVED';
      let status: OrderStatus = 'CONFIRMED';
      if (order.expired || outcome === 'timeout') {
        payment = 'TIMEOUT';
        status = 'EXPIRED';
      } else if (outcome === 'rejected') {
        payment = 'REJECTED';
        status = 'PAYMENT_REJECTED';
      }

      const amount = await c.query('SELECT COALESCE(SUM(quantity * unit_price_tiyn), 0) AS total FROM order_items WHERE order_id = $1', [orderId]);
      await c.query('INSERT INTO payment_attempts(order_id, outcome, amount_tiyn) VALUES ($1,$2,$3)', [orderId, payment, amount.rows[0].total]);
      await c.query('UPDATE orders SET status = $2 WHERE id = $1', [orderId, status]);
      await this.event(c, orderId, 'PENDING', status, user.id);
      return { replayed: false, status };
    });

    // "Lost reply" demo: the payment IS saved, but the answer never reaches the browser.
    if (!result.replayed && outcome === 'lost_reply' && result.status === 'CONFIRMED') {
      throw new ServiceUnavailableException({
        code: 'confirmation_lost',
        message: 'Confirmation was lost after the order was saved. Press Retry to recover the same order.',
      });
    }
    const [row] = await this.load('o.id = $1', [orderId]);
    return { order: this.present(user, row), replayed: result.replayed };
  }

  // --------------------------------------------------------------- status

  /** Kitchen moves an order one step forward: CONFIRMED -> PREPARING -> READY -> DELIVERED. */
  async changeStatus(user: AuthUser, orderId: number, target: unknown) {
    try {
      await this.db.tx(async (c) => {
        const found = await c.query('SELECT status FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
        const current: OrderStatus | undefined = found.rows[0]?.status;
        if (!current) throw new NotFoundException({ code: 'not_found', message: 'This order was not found.' });
        if (!KITCHEN_VISIBLE.includes(current)) {
          throw new ForbiddenException({ code: 'not_for_kitchen', message: 'This order is not ready for the kitchen.' });
        }
        if (!isKitchenStep(current, target)) {
          throw new ConflictException({
            code: 'invalid_transition',
            message: 'A status can only move to the next step: Confirmed, Preparing, Ready, Delivered.',
          });
        }
        await c.query('UPDATE orders SET status = $2 WHERE id = $1', [orderId, target]);
        await this.event(c, orderId, current, target as OrderStatus, user.id);
      });
    } catch (e) {
      // Second line of defence: the database trigger refuses any illegal change too.
      const err = e as { code?: string; message?: string };
      if (err.code === '23514' && err.message?.startsWith('invalid_transition')) {
        throw new ConflictException({ code: 'invalid_transition', message: 'This status change is not allowed.' });
      }
      throw e;
    }
    const [row] = await this.load('o.id = $1', [orderId]);
    return { order: this.present(user, row) };
  }

  // ------------------------------------------------------------- internal

  /** Orders whose 120-second checkout time has run out become EXPIRED (with a TIMEOUT payment record). */
  async expirePending(): Promise<void> {
    await this.db.pool.query(
      `WITH expired AS (
         UPDATE orders SET status = 'EXPIRED'
         WHERE status = 'PENDING' AND expires_at <= now()
         RETURNING id, customer_id
       ), timeout AS (
         INSERT INTO payment_attempts(order_id, outcome, amount_tiyn)
         SELECT e.id, 'TIMEOUT', COALESCE((SELECT SUM(quantity * unit_price_tiyn) FROM order_items WHERE order_id = e.id), 0)
         FROM expired e
         ON CONFLICT (order_id) DO NOTHING
       )
       INSERT INTO order_events(order_id, from_status, to_status, actor_user_id)
       SELECT e.id, 'PENDING', 'EXPIRED', c.user_id FROM expired e JOIN customers c ON c.id = e.customer_id`,
    );
  }

  private async customerId(user: AuthUser): Promise<number> {
    const { rows } = await this.db.pool.query('SELECT id FROM customers WHERE user_id = $1', [user.id]);
    if (!rows[0]) throw new ForbiddenException({ code: 'role_denied', message: 'Your role cannot perform this action.' });
    return rows[0].id;
  }

  /** 404 if missing, 403 if it belongs to someone else (customer) or is not a paid order (kitchen). */
  private async assertCanRead(user: AuthUser, orderId: number) {
    const { rows } = await this.db.pool.query('SELECT customer_id, status FROM orders WHERE id = $1', [orderId]);
    if (!rows[0]) throw new NotFoundException({ code: 'not_found', message: 'This order was not found.' });
    if (user.role === 'CUSTOMER' && rows[0].customer_id !== (await this.customerId(user))) {
      throw new ForbiddenException({ code: 'ownership_denied', message: 'You can view only your own orders.' });
    }
    if (user.role === 'KITCHEN' && !KITCHEN_VISIBLE.includes(rows[0].status)) {
      throw new ForbiddenException({ code: 'not_for_kitchen', message: 'This order is not ready for the kitchen.' });
    }
  }

  private async load(where: string, params: unknown[]): Promise<OrderRow[]> {
    const { rows } = await this.db.pool.query(
      `SELECT o.id, o.attempt_id, o.status, o.delivery_address, o.delivery_time, o.notes, o.created_at, o.expires_at,
              COALESCE(json_agg(json_build_object('itemId', i.item_id, 'name', m.name, 'quantity', i.quantity, 'unitPriceTiyn', i.unit_price_tiyn)
                               ORDER BY i.item_id) FILTER (WHERE i.item_id IS NOT NULL), '[]') AS items
       FROM orders o
       LEFT JOIN order_items i ON i.order_id = o.id
       LEFT JOIN menu_items m ON m.id = i.item_id
       WHERE ${where}
       GROUP BY o.id
       ORDER BY o.created_at, o.id`,
      params,
    );
    return rows;
  }

  /** What each role is allowed to see. */
  private present(user: AuthUser, row: OrderRow) {
    const itemCount = row.items.reduce((n, i) => n + i.quantity, 0);
    const base = {
      id: row.id,
      status: row.status,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      deliveryTime: row.delivery_time, // null = as soon as possible
      itemCount,
    };
    if (user.role === 'KITCHEN') {
      // Preparation details only: no prices, no customer address.
      return { ...base, notes: row.notes, items: row.items.map(({ itemId, name, quantity }) => ({ itemId, name, quantity })) };
    }
    return {
      ...base,
      attemptId: row.attempt_id,
      deliveryAddress: row.delivery_address,
      notes: row.notes,
      totalTiyn: row.items.reduce((sum, i) => sum + i.quantity * i.unitPriceTiyn, 0),
      items: row.items,
    };
  }

  private event(c: PoolClient, orderId: number, from: string | null, to: string, actorId: number) {
    return c.query('INSERT INTO order_events(order_id, from_status, to_status, actor_user_id) VALUES ($1,$2,$3,$4)', [orderId, from, to, actorId]);
  }
}

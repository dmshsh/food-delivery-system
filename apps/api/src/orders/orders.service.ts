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
import { POINT_TIYN, applicablePoints, maxRedeemablePoints, pointsEarned } from '../domain/bonus';
import { summarise } from '../domain/nutrition';
import { KITCHEN_VISIBLE, OrderStatus, isKitchenStep, isOrderStatus } from '../domain/status';
import {
  ValidationError,
  digitsOnly,
  validateConfirmationCode,
  validateFeedback,
  validateHistoryFilter,
  validateOrderInput,
  validateOutcome,
} from '../domain/validation';

const CHECKOUT_SECONDS = 120;

/** Wrong delivery codes allowed before an order can only be closed by an administrator. */
const MAX_CONFIRMATION_ATTEMPTS = 5;

interface OrderRow {
  id: number;
  attempt_id: string;
  status: OrderStatus;
  delivery_address: string;
  delivery_time: Date | null;
  notes: string;
  created_at: Date;
  expires_at: Date;
  bonus_requested: number;
  bonus_spent: number;
  bonus_earned: number;
  is_group: boolean;
  participants: string[];
  confirmation_code: string | null;
  confirmation_attempts: number;
  confirmed_at: Date | null;
  items: {
    itemId: number;
    name: string;
    quantity: number;
    unitPriceTiyn: number;
    participant: string;
    caloriesKcal: number | null;
    proteinG: number | null;
    fatG: number | null;
    carbsG: number | null;
  }[];
  feedback: { rating: number; comment: string; reply: string; createdAt: string } | null;
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

  /**
   * The order list, narrowed by whatever the history page asked for.
   *
   * The filters are for a customer looking through their own history. The
   * kitchen queue takes the same route but stays limited to paid orders:
   * narrowing is a convenience, the role rule is not.
   */
  async list(user: AuthUser, query: Record<string, unknown> = {}) {
    await this.expirePending();
    const filter = validated(() => validateHistoryFilter(query, isOrderStatus));

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
    if (filter.status) {
      params.push(filter.status);
      where.push(`o.status = $${params.length}`);
    }
    if (filter.from) {
      params.push(filter.from);
      where.push(`o.created_at >= $${params.length}`);
    }
    if (filter.to) {
      // An end date means the whole of that day, which is what someone choosing
      // "to 5 November" means, not "up to the moment that day begins".
      params.push(filter.to);
      where.push(`o.created_at < $${params.length}::timestamptz + interval '1 day'`);
    }
    if (filter.search) {
      // Matched against the order number, the dishes, the note and the address.
      params.push(`%${filter.search.toLowerCase()}%`);
      const like = `$${params.length}`;
      params.push(digitsOnly(filter.search) || '0');
      const digits = `$${params.length}`;
      where.push(`(
        o.id::text = ${digits}
        OR lower(o.notes) LIKE ${like}
        OR lower(o.delivery_address) LIKE ${like}
        OR EXISTS (
          SELECT 1 FROM order_items oi JOIN menu_items mi ON mi.id = oi.item_id
          WHERE oi.order_id = o.id AND lower(mi.name) LIKE ${like}
        )
      )`);
    }

    const rows = await this.load(where.join(' AND '), params);
    return {
      orders: rows.map((r) => this.present(user, r)),
      filter: {
        status: filter.status,
        search: filter.search,
        from: filter.from ? filter.from.toISOString().slice(0, 10) : null,
        to: filter.to ? filter.to.toISOString().slice(0, 10) : null,
      },
    };
  }

  /**
   * "Order this again."
   *
   * A past order is not a shopping list that can simply be replayed: a dish may
   * have been taken off the menu, renamed, or repriced since. So this returns
   * what can be ordered today, what cannot, and what now costs something
   * different, and lets the customer decide before anything goes in the cart.
   */
  async repeat(user: AuthUser, orderId: number) {
    const customerId = await this.customerId(user);
    const found = await this.db.pool.query('SELECT customer_id FROM orders WHERE id = $1', [orderId]);
    if (!found.rows[0]) throw new NotFoundException({ code: 'not_found', message: 'This order was not found.' });
    if (found.rows[0].customer_id !== customerId) {
      throw new ForbiddenException({ code: 'ownership_denied', message: 'You can repeat only your own orders.' });
    }

    const { rows } = await this.db.pool.query(
      `SELECT oi.item_id AS "itemId", oi.quantity, oi.unit_price_tiyn AS "paidPriceTiyn",
              m.name, m.available, m.price_tiyn AS "priceTiyn"
       FROM order_items oi
       LEFT JOIN menu_items m ON m.id = oi.item_id
       WHERE oi.order_id = $1
       ORDER BY oi.item_id`,
      [orderId],
    );

    const lines = rows.map((r) => ({
      itemId: r.itemId,
      name: r.name,
      quantity: r.quantity,
      paidPriceTiyn: Number(r.paidPriceTiyn),
      priceTiyn: r.priceTiyn === null ? null : Number(r.priceTiyn),
      // A dish removed from the menu has no row left to join to.
      available: Boolean(r.available),
      priceChanged: r.priceTiyn !== null && Number(r.priceTiyn) !== Number(r.paidPriceTiyn),
    }));
    const usable = lines.filter((l) => l.available);

    return {
      orderId,
      lines,
      /** What the cart would be filled with. Empty when nothing is on the menu any more. */
      items: usable.map((l) => ({ itemId: l.itemId, quantity: l.quantity })),
      totalTiyn: usable.reduce((sum, l) => sum + l.quantity * (l.priceTiyn ?? 0), 0),
      previousTotalTiyn: lines.reduce((sum, l) => sum + l.quantity * l.paidPriceTiyn, 0),
      unavailable: lines.filter((l) => !l.available).map((l) => l.name ?? `Dish #${l.itemId}`),
      repricedCount: usable.filter((l) => l.priceChanged).length,
    };
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
   *
   * Bonus points are only *reserved* here: the order remembers how many the customer wants
   * to use, and nothing leaves the balance until the payment is actually approved.
   */
  async create(user: AuthUser, body: unknown) {
    const input = validated(() => validateOrderInput(body, new Date()));
    const customerId = await this.customerId(user);

    const { orderId, replayed } = await this.db.tx(async (c) => {
      const inserted = await c.query(
        `INSERT INTO orders(customer_id, attempt_id, request_hash, delivery_address, delivery_time, notes,
                            bonus_requested, is_group, participants, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now() + make_interval(secs => $10))
         ON CONFLICT (customer_id, attempt_id) DO NOTHING
         RETURNING id`,
        [
          customerId,
          input.attemptId,
          input.hash,
          input.deliveryAddress,
          input.deliveryTime,
          input.notes,
          input.bonusPoints,
          input.participants.length > 0,
          input.participants,
          CHECKOUT_SECONDS,
        ],
      );
      if (inserted.rowCount === 0) {
        const existing = await c.query('SELECT id, request_hash FROM orders WHERE customer_id = $1 AND attempt_id = $2', [
          customerId,
          input.attemptId,
        ]);
        if (existing.rows[0].request_hash !== input.hash) {
          throw new ConflictException({
            code: 'attempt_conflict',
            message: 'This attempt belongs to different order details. Start a new order.',
          });
        }
        return { orderId: existing.rows[0].id as number, replayed: true };
      }
      const id: number = inserted.rows[0].id;
      const items = await c.query(
        `INSERT INTO order_items(order_id, item_id, quantity, unit_price_tiyn, participant)
         SELECT $1, m.id, l.quantity, m.price_tiyn, l.participant
         FROM unnest($2::int[], $3::int[], $4::text[]) AS l(item_id, quantity, participant)
         JOIN menu_items m ON m.id = l.item_id AND m.available`,
        [
          id,
          input.lines.map((l) => l.itemId),
          input.lines.map((l) => l.quantity),
          input.lines.map((l) => l.participant),
        ],
      );
      if (items.rowCount !== input.lines.length) {
        // Throwing rolls the whole transaction back: no half-saved order.
        throw new BadRequestException({
          code: 'item_unavailable',
          message: 'A selected dish is unavailable. Refresh the menu.',
        });
      }

      // The requested discount is checked against the real total and the real balance.
      if (input.bonusPoints > 0) {
        const total = await this.totalOf(c, id);
        const balance = await this.balanceOf(c, customerId, false);
        const allowed = maxRedeemablePoints(total, balance);
        if (input.bonusPoints > allowed) {
          throw new BadRequestException({
            code: 'bonus_too_high',
            message: `You can use at most ${allowed} bonus point${allowed === 1 ? '' : 's'} on this order.`,
          });
        }
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
      const found = await c.query(
        'SELECT customer_id, status, bonus_requested, expires_at <= now() AS expired FROM orders WHERE id = $1 FOR UPDATE',
        [orderId],
      );
      const order = found.rows[0];
      if (!order) throw new NotFoundException({ code: 'not_found', message: 'This order was not found.' });
      if (order.customer_id !== customerId) {
        throw new ForbiddenException({ code: 'ownership_denied', message: 'You can view only your own orders.' });
      }
      const paid = await c.query('SELECT 1 FROM payment_attempts WHERE order_id = $1', [orderId]);
      if (paid.rowCount) return { replayed: true, status: order.status as OrderStatus };
      if (order.status !== 'PENDING') {
        throw new ConflictException({ code: 'not_pending', message: 'This order cannot be checked out again.' });
      }

      let payment: 'APPROVED' | 'REJECTED' | 'TIMEOUT' = 'APPROVED';
      let status: OrderStatus = 'CONFIRMED';
      if (order.expired || outcome === 'timeout') {
        payment = 'TIMEOUT';
        status = 'EXPIRED';
      } else if (outcome === 'rejected') {
        payment = 'REJECTED';
        status = 'PAYMENT_REJECTED';
      }

      const total = await this.totalOf(c, orderId);
      let payable = total;

      if (payment === 'APPROVED') {
        // Points move only for a payment that really goes through, and only inside this
        // transaction: the customer row is locked, so two checkouts cannot spend the
        // same point twice.
        const balance = await this.balanceOf(c, customerId, true);
        const spent = applicablePoints(order.bonus_requested, total, balance);
        payable = total - spent * POINT_TIYN;
        const earned = pointsEarned(payable);
        let running = balance;

        if (spent > 0) {
          running -= spent;
          await this.moveBonus(c, customerId, orderId, 'SPENT', -spent, running, `Discount on order #${orderId}`);
        }
        if (earned > 0) {
          running += earned;
          await this.moveBonus(c, customerId, orderId, 'EARNED', earned, running, `Earned on order #${orderId}`);
        }
        if (spent > 0 || earned > 0) {
          await c.query('UPDATE customers SET bonus_points = $2 WHERE id = $1', [customerId, running]);
        }
        await c.query('UPDATE orders SET bonus_spent = $2, bonus_earned = $3 WHERE id = $1', [orderId, spent, earned]);
      }

      await c.query('INSERT INTO payment_attempts(order_id, outcome, amount_tiyn) VALUES ($1,$2,$3)', [
        orderId,
        payment,
        payable,
      ]);
      if (status === 'CONFIRMED') {
        // The delivery code is issued the moment a delivery becomes real, and
        // generated in the database so it never passes through this process.
        await c.query(
          `UPDATE orders SET status = $2, confirmation_code = lpad((floor(random() * 10000))::int::text, 4, '0')
           WHERE id = $1`,
          [orderId, status],
        );
      } else {
        await c.query('UPDATE orders SET status = $2 WHERE id = $1', [orderId, status]);
      }
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

  /**
   * Kitchen moves an order one step forward: CONFIRMED -> PREPARING -> READY -> DELIVERED.
   *
   * The last step is different from the others. "Delivered" is not a statement
   * about the kitchen's work, it is a claim that the food reached the person who
   * paid for it, and the kitchen is not in a position to know that. So that step
   * needs the four-digit code the customer reads out at the door.
   */
  async changeStatus(user: AuthUser, orderId: number, target: unknown, body?: unknown) {
    try {
      const refused = await this.db.tx(async (c) => {
        const found = await c.query(
          'SELECT status, confirmation_code, confirmation_attempts FROM orders WHERE id = $1 FOR UPDATE',
          [orderId],
        );
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

        if (target === 'DELIVERED') {
          const refusal = await this.checkHandover(c, orderId, found.rows[0], body);
          if (refusal) {
            // Returned rather than thrown: throwing here would roll the
            // transaction back, and the count of wrong guesses has to survive.
            // The caller turns this into the error, after the commit.
            return refusal;
          }
          await c.query('UPDATE orders SET status = $2, confirmed_at = now() WHERE id = $1', [orderId, target]);
        } else {
          await c.query('UPDATE orders SET status = $2 WHERE id = $1', [orderId, target]);
        }
        await this.event(c, orderId, current, target as OrderStatus, user.id);
        return null;
      });

      if (refused) {
        throw new ConflictException({
          code: 'bad_confirmation_code',
          message: refused.message,
          attemptsLeft: refused.attemptsLeft,
        });
      }
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

  // ------------------------------------------------------------- feedback

  /** A customer may review their own order, once, and only after it was delivered. */
  async leaveFeedback(user: AuthUser, orderId: number, body: unknown) {
    const input = validated(() => validateFeedback(body));
    const customerId = await this.customerId(user);

    const { rows } = await this.db.pool.query('SELECT customer_id, status FROM orders WHERE id = $1', [orderId]);
    if (!rows[0]) throw new NotFoundException({ code: 'not_found', message: 'This order was not found.' });
    if (rows[0].customer_id !== customerId) {
      throw new ForbiddenException({ code: 'ownership_denied', message: 'You can review only your own orders.' });
    }
    if (rows[0].status !== 'DELIVERED') {
      throw new ConflictException({
        code: 'not_delivered',
        message: 'You can leave a review once the order has been delivered.',
      });
    }

    try {
      await this.db.pool.query(
        'INSERT INTO order_feedback(order_id, customer_id, rating, comment) VALUES ($1,$2,$3,$4)',
        [orderId, customerId, input.rating, input.comment],
      );
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (err.code === '23505') {
        throw new ConflictException({ code: 'feedback_exists', message: 'You have already reviewed this order.' });
      }
      // The database trigger guards the same rule, in case the status changed meanwhile.
      if (err.code === '23514' && err.message?.includes('feedback_not_delivered')) {
        throw new ConflictException({
          code: 'not_delivered',
          message: 'You can leave a review once the order has been delivered.',
        });
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

  /** The order total from the prices stored with the order itself. */
  private async totalOf(c: PoolClient, orderId: number): Promise<number> {
    const { rows } = await c.query(
      'SELECT COALESCE(SUM(quantity * unit_price_tiyn), 0) AS total FROM order_items WHERE order_id = $1',
      [orderId],
    );
    return Number(rows[0].total);
  }

  /** The point balance; `lock` takes the customer row so two checkouts cannot spend it twice. */
  private async balanceOf(c: PoolClient, customerId: number, lock: boolean): Promise<number> {
    const { rows } = await c.query(
      `SELECT bonus_points FROM customers WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
      [customerId],
    );
    return Number(rows[0]?.bonus_points ?? 0);
  }

  private moveBonus(
    c: PoolClient,
    customerId: number,
    orderId: number,
    kind: 'EARNED' | 'SPENT' | 'ADJUSTED',
    points: number,
    balanceAfter: number,
    note: string,
  ) {
    return c.query(
      `INSERT INTO bonus_transactions(customer_id, order_id, kind, points, balance_after, note)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [customerId, orderId, kind, points, balanceAfter, note],
    );
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
              o.bonus_requested, o.bonus_spent, o.bonus_earned,
              o.is_group, o.participants, o.confirmation_code, o.confirmation_attempts, o.confirmed_at,
              COALESCE(json_agg(json_build_object(
                        'itemId', i.item_id, 'name', m.name, 'quantity', i.quantity,
                        'unitPriceTiyn', i.unit_price_tiyn, 'participant', i.participant,
                        'caloriesKcal', m.calories_kcal, 'proteinG', m.protein_g,
                        'fatG', m.fat_g, 'carbsG', m.carbs_g)
                               ORDER BY i.item_id, i.participant) FILTER (WHERE i.item_id IS NOT NULL), '[]') AS items,
              CASE WHEN f.id IS NULL THEN NULL
                   ELSE json_build_object('rating', f.rating, 'comment', f.comment, 'reply', f.reply, 'createdAt', f.created_at)
              END AS feedback
       FROM orders o
       LEFT JOIN order_items i ON i.order_id = o.id
       LEFT JOIN menu_items m ON m.id = i.item_id
       LEFT JOIN order_feedback f ON f.order_id = o.id
       WHERE ${where}
       GROUP BY o.id, f.id
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
      // Preparation details only: no prices, no customer address, no money of any
      // kind. The names in a group order are the exception: they are what the
      // packer writes on each box, and they carry no money with them.
      return {
        ...base,
        notes: row.notes,
        isGroup: row.is_group,
        participants: row.participants ?? [],
        items: row.items.map(({ itemId, name, quantity, participant }) => ({
          itemId,
          name,
          quantity,
          participant,
        })),
        // Whether a code is still owed, never the code itself: the kitchen is the
        // side that has to be told it, and a kitchen that can read it could close
        // an order without ever handing the food over.
        needsConfirmation: row.status === 'READY',
        confirmationAttempts: row.confirmation_attempts,
      };
    }
    const totalTiyn = row.items.reduce((sum, i) => sum + i.quantity * i.unitPriceTiyn, 0);
    // Before the payment the discount is still only a wish, so show the requested points;
    // afterwards show what was really taken.
    const pointsApplied = row.status === 'PENDING' ? row.bonus_requested : row.bonus_spent;
    const discountTiyn = pointsApplied * POINT_TIYN;
    const payableTiyn = Math.max(0, totalTiyn - discountTiyn);
    return {
      ...base,
      attemptId: row.attempt_id,
      deliveryAddress: row.delivery_address,
      notes: row.notes,
      totalTiyn,
      bonusRequested: row.bonus_requested,
      bonusSpent: row.bonus_spent,
      bonusEarned: row.bonus_earned,
      discountTiyn,
      payableTiyn,
      items: row.items,
      feedback: row.feedback,
      isGroup: row.is_group,
      participants: row.participants ?? [],
      split: this.splitBetween(row, payableTiyn),
      nutrition: summarise(
        row.items.map((i) => ({
          quantity: i.quantity,
          caloriesKcal: i.caloriesKcal === null ? null : Number(i.caloriesKcal),
          proteinG: i.proteinG === null ? null : Number(i.proteinG),
          fatG: i.fatG === null ? null : Number(i.fatG),
          carbsG: i.carbsG === null ? null : Number(i.carbsG),
        })),
      ),
      // The customer is the only one who sees the code, which is what makes it
      // worth anything at the door.
      confirmationCode: row.confirmation_code,
      confirmedAt: row.confirmed_at,
    };
  }

  /**
   * The handover: the courier types the code the customer read out.
   *
   * Guesses are counted and run out. Four digits is ten thousand possibilities,
   * which is plenty for a person at a door and nothing at all for a loop, so the
   * limit — not the length — is what makes the code mean anything.
   *
   * Returns `null` when the code is right, or the refusal to raise once the
   * transaction has committed. It must not throw on a wrong code: the enclosing
   * transaction holds `FOR UPDATE` on this order, so the wrong guess has to be
   * counted on that same connection, and a throw would roll the count back with
   * everything else. Counting it on a second connection instead would wait on a
   * lock the caller itself is holding, and wait for ever.
   */
  private async checkHandover(
    c: PoolClient,
    orderId: number,
    row: { confirmation_code: string | null; confirmation_attempts: number },
    body: unknown,
  ): Promise<{ message: string; attemptsLeft: number } | null> {
    if (!row.confirmation_code) {
      // An order from before this rule existed, or one whose code was never
      // issued. Refusing it outright would strand it, so it closes as it used to.
      return null;
    }
    if (row.confirmation_attempts >= MAX_CONFIRMATION_ATTEMPTS) {
      throw new ForbiddenException({
        code: 'confirmation_locked',
        message: 'Too many wrong codes for this order. An administrator has to look at it.',
      });
    }

    // Throws a 400 on its own: nothing has been written yet, so rolling back
    // here costs nothing.
    const given = validated(() => validateConfirmationCode(body));
    if (given === row.confirmation_code) return null;

    await c.query('UPDATE orders SET confirmation_attempts = confirmation_attempts + 1 WHERE id = $1', [orderId]);
    const left = MAX_CONFIRMATION_ATTEMPTS - (row.confirmation_attempts + 1);
    return {
      message:
        left > 0
          ? `That code does not match this order. ${left} attempt${left === 1 ? '' : 's'} left.`
          : 'That code does not match this order, and there are no attempts left.',
      attemptsLeft: Math.max(0, left),
    };
  }

  /**
   * Who owes what in a group order.
   *
   * Each person pays for their own dishes. The discount from bonus points
   * belongs to the customer who placed the order, not to the table, so it is
   * shown separately rather than spread across people who did not earn it.
   */
  private splitBetween(row: OrderRow, payableTiyn: number) {
    if (!row.is_group) return null;
    const people = new Map<string, { name: string; itemCount: number; totalTiyn: number }>();
    for (const name of row.participants ?? []) {
      people.set(name, { name, itemCount: 0, totalTiyn: 0 });
    }
    let unassignedTiyn = 0;
    for (const item of row.items) {
      const amount = item.quantity * item.unitPriceTiyn;
      const person = item.participant ? people.get(item.participant) : undefined;
      if (!person) {
        // A line for nobody, or for someone no longer in the order: shown apart
        // rather than quietly added to the first person on the list.
        unassignedTiyn += amount;
        continue;
      }
      person.itemCount += item.quantity;
      person.totalTiyn += amount;
    }
    const shares = [...people.values()];
    return {
      shares,
      unassignedTiyn,
      // What the person who placed the order actually pays after the discount.
      payableTiyn,
      discountNote: payableTiyn !== shares.reduce((sum, p) => sum + p.totalTiyn, 0) + unassignedTiyn,
    };
  }

  private event(c: PoolClient, orderId: number, from: string | null, to: string, actorId: number) {
    return c.query(
      'INSERT INTO order_events(order_id, from_status, to_status, actor_user_id) VALUES ($1,$2,$3,$4)',
      [orderId, from, to, actorId],
    );
  }
}

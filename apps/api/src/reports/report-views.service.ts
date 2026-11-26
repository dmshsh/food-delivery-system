import { BadRequestException, Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { OrdersService } from '../orders/orders.service';
import type { ChartQuery } from '../domain/validation';

/**
 * The three reports added for the second stage of the accounting work.
 *
 * They answer what the single order list cannot: how trade moves over time,
 * which dishes carry it, and who the regular customers are. All three count
 * only approved payments, because an order that was refused or ran out of time
 * is not trade, it is an attempt.
 *
 * Each takes the same optional date range and each can be downloaded as CSV,
 * since a report that cannot leave the screen ends up retyped into a
 * spreadsheet by hand.
 */
@Injectable()
export class ReportViewsService {
  constructor(private readonly db: DbService, private readonly orders: OrdersService) {}

  /** Start and end of the range. Both sides optional; an unreadable date is an error, not a shrug. */
  private range(from?: string, to?: string): [Date | null, Date | null] {
    const parse = (value: string | undefined, field: string): Date | null => {
      if (!value) return null;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        throw new BadRequestException({ code: 'bad_date', message: `Enter a valid ${field} date.` });
      }
      return date;
    };
    const start = parse(from, 'start');
    const end = parse(to, 'end');
    if (start && end && start > end) {
      throw new BadRequestException({ code: 'bad_range', message: 'The start date must come before the end date.' });
    }
    return [start, end];
  }

  /** Money and orders per day, newest first. Days without trade simply do not appear. */
  async daily(from?: string, to?: string) {
    await this.orders.expirePending();
    const [start, end] = this.range(from, to);
    const { rows } = await this.db.pool.query(
      `SELECT to_char(date_trunc('day', o.created_at), 'YYYY-MM-DD') AS day,
              COUNT(DISTINCT o.id)                   AS orders,
              COALESCE(SUM(p.amount_tiyn), 0)        AS "paidTiyn",
              COALESCE(SUM(o.bonus_spent) * 100, 0)  AS "discountTiyn",
              COALESCE(SUM(o.bonus_earned), 0)       AS "pointsEarned",
              COUNT(DISTINCT o.customer_id)          AS customers
       FROM orders o
       JOIN payment_attempts p ON p.order_id = o.id AND p.outcome = 'APPROVED'
       WHERE ($1::timestamptz IS NULL OR o.created_at >= $1)
         AND ($2::timestamptz IS NULL OR o.created_at < $2::timestamptz + interval '1 day')
       GROUP BY 1
       ORDER BY 1 DESC`,
      [start, end],
    );
    const days = rows.map((r) => ({
      day: r.day as string,
      orders: Number(r.orders),
      paidTiyn: Number(r.paidTiyn),
      discountTiyn: Number(r.discountTiyn),
      pointsEarned: Number(r.pointsEarned),
      customers: Number(r.customers),
      averageOrderTiyn: Number(r.orders) ? Math.round(Number(r.paidTiyn) / Number(r.orders)) : 0,
    }));
    const paid = days.reduce((sum, d) => sum + d.paidTiyn, 0);
    const orders = days.reduce((sum, d) => sum + d.orders, 0);
    return {
      days,
      summary: {
        dayCount: days.length,
        orderCount: orders,
        paidTiyn: paid,
        discountTiyn: days.reduce((sum, d) => sum + d.discountTiyn, 0),
        averageOrderTiyn: orders ? Math.round(paid / orders) : 0,
        averageDayTiyn: days.length ? Math.round(paid / days.length) : 0,
        bestDay: days.reduce<{ day: string; paidTiyn: number } | null>(
          (best, d) => (!best || d.paidTiyn > best.paidTiyn ? { day: d.day, paidTiyn: d.paidTiyn } : best),
          null,
        ),
      },
    };
  }

  /**
   * What sells.
   *
   * Revenue per dish uses the price stored with each order, not today's menu
   * price: last month's sales happened at last month's prices, and restating
   * them at today's would invent money that never changed hands.
   */
  async dishes(from?: string, to?: string) {
    await this.orders.expirePending();
    const [start, end] = this.range(from, to);
    const { rows } = await this.db.pool.query(
      `SELECT m.id, m.name, m.category, m.available, m.price_tiyn AS "currentPriceTiyn",
              COALESCE(SUM(oi.quantity), 0)                      AS quantity,
              COALESCE(SUM(oi.quantity * oi.unit_price_tiyn), 0) AS "revenueTiyn",
              COUNT(DISTINCT o.id)                               AS orders
       FROM menu_items m
       LEFT JOIN order_items oi ON oi.item_id = m.id
       LEFT JOIN orders o ON o.id = oi.order_id
            AND EXISTS (SELECT 1 FROM payment_attempts p WHERE p.order_id = o.id AND p.outcome = 'APPROVED')
            AND ($1::timestamptz IS NULL OR o.created_at >= $1)
            AND ($2::timestamptz IS NULL OR o.created_at < $2::timestamptz + interval '1 day')
       GROUP BY m.id
       ORDER BY SUM(oi.quantity * oi.unit_price_tiyn) DESC NULLS LAST, m.name`,
      [start, end],
    );
    const dishes = rows.map((r) => ({
      id: r.id as number,
      name: r.name as string,
      category: r.category as string,
      available: r.available as boolean,
      currentPriceTiyn: Number(r.currentPriceTiyn),
      quantity: Number(r.quantity),
      revenueTiyn: Number(r.revenueTiyn),
      orders: Number(r.orders),
    }));
    const revenue = dishes.reduce((sum, d) => sum + d.revenueTiyn, 0);
    return {
      dishes: dishes.map((d) => ({
        ...d,
        // The share of all money this one dish brought in.
        sharePercent: revenue ? Math.round((d.revenueTiyn / revenue) * 1000) / 10 : 0,
      })),
      summary: {
        dishCount: dishes.length,
        soldCount: dishes.filter((d) => d.quantity > 0).length,
        neverOrdered: dishes.filter((d) => d.quantity === 0).map((d) => d.name),
        totalQuantity: dishes.reduce((sum, d) => sum + d.quantity, 0),
        revenueTiyn: revenue,
      },
    };
  }

  /** Who orders, how often, and how happy they were about it. */
  async customers(from?: string, to?: string) {
    await this.orders.expirePending();
    const [start, end] = this.range(from, to);
    const { rows } = await this.db.pool.query(
      `SELECT c.id, u.full_name AS "fullName", u.email, c.bonus_points AS "bonusPoints",
              COUNT(DISTINCT o.id)             AS orders,
              COALESCE(SUM(p.amount_tiyn), 0)  AS "paidTiyn",
              MAX(o.created_at)                AS "lastOrderAt",
              ROUND(AVG(f.rating)::numeric, 2) AS "averageRating",
              COUNT(f.id)                      AS reviews
       FROM customers c
       JOIN users u ON u.id = c.user_id
       LEFT JOIN orders o ON o.customer_id = c.id
            AND ($1::timestamptz IS NULL OR o.created_at >= $1)
            AND ($2::timestamptz IS NULL OR o.created_at < $2::timestamptz + interval '1 day')
       LEFT JOIN payment_attempts p ON p.order_id = o.id AND p.outcome = 'APPROVED'
       LEFT JOIN order_feedback f ON f.order_id = o.id
       GROUP BY c.id, u.full_name, u.email, c.bonus_points
       ORDER BY COALESCE(SUM(p.amount_tiyn), 0) DESC, u.full_name`,
      [start, end],
    );
    const customers = rows.map((r) => ({
      id: r.id as number,
      fullName: r.fullName as string,
      email: r.email as string,
      bonusPoints: Number(r.bonusPoints ?? 0),
      orders: Number(r.orders),
      paidTiyn: Number(r.paidTiyn),
      lastOrderAt: r.lastOrderAt as Date | null,
      averageRating: r.averageRating === null ? null : Number(r.averageRating),
      reviews: Number(r.reviews),
      averageOrderTiyn: Number(r.orders) ? Math.round(Number(r.paidTiyn) / Number(r.orders)) : 0,
    }));
    const active = customers.filter((c) => c.orders > 0);
    return {
      customers,
      summary: {
        customerCount: customers.length,
        activeCount: active.length,
        returningCount: active.filter((c) => c.orders > 1).length,
        paidTiyn: active.reduce((sum, c) => sum + c.paidTiyn, 0),
        averagePerCustomerTiyn: active.length
          ? Math.round(active.reduce((sum, c) => sum + c.paidTiyn, 0) / active.length)
          : 0,
      },
    };
  }


  /**
   * One line for a chart: a metric over time, in equal buckets.
   *
   * Two things make this different from the daily report, which already returns
   * numbers per day.
   *
   * First, a chart must not skip empty buckets. The daily report leaves out days
   * with no trade, which is right for a table and wrong for a line: a quiet
   * Sunday between two busy days has to appear as a dip, not vanish and make
   * Monday look adjacent to Saturday. So the range is generated first and the
   * takings are joined onto it.
   *
   * Second, a chart needs a range even when nothing was asked for. Without one
   * the series would start at the first order ever placed and the interesting
   * part would be a few pixels wide, so it defaults to the last 30 days.
   */
  async chart(query: ChartQuery) {
    await this.orders.expirePending();

    const to = query.to ?? new Date();
    const from = query.from ?? new Date(to.getTime() - 29 * 24 * 3600 * 1000);

    // generate_series builds the buckets; the orders are joined onto them, so a
    // bucket with no trade is a zero rather than a missing point.
    const { rows } = await this.db.pool.query(
      `WITH buckets AS (
         SELECT generate_series(
           date_trunc($3, $1::timestamptz),
           date_trunc($3, $2::timestamptz),
           ('1 ' || $3)::interval
         ) AS bucket
       ),
       paid AS (
         SELECT date_trunc($3, o.created_at) AS bucket,
                COALESCE(SUM(p.amount_tiyn), 0) AS paid_tiyn,
                COUNT(DISTINCT o.id)            AS orders,
                COUNT(DISTINCT o.customer_id)   AS customers
         FROM orders o
         JOIN payment_attempts p ON p.order_id = o.id AND p.outcome = 'APPROVED'
         WHERE o.created_at >= date_trunc($3, $1::timestamptz)
           AND o.created_at < date_trunc($3, $2::timestamptz) + ('1 ' || $3)::interval
         GROUP BY 1
       )
       SELECT to_char(b.bucket, 'YYYY-MM-DD')     AS bucket,
              COALESCE(p.paid_tiyn, 0)            AS "paidTiyn",
              COALESCE(p.orders, 0)               AS orders,
              COALESCE(p.customers, 0)            AS customers
       FROM buckets b
       LEFT JOIN paid p ON p.bucket = b.bucket
       ORDER BY b.bucket`,
      [from, to, query.bucket],
    );

    const points = rows.map((r) => {
      const paidTiyn = Number(r.paidTiyn);
      const orders = Number(r.orders);
      const value =
        query.metric === 'revenue'
          ? paidTiyn
          : query.metric === 'orders'
            ? orders
            : query.metric === 'customers'
              ? Number(r.customers)
              : // averageOrder: a bucket with no orders has no average, and
                // showing zero would drag the line down as if the average had
                // fallen rather than there being nothing to average.
                orders > 0
                ? Math.round(paidTiyn / orders)
                : null;
      return {
        bucket: r.bucket as string,
        value,
        paidTiyn,
        orders,
        customers: Number(r.customers),
      };
    });

    const present = points.filter((p) => p.value !== null).map((p) => p.value as number);
    const total = points.reduce((sum, p) => sum + p.paidTiyn, 0);
    const orderCount = points.reduce((sum, p) => sum + p.orders, 0);

    return {
      metric: query.metric,
      bucket: query.bucket,
      /** Money metrics are in tiyn and the page formats them; counts are plain. */
      unit: query.metric === 'revenue' || query.metric === 'averageOrder' ? 'tiyn' : 'count',
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      points,
      summary: {
        bucketCount: points.length,
        // Worked out here rather than in the browser so the figure under the
        // chart and the chart itself can never disagree.
        max: present.length ? Math.max(...present) : 0,
        min: present.length ? Math.min(...present) : 0,
        average: present.length ? Math.round(present.reduce((a, b) => a + b, 0) / present.length) : 0,
        totalPaidTiyn: total,
        orderCount,
      },
    };
  }

  /** Any of the three as CSV, chosen by name. */
  async csv(kind: 'daily' | 'dishes' | 'customers', from?: string, to?: string): Promise<string> {
    const money = (tiyn: number) => (tiyn / 100).toFixed(2);

    if (kind === 'daily') {
      const { days } = await this.daily(from, to);
      return toCsv(
        ['day', 'orders', 'customers', 'paid_kzt', 'bonus_discount_kzt', 'points_earned', 'average_order_kzt'],
        days.map((d) => [
          d.day, d.orders, d.customers, money(d.paidTiyn), money(d.discountTiyn), d.pointsEarned, money(d.averageOrderTiyn),
        ]),
      );
    }
    if (kind === 'dishes') {
      const { dishes } = await this.dishes(from, to);
      return toCsv(
        ['dish_id', 'name', 'category', 'available', 'quantity_sold', 'orders', 'revenue_kzt', 'share_percent', 'current_price_kzt'],
        dishes.map((d) => [
          d.id, d.name, d.category, d.available, d.quantity, d.orders, money(d.revenueTiyn), d.sharePercent, money(d.currentPriceTiyn),
        ]),
      );
    }
    const { customers } = await this.customers(from, to);
    return toCsv(
      ['customer_id', 'name', 'email', 'orders', 'paid_kzt', 'average_order_kzt', 'bonus_points', 'reviews', 'average_rating', 'last_order_at'],
      customers.map((c) => [
        c.id, c.fullName, c.email, c.orders, money(c.paidTiyn), money(c.averageOrderTiyn),
        c.bonusPoints, c.reviews, c.averageRating ?? '', c.lastOrderAt ? new Date(c.lastOrderAt).toISOString() : '',
      ]),
    );
  }
}

/**
 * Rows into CSV.
 *
 * A dish called "Tea, lemon" would otherwise split itself across two columns,
 * so any value carrying a comma, a quote or a line break is quoted, and quotes
 * inside it are doubled, which is what every spreadsheet expects.
 */
export function toCsv(header: string[], rows: (string | number | boolean | null)[][]): string {
  const cell = (value: string | number | boolean | null): string => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [header.join(','), ...rows.map((row) => row.map(cell).join(','))].join('\n') + '\n';
}

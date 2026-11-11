import { BadRequestException, Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { POINT_TIYN } from '../domain/bonus';
import { isOrderStatus } from '../domain/status';
import { OrdersService } from '../orders/orders.service';

export type ReportRow = {
  id: number;
  createdAt: Date;
  status: string;
  itemCount: number;
  totalTiyn: number;
  bonusSpent: number;
  bonusEarned: number;
  discountTiyn: number;
  paidTiyn: number;
  paymentOutcome: string;
  rating: number | null;
};

@Injectable()
export class ReportsService {
  constructor(private readonly db: DbService, private readonly orders: OrdersService) {}

  /**
   * Orders with item counts and totals. Totals use the prices saved with each order, not
   * today's menu. Since bonus points can pay part of an order, the report keeps the list
   * price and the money actually received apart: `totalTiyn` is what the food cost,
   * `paidTiyn` is what reached the till.
   */
  async report(status?: string) {
    await this.orders.expirePending();
    if (status && !isOrderStatus(status)) {
      throw new BadRequestException({ code: 'bad_status', message: 'Choose a valid order status.' });
    }
    const { rows } = await this.db.pool.query<ReportRow>(
      `SELECT o.id, o.created_at AS "createdAt", o.status,
              SUM(i.quantity) AS "itemCount",
              SUM(i.quantity * i.unit_price_tiyn) AS "totalTiyn",
              o.bonus_spent AS "bonusSpent",
              o.bonus_earned AS "bonusEarned",
              o.bonus_spent * ${POINT_TIYN} AS "discountTiyn",
              COALESCE(p.amount_tiyn, 0) AS "paidTiyn",
              COALESCE(p.outcome, 'NOT_COMPLETED') AS "paymentOutcome",
              f.rating AS "rating"
       FROM orders o
       JOIN order_items i ON i.order_id = o.id
       LEFT JOIN payment_attempts p ON p.order_id = o.id
       LEFT JOIN order_feedback f ON f.order_id = o.id
       WHERE ($1::text IS NULL OR o.status = $1)
       GROUP BY o.id, p.outcome, p.amount_tiyn, f.rating
       ORDER BY o.created_at, o.id`,
      [status ?? null],
    );
    const approved = rows.filter((r) => r.paymentOutcome === 'APPROVED');
    const rated = rows.filter((r) => r.rating !== null);
    return {
      orders: rows,
      summary: {
        orderCount: rows.length,
        approvedOrderCount: approved.length,
        // The list price of everything that was paid for...
        approvedTotalTiyn: approved.reduce((sum, r) => sum + r.totalTiyn, 0),
        // ...and the money actually received, after bonus discounts.
        approvedPaidTiyn: approved.reduce((sum, r) => sum + r.paidTiyn, 0),
        bonusDiscountTiyn: approved.reduce((sum, r) => sum + r.discountTiyn, 0),
        bonusEarnedPoints: approved.reduce((sum, r) => sum + r.bonusEarned, 0),
        ratedOrderCount: rated.length,
        averageRating: rated.length
          ? Math.round((rated.reduce((sum, r) => sum + (r.rating ?? 0), 0) / rated.length) * 100) / 100
          : 0,
      },
    };
  }

  async csv(status?: string): Promise<string> {
    const { orders } = await this.report(status);
    const lines = ['order_id,created_at,status,item_count,total_kzt,bonus_discount_kzt,paid_kzt,payment,rating'];
    for (const r of orders) {
      lines.push(
        [
          r.id,
          new Date(r.createdAt).toISOString(),
          r.status,
          r.itemCount,
          (r.totalTiyn / 100).toFixed(2),
          (r.discountTiyn / 100).toFixed(2),
          (r.paidTiyn / 100).toFixed(2),
          r.paymentOutcome,
          r.rating ?? '',
        ].join(','),
      );
    }
    return lines.join('\n') + '\n';
  }
}

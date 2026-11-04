import { BadRequestException, Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { isOrderStatus } from '../domain/status';
import { OrdersService } from '../orders/orders.service';

export type ReportRow = {
  id: number;
  createdAt: Date;
  status: string;
  itemCount: number;
  totalTiyn: number;
  paymentOutcome: string;
};

@Injectable()
export class ReportsService {
  constructor(private readonly db: DbService, private readonly orders: OrdersService) {}

  /** Orders with item counts and totals. Totals use the prices saved with each order, not today's menu. */
  async report(status?: string) {
    await this.orders.expirePending();
    if (status && !isOrderStatus(status)) throw new BadRequestException({ code: 'bad_status', message: 'Choose a valid order status.' });
    const { rows } = await this.db.pool.query<ReportRow>(
      `SELECT o.id, o.created_at AS "createdAt", o.status,
              SUM(i.quantity) AS "itemCount",
              SUM(i.quantity * i.unit_price_tiyn) AS "totalTiyn",
              COALESCE(p.outcome, 'NOT_COMPLETED') AS "paymentOutcome"
       FROM orders o
       JOIN order_items i ON i.order_id = o.id
       LEFT JOIN payment_attempts p ON p.order_id = o.id
       WHERE ($1::text IS NULL OR o.status = $1)
       GROUP BY o.id, p.outcome
       ORDER BY o.created_at, o.id`,
      [status ?? null],
    );
    const approved = rows.filter((r) => r.paymentOutcome === 'APPROVED');
    return {
      orders: rows,
      summary: {
        orderCount: rows.length,
        approvedOrderCount: approved.length,
        approvedTotalTiyn: approved.reduce((sum, r) => sum + r.totalTiyn, 0),
      },
    };
  }

  async csv(status?: string): Promise<string> {
    const { orders } = await this.report(status);
    const lines = ['order_id,created_at,status,item_count,total_kzt,payment'];
    for (const r of orders) {
      lines.push([r.id, new Date(r.createdAt).toISOString(), r.status, r.itemCount, (r.totalTiyn / 100).toFixed(2), r.paymentOutcome].join(','));
    }
    return lines.join('\n') + '\n';
  }
}

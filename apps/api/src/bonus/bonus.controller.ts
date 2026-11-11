import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, Roles } from '../auth/roles.decorator';
import { AuthUser } from '../auth/types';
import { DbService } from '../db/db.service';
import { EARN_RATE, MAX_REDEEM_SHARE, POINT_TIYN } from '../domain/bonus';

/**
 * The customer's own point balance and the history behind it.
 * Points are written only by the checkout transaction in OrdersService; this
 * controller never changes anything, it only reads.
 */
@Controller('bonus')
@UseGuards(AuthGuard)
@Roles('CUSTOMER')
export class BonusController {
  constructor(private readonly db: DbService) {}

  @Get()
  async mine(@CurrentUser() user: AuthUser) {
    const customer = await this.db.pool.query('SELECT id, bonus_points FROM customers WHERE user_id = $1', [user.id]);
    if (!customer.rows[0]) {
      throw new ForbiddenException({ code: 'role_denied', message: 'Your role cannot perform this action.' });
    }
    const { id, bonus_points: balance } = customer.rows[0];
    const { rows: history } = await this.db.pool.query(
      `SELECT id, order_id AS "orderId", kind, points, balance_after AS "balanceAfter", note,
              created_at AS "createdAt"
       FROM bonus_transactions WHERE customer_id = $1
       ORDER BY created_at DESC, id DESC LIMIT 50`,
      [id],
    );
    const earned = history.filter((h) => h.points > 0).reduce((sum, h) => sum + h.points, 0);
    const spent = history.filter((h) => h.points < 0).reduce((sum, h) => sum - h.points, 0);
    return {
      balance: Number(balance),
      history,
      totals: { earned, spent },
      rules: {
        pointTiyn: POINT_TIYN,
        earnPercent: Math.round(EARN_RATE * 100),
        maxRedeemPercent: Math.round(MAX_REDEEM_SHARE * 100),
      },
    };
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../auth/types';
import { DbService } from '../db/db.service';
import { ValidationError, validateReply } from '../domain/validation';

export interface FeedbackSummary {
  count: number;
  average: number;
  unanswered: number;
  byRating: Record<string, number>;
}

@Injectable()
export class FeedbackService {
  constructor(private readonly db: DbService) {}

  /** All reviews with the numbers the restaurant actually looks at. */
  async list(rating?: string) {
    let filter: number | null = null;
    if (rating) {
      const parsed = Number(rating);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
        throw new BadRequestException({ code: 'bad_rating', message: 'Filter by a rating from 1 to 5.' });
      }
      filter = parsed;
    }

    const { rows } = await this.db.pool.query(
      `SELECT f.id, f.order_id AS "orderId", f.rating, f.comment, f.reply,
              f.created_at AS "createdAt", f.replied_at AS "repliedAt",
              u.full_name AS "customerName", r.full_name AS "repliedByName"
       FROM order_feedback f
       JOIN customers c ON c.id = f.customer_id
       JOIN users u ON u.id = c.user_id
       LEFT JOIN users r ON r.id = f.replied_by
       WHERE ($1::int IS NULL OR f.rating = $1)
       ORDER BY f.created_at DESC, f.id DESC`,
      [filter],
    );

    // The summary always describes ALL reviews, not only the filtered ones:
    // a rating filter should not change the restaurant's overall score.
    const stats = await this.db.pool.query(
      `SELECT rating, COUNT(*) AS n, COUNT(*) FILTER (WHERE reply = '') AS unanswered
       FROM order_feedback GROUP BY rating`,
    );
    const byRating: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    let count = 0;
    let weighted = 0;
    let unanswered = 0;
    for (const row of stats.rows) {
      const n = Number(row.n);
      byRating[String(row.rating)] = n;
      count += n;
      weighted += n * Number(row.rating);
      unanswered += Number(row.unanswered);
    }
    const summary: FeedbackSummary = {
      count,
      average: count ? Math.round((weighted / count) * 100) / 100 : 0,
      unanswered,
      byRating,
    };
    return { feedback: rows, summary };
  }

  /** The restaurant's public answer under a review. */
  async reply(user: AuthUser, feedbackId: number, body: unknown) {
    let text: string;
    try {
      text = validateReply(body);
    } catch (e) {
      if (e instanceof ValidationError) throw new BadRequestException({ code: e.code, message: e.message });
      throw e;
    }
    const { rows } = await this.db.pool.query(
      `UPDATE order_feedback SET reply = $2, replied_by = $3, replied_at = now()
       WHERE id = $1
       RETURNING id, order_id AS "orderId", rating, comment, reply, replied_at AS "repliedAt"`,
      [feedbackId, text, user.id],
    );
    if (!rows[0]) throw new NotFoundException({ code: 'not_found', message: 'This review was not found.' });
    return { feedback: rows[0] };
  }
}

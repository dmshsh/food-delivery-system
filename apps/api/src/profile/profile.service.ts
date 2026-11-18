import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthUser } from '../auth/types';
import { DbService } from '../db/db.service';
import { ValidationError, validateLanguage, validateProfile } from '../domain/validation';
import { SecurityService } from '../security/security.service';
import { UniquenessService } from '../uniqueness/uniqueness.service';

function validated<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof ValidationError) throw new BadRequestException({ code: e.code, message: e.message });
    throw e;
  }
}

/**
 * "My profile": what a person may change about themselves.
 *
 * Deliberately not on the list: the email, which identifies the account and is
 * how a reset link finds it, and the role, which is the administrator's to give.
 * Both have their own, separate paths.
 *
 * Staff have a name and a language; only customers have a phone and an address,
 * because only they receive deliveries.
 */
@Injectable()
export class ProfileService {
  constructor(
    private readonly db: DbService,
    private readonly security: SecurityService,
    private readonly unique: UniquenessService,
  ) {}

  async read(user: AuthUser) {
    const { rows } = await this.db.pool.query(
      `SELECT u.id, u.email, u.full_name AS "fullName", u.role, u.preferred_language AS "language",
              u.password_changed_at AS "passwordChangedAt",
              c.phone, c.address, c.bonus_points AS "bonusPoints",
              (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS "orderCount",
              (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.status = 'DELIVERED') AS "deliveredCount",
              (SELECT COALESCE(SUM(p.amount_tiyn), 0) FROM orders o
                 JOIN payment_attempts p ON p.order_id = o.id AND p.outcome = 'APPROVED'
                WHERE o.customer_id = c.id) AS "spentTiyn"
       FROM users u
       LEFT JOIN customers c ON c.user_id = u.id
       WHERE u.id = $1`,
      [user.id],
    );
    const row = rows[0];
    return {
      profile: {
        ...row,
        bonusPoints: row.bonusPoints === null ? null : Number(row.bonusPoints),
        orderCount: Number(row.orderCount ?? 0),
        deliveredCount: Number(row.deliveredCount ?? 0),
        spentTiyn: Number(row.spentTiyn ?? 0),
      },
    };
  }

  async update(user: AuthUser, body: unknown, ip: string) {
    const input = validated(() => validateProfile(body));
    const customer = await this.db.pool.query('SELECT id FROM customers WHERE user_id = $1', [user.id]);
    const customerId: number | undefined = customer.rows[0]?.id;

    // A phone number belongs to one account, so moving one to this profile has
    // to be refused if another account already holds it — except when it is the
    // number this profile already has.
    if (customerId) await this.unique.assertPhoneFree(input.phone, customerId);

    await this.unique.guard(() =>
      this.db.tx(async (c) => {
        await c.query('UPDATE users SET full_name = $2, preferred_language = $3 WHERE id = $1', [
          user.id,
          input.fullName,
          input.language,
        ]);
        if (customerId) {
          await c.query('UPDATE customers SET phone = $2, address = $3 WHERE id = $1', [
            customerId,
            input.phone,
            input.address,
          ]);
        }
      }),
    );

    await this.security.log({
      kind: 'PROFILE_UPDATED',
      userId: user.id,
      email: user.email,
      ip,
      detail: `name, ${customerId ? 'phone, address, ' : ''}language ${input.language}`,
    });
    return this.read(user);
  }

  /**
   * Switching language on its own.
   *
   * Separate from the profile form because the language picker sits in the page
   * header: switching it must not demand a phone number and an address first.
   */
  async setLanguage(user: AuthUser, body: unknown) {
    const language = validated(() => validateLanguage((body as { language?: unknown } | undefined)?.language));
    await this.db.pool.query('UPDATE users SET preferred_language = $2 WHERE id = $1', [user.id, language]);
    return { language };
  }
}

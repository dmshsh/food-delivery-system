import { ConflictException, Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DbService } from '../db/db.service';
import { phoneDigits } from '../domain/validation';

/**
 * Everything the system insists is unique, in one place.
 *
 * Each rule is enforced twice. The database holds a unique index, which is the
 * guarantee — it holds even against a direct `INSERT` and against two requests
 * arriving in the same millisecond. This service checks the same rule first, so
 * the person gets "that phone number already belongs to another account"
 * instead of a constraint name, and so the check still works on a database
 * where an index could not be created because older rows already broke it.
 *
 * The order matters: ask first for a good message, let the index be right.
 */

/** Every unique rule, with the message a person should see when they hit it. */
const RULES: Record<string, { code: string; message: string }> = {
  users_email_lower_key: {
    code: 'email_taken',
    message: 'This email is already registered. Please sign in.',
  },
  customers_phone_digits_key: {
    code: 'phone_taken',
    message: 'This phone number already belongs to another account.',
  },
  menu_items_name_lower_key: {
    code: 'dish_name_taken',
    message: 'A dish with this name already exists. Choose another name.',
  },
  orders_customer_id_attempt_id_key: {
    code: 'attempt_conflict',
    message: 'This order attempt was already used. Start a new order.',
  },
  payment_attempts_order_id_key: {
    code: 'already_paid',
    message: 'This order has already been paid for.',
  },
  order_feedback_order_id_key: {
    code: 'feedback_exists',
    message: 'You have already reviewed this order.',
  },
  customers_user_id_key: {
    code: 'profile_exists',
    message: 'This account already has a customer profile.',
  },
  blocked_ips_pkey: {
    code: 'ip_already_blocked',
    message: 'This address is already blocked.',
  },
  password_resets_token_hash_key: {
    code: 'reset_exists',
    message: 'Please ask for a new reset link.',
  },
};

@Injectable()
export class UniquenessService {
  constructor(private readonly db: DbService) {}

  /** No two accounts share an email, whatever the capitalisation. */
  async assertEmailFree(email: string, exceptUserId?: number): Promise<void> {
    const { rows } = await this.db.pool.query(
      `SELECT id FROM users WHERE lower(email) = lower($1) AND ($2::int IS NULL OR id <> $2) LIMIT 1`,
      [email, exceptUserId ?? null],
    );
    if (rows[0]) this.refuse('users_email_lower_key');
  }

  /**
   * No two customers share a phone number.
   *
   * Compared by digits only, so a number written differently is still the same
   * number — exactly what `phone_digits()` does in the database.
   */
  async assertPhoneFree(phone: string, exceptCustomerId?: number, client?: PoolClient): Promise<void> {
    const runner = client ?? this.db.pool;
    const { rows } = await runner.query(
      `SELECT id FROM customers
       WHERE regexp_replace(phone, '[^0-9]', '', 'g') = $1 AND ($2::int IS NULL OR id <> $2)
       LIMIT 1`,
      [phoneDigits(phone), exceptCustomerId ?? null],
    );
    if (rows[0]) this.refuse('customers_phone_digits_key');
  }

  /** No two dishes share a name: a report that lists "Lemon tea" twice means nothing. */
  async assertDishNameFree(name: string, exceptId?: number): Promise<void> {
    const { rows } = await this.db.pool.query(
      `SELECT id FROM menu_items WHERE lower(btrim(name)) = lower(btrim($1)) AND ($2::int IS NULL OR id <> $2) LIMIT 1`,
      [name, exceptId ?? null],
    );
    if (rows[0]) this.refuse('menu_items_name_lower_key');
  }

  /**
   * Turns a PostgreSQL unique violation into the same answer the check above
   * would have given. This is the path taken when two requests race: both pass
   * the check, and the index refuses the loser.
   */
  translate(error: unknown): never {
    const pg = error as { code?: string; constraint?: string };
    if (pg?.code === '23505') {
      const rule = pg.constraint ? RULES[pg.constraint] : undefined;
      if (rule) throw new ConflictException(rule);
      throw new ConflictException({
        code: 'duplicate',
        message: 'Something with these details already exists.',
      });
    }
    throw error as Error;
  }

  /** True when this error is a unique violation this service has a message for. */
  isUniqueViolation(error: unknown, constraint?: string): boolean {
    const pg = error as { code?: string; constraint?: string };
    if (pg?.code !== '23505') return false;
    return constraint ? pg.constraint === constraint : true;
  }

  /** Runs `fn`, turning any unique violation inside it into a readable 409. */
  async guard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (this.isUniqueViolation(error)) this.translate(error);
      throw error;
    }
  }

  private refuse(rule: string): never {
    throw new ConflictException(RULES[rule]);
  }
}

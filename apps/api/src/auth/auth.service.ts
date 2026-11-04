import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { DbService } from '../db/db.service';
import { ValidationError, validateRegistration } from '../domain/validation';
import { AuthUser, Role } from './types';

@Injectable()
export class AuthService {
  constructor(private readonly db: DbService, private readonly jwt: JwtService) {}

  /** Registration always creates a CUSTOMER. Staff accounts exist only in the database seed. */
  async register(body: unknown): Promise<{ user: AuthUser; token: string }> {
    let input;
    try {
      input = validateRegistration(body);
    } catch (e) {
      if (e instanceof ValidationError) throw new BadRequestException({ code: e.code, message: e.message });
      throw e;
    }
    const hash = await bcrypt.hash(input.password, 10);
    try {
      const id = await this.db.tx(async (client) => {
        const u = await client.query(
          `INSERT INTO users(email, password_hash, full_name, role) VALUES ($1,$2,$3,'CUSTOMER') RETURNING id`,
          [input.email, hash, input.fullName],
        );
        await client.query('INSERT INTO customers(user_id, phone, address) VALUES ($1,$2,$3)', [
          u.rows[0].id, input.phone, input.address,
        ]);
        return u.rows[0].id as number;
      });
      const user: AuthUser = { id, email: input.email, fullName: input.fullName, role: 'CUSTOMER' };
      return { user, token: await this.sign(user) };
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        throw new ConflictException({ code: 'email_taken', message: 'This email is already registered. Please sign in.' });
      }
      throw e;
    }
  }

  async login(body: unknown): Promise<{ user: AuthUser; token: string }> {
    const { email, password } = (body ?? {}) as { email?: unknown; password?: unknown };
    const invalid = () => new UnauthorizedException({ code: 'bad_credentials', message: 'Email or password is incorrect.' });
    if (typeof email !== 'string' || typeof password !== 'string' || password.length > 128) throw invalid();
    const { rows } = await this.db.pool.query(
      'SELECT id, email, full_name, role, password_hash FROM users WHERE lower(email) = lower($1)',
      [email.trim()],
    );
    const row = rows[0];
    if (!row || !(await bcrypt.compare(password, row.password_hash))) throw invalid();
    const user: AuthUser = { id: row.id, email: row.email, fullName: row.full_name, role: row.role as Role };
    return { user, token: await this.sign(user) };
  }

  async profile(user: AuthUser): Promise<{ phone: string; address: string } | null> {
    if (user.role !== 'CUSTOMER') return null;
    const { rows } = await this.db.pool.query('SELECT phone, address FROM customers WHERE user_id = $1', [user.id]);
    return rows[0] ?? null;
  }

  private sign(user: AuthUser) {
    return this.jwt.signAsync({ sub: user.id, role: user.role });
  }
}

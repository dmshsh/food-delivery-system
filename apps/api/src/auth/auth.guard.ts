import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { DbService } from '../db/db.service';
import { blockSecondsLeft, describeWait } from '../domain/security';
import { SecurityService } from '../security/security.service';
import { ROLES_KEY } from './roles.decorator';
import { AuthUser, Role } from './types';

/**
 * 1. reads the JWT from the httpOnly cookie,
 * 2. loads the user from the database (so deleted users lose access at once),
 * 3. refuses a blocked account even when its token is still valid,
 * 4. checks the role list from @Roles(...), if there is one, and records every refusal.
 *
 * Step 3 is what makes a block real: without it, a user blocked a minute ago would keep
 * working for the eight hours their token lasts.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly db: DbService,
    private readonly security: SecurityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token: string | undefined = request.cookies?.token;
    const unauthorized = () =>
      new UnauthorizedException({ code: 'login_required', message: 'Please sign in to continue.' });
    if (!token) throw unauthorized();

    let userId: number;
    try {
      userId = Number((await this.jwt.verifyAsync<{ sub: number }>(token)).sub);
    } catch {
      throw unauthorized();
    }

    const { rows } = await this.db.pool.query(
      'SELECT id, email, full_name, role, is_active, blocked_until, block_reason FROM users WHERE id = $1',
      [userId],
    );
    if (!rows[0]) throw unauthorized();
    const record = rows[0];
    const ip = this.ipOf(request);

    if (!record.is_active) {
      await this.security.log({
        kind: 'BLOCKED_LOGIN_ATTEMPT',
        userId: record.id,
        email: record.email,
        ip,
        detail: `disabled account used a valid token on ${request.method} ${request.url}`,
      });
      throw new ForbiddenException({
        code: 'account_disabled',
        message: 'This account has been blocked by an administrator. Please contact support.',
      });
    }

    const secondsLeft = blockSecondsLeft(record.blocked_until, new Date());
    if (secondsLeft > 0) {
      await this.security.log({
        kind: 'BLOCKED_LOGIN_ATTEMPT',
        userId: record.id,
        email: record.email,
        ip,
        detail: `blocked account used a valid token on ${request.method} ${request.url}`,
      });
      throw new ForbiddenException({
        code: 'account_blocked',
        message: `This account is temporarily blocked. Try again in ${describeWait(secondsLeft)}.`,
        retryAfterSeconds: secondsLeft,
      });
    }

    const user: AuthUser = {
      id: record.id,
      email: record.email,
      fullName: record.full_name,
      role: record.role,
    };
    request.user = user;

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles && roles.length > 0 && !roles.includes(user.role)) {
      await this.security.log({
        kind: 'ROLE_DENIED',
        userId: user.id,
        email: user.email,
        ip,
        detail: `${user.role} tried ${request.method} ${request.url} (needs ${roles.join(' or ')})`,
      });
      throw new ForbiddenException({ code: 'role_denied', message: 'Your role cannot perform this action.' });
    }
    return true;
  }

  private ipOf(request: { headers?: Record<string, unknown>; ip?: string }): string {
    const forwarded = request.headers?.['x-forwarded-for'];
    const first = Array.isArray(forwarded) ? String(forwarded[0]) : String(forwarded ?? '').split(',')[0];
    return (first || request.ip || '').trim();
  }
}

import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { DbService } from '../db/db.service';
import { ROLES_KEY } from './roles.decorator';
import { AuthUser, Role } from './types';

/**
 * 1. reads the JWT from the httpOnly cookie,
 * 2. loads the user from the database (so deleted users lose access at once),
 * 3. checks the role list from @Roles(...), if there is one.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly db: DbService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token: string | undefined = request.cookies?.token;
    const unauthorized = () => new UnauthorizedException({ code: 'login_required', message: 'Please sign in to continue.' });
    if (!token) throw unauthorized();

    let userId: number;
    try {
      userId = Number((await this.jwt.verifyAsync<{ sub: number }>(token)).sub);
    } catch {
      throw unauthorized();
    }

    const { rows } = await this.db.pool.query('SELECT id, email, full_name, role FROM users WHERE id = $1', [userId]);
    if (!rows[0]) throw unauthorized();
    const user: AuthUser = { id: rows[0].id, email: rows[0].email, fullName: rows[0].full_name, role: rows[0].role };
    request.user = user;

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (roles && roles.length > 0 && !roles.includes(user.role)) {
      throw new ForbiddenException({ code: 'role_denied', message: 'Your role cannot perform this action.' });
    }
    return true;
  }
}

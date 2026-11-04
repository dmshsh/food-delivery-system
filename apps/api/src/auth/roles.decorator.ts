import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser, Role } from './types';

export const ROLES_KEY = 'roles';

/** Restricts a route (or a whole controller) to the listed roles. Use together with AuthGuard. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Injects the signed-in user that AuthGuard stored on the request. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

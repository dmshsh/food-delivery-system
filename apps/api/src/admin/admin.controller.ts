import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, Roles } from '../auth/roles.decorator';
import { AuthUser } from '../auth/types';
import { isBlockableIp } from '../domain/security';
import { IpGuardService, SecurityService } from '../security/security.service';
import { AdminService } from './admin.service';

/**
 * Everything behind the admin panel. The whole controller is ADMIN-only: the role is
 * declared once at the class level, so no route here can be added without it.
 */
@Controller('admin')
@UseGuards(AuthGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly security: SecurityService,
    private readonly ipGuard: IpGuardService,
  ) {}

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  // ---------------------------------------------------------------- menu

  @Get('menu')
  menu() {
    return this.admin.menu();
  }

  @Post('menu')
  createDish(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.admin.createMenuItem(user, body);
  }

  @Patch('menu/reorder')
  @HttpCode(200)
  reorder(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.admin.reorderMenu(user, body);
  }

  @Patch('menu/:id')
  updateDish(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    return this.admin.updateMenuItem(user, id, body);
  }

  @Delete('menu/:id')
  @HttpCode(200)
  removeDish(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.admin.removeMenuItem(user, id);
  }

  // --------------------------------------------------------------- users

  @Get('users')
  users() {
    return this.admin.users();
  }

  @Patch('users/:id/access')
  @HttpCode(200)
  access(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    return this.admin.setAccess(user, id, body);
  }

  @Patch('users/:id/role')
  @HttpCode(200)
  role(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: { role?: unknown }) {
    return this.admin.setRole(user, id, body?.role);
  }

  // ------------------------------------------------------------ security

  @Get('security')
  journal(@Query('kind') kind?: string, @Query('severity') severity?: string, @Query('limit') limit?: string) {
    return this.security.journal({ kind, severity, limit: limit ? Number(limit) : undefined });
  }

  // ---------------------------------------------------------- addresses

  /** Blocked addresses, plus the ones collecting failures that are not blocked yet. */
  @Get('ips')
  async ips() {
    const [blocked, suspicious] = await Promise.all([this.ipGuard.list(), this.ipGuard.suspicious()]);
    return { ...blocked, suspicious };
  }

  @Post('ips')
  @HttpCode(200)
  async blockIp(@CurrentUser() user: AuthUser, @Body() body: { ip?: unknown; reason?: unknown }) {
    const ip = typeof body?.ip === 'string' ? body.ip.trim() : '';
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (!ip || ip.length > 60) {
      throw new BadRequestException({ code: 'bad_ip', message: 'Enter the address to block.' });
    }
    if (!reason) {
      throw new BadRequestException({ code: 'reason_required', message: 'Write why this address is being blocked.' });
    }
    if (!isBlockableIp(ip)) {
      // Blocking the loopback address behind the site's own proxy would lock
      // every visitor out at once, including the administrator doing it.
      throw new BadRequestException({
        code: 'ip_not_blockable',
        message: 'This address cannot be blocked: it is the server itself, and blocking it would lock everyone out.',
      });
    }
    await this.ipGuard.blockByHand(ip, reason.slice(0, 200), user.id, user.email);
    return this.ips();
  }

  @Delete('ips/:ip')
  @HttpCode(200)
  async unblockIp(@CurrentUser() user: AuthUser, @Param('ip') ip: string) {
    await this.ipGuard.unblock(ip, user.id, user.email);
    return this.ips();
  }
}

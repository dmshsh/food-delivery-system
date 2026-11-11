import {
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
import { SecurityService } from '../security/security.service';
import { AdminService } from './admin.service';

/**
 * Everything behind the admin panel. The whole controller is ADMIN-only: the role is
 * declared once at the class level, so no route here can be added without it.
 */
@Controller('admin')
@UseGuards(AuthGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly admin: AdminService, private readonly security: SecurityService) {}

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
}

import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, Roles } from '../auth/roles.decorator';
import { AuthUser } from '../auth/types';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(AuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @Roles('CUSTOMER', 'KITCHEN')
  list(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.orders.list(user, status);
  }

  @Post()
  @Roles('CUSTOMER')
  async create(@CurrentUser() user: AuthUser, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const result = await this.orders.create(user, body);
    res.status(result.replayed ? 200 : 201); // 200 = an existing order was returned for a retry
    return result;
  }

  @Get(':id')
  @Roles('CUSTOMER', 'KITCHEN')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.orders.detail(user, id);
  }

  @Post(':id/checkout')
  @HttpCode(200)
  @Roles('CUSTOMER')
  checkout(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    return this.orders.checkout(user, id, body);
  }

  /** A star rating and an optional comment, once per delivered order. */
  @Post(':id/feedback')
  @HttpCode(201)
  @Roles('CUSTOMER')
  feedback(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    return this.orders.leaveFeedback(user, id, body);
  }

  @Patch(':id/status')
  @Roles('KITCHEN')
  changeStatus(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: { status?: unknown }) {
    return this.orders.changeStatus(user, id, body?.status);
  }
}

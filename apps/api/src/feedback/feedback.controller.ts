import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, Roles } from '../auth/roles.decorator';
import { AuthUser } from '../auth/types';
import { SecurityService } from '../security/security.service';
import { FeedbackService } from './feedback.service';

@Controller('feedback')
@UseGuards(AuthGuard)
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService, private readonly security: SecurityService) {}

  /** Reading reviews is a management view: the admin runs the restaurant, the accountant reports on it. */
  @Get()
  @Roles('ADMIN', 'ACCOUNTANT')
  list(@Query('rating') rating?: string) {
    return this.feedback.list(rating);
  }

  /** Only the admin answers in the restaurant's name. */
  @Post(':id/reply')
  @HttpCode(200)
  @Roles('ADMIN')
  async reply(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const result = await this.feedback.reply(user, id, body);
    await this.security.log({
      kind: 'ADMIN_ACTION',
      userId: user.id,
      email: user.email,
      detail: `replied to review #${id}`,
    });
    return result;
  }
}

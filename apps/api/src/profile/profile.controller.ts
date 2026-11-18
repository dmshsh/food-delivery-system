import { Body, Controller, Get, HttpCode, Patch, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { clientIp } from '../auth/auth.controller';
import { CurrentUser } from '../auth/roles.decorator';
import { AuthUser } from '../auth/types';
import { ProfileService } from './profile.service';

/** Open to every signed-in role: everyone has a name and reads in some language. */
@Controller('profile')
@UseGuards(AuthGuard)
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  read(@CurrentUser() user: AuthUser) {
    return this.profile.read(user);
  }

  @Patch()
  @HttpCode(200)
  update(@CurrentUser() user: AuthUser, @Body() body: unknown, @Req() req: Request) {
    return this.profile.update(user, body, clientIp(req));
  }

  @Patch('language')
  @HttpCode(200)
  setLanguage(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.profile.setLanguage(user, body);
  }
}

import { Body, Controller, Get, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { CurrentUser } from './roles.decorator';
import { AuthUser } from './types';

const COOKIE = {
  httpOnly: true, // JavaScript in the page cannot read the token
  sameSite: 'strict' as const, // the browser does not send it on cross-site requests (CSRF protection)
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 8 * 3600 * 1000,
};

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const { user, token } = await this.auth.register(body);
    res.cookie('token', token, COOKIE).status(201);
    return { user, profile: await this.auth.profile(user) };
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const { user, token } = await this.auth.login(body);
    res.cookie('token', token, COOKIE);
    return { user, profile: await this.auth.profile(user) };
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('token', { ...COOKIE, maxAge: undefined });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@CurrentUser() user: AuthUser) {
    return { user, profile: await this.auth.profile(user) };
  }
}

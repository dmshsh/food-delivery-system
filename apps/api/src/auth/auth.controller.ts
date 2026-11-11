import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request, Response } from 'express';
import { SecurityService } from '../security/security.service';
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

/** The caller's address, for the security journal. Behind the Next.js proxy this is the proxy itself. */
export function clientIp(request: Request): string {
  const forwarded = request.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
  return (first ?? request.ip ?? request.socket?.remoteAddress ?? '').trim();
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly security: SecurityService,
    private readonly jwt: JwtService,
  ) {}

  @Post('register')
  async register(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { user, token } = await this.auth.register(body, clientIp(req));
    res.cookie('token', token, COOKIE).status(201);
    return { user, profile: await this.auth.profile(user) };
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { user, token } = await this.auth.login(body, clientIp(req));
    res.cookie('token', token, COOKIE);
    return { user, profile: await this.auth.profile(user) };
  }

  /**
   * Signing out always works, even with an expired or already blocked token: the cookie
   * has to go either way. The journal line is written only when the token still says who
   * the user was.
   */
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.clearCookie('token', { ...COOKIE, maxAge: undefined });
    const token: string | undefined = (req as Request & { cookies?: Record<string, string> }).cookies?.token;
    if (token) {
      try {
        const payload = await this.jwt.verifyAsync<{ sub: number }>(token);
        await this.security.log({ kind: 'LOGOUT', userId: Number(payload.sub), ip: clientIp(req) });
      } catch {
        /* an unreadable token still gets the cookie cleared, it just has no name to log */
      }
    }
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@CurrentUser() user: AuthUser) {
    return { user, profile: await this.auth.profile(user) };
  }
}

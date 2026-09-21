import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { LoginDto } from '../admin-users/admin-users.dto';
import { getRequestId } from '../common/middleware/request-id.middleware';
import { AppConfigService } from '../config/app-config.service';
import { AuthService } from './auth.service';
import { clearSessionCookie, setSessionCookie } from './cookie.util';
import { CurrentAdmin, type AuthenticatedAdmin } from './current-admin.decorator';
import { Public } from './decorators';
import { LOGIN_THROTTLE } from './login-throttle';

@ApiTags('admin-auth')
@Controller('admin/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly appConfig: AppConfigService,
  ) {}

  @Public()
  @Throttle({ default: { limit: LOGIN_THROTTLE.limit, ttl: LOGIN_THROTTLE.ttl } })
  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login({
      email: body.email,
      password: body.password,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
      requestId: getRequestId(req),
    });

    setSessionCookie(res, result.rawToken, this.appConfig, result.absoluteExpiresAt);

    return {
      user: result.user,
      session: {
        id: result.sessionId,
        expiresAt: result.expiresAt.toISOString(),
        absoluteExpiresAt: result.absoluteExpiresAt.toISOString(),
      },
    };
  }

  @Post('logout')
  async logout(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout({
      adminUserId: admin.id,
      sessionId: admin.sessionId,
      requestId: getRequestId(req),
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    clearSessionCookie(res, this.appConfig);
    return { ok: true };
  }

  @Post('logout-all')
  async logoutAll(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logoutAll({
      adminUserId: admin.id,
      requestId: getRequestId(req),
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    clearSessionCookie(res, this.appConfig);
    return { ok: true };
  }

  @SkipThrottle()
  @Get('me')
  async me(@CurrentAdmin() admin: AuthenticatedAdmin) {
    const user = await this.auth.getMe(admin.id);
    return {
      user,
      session: {
        id: admin.sessionId,
        expiresAt: admin.sessionExpiresAt.toISOString(),
        absoluteExpiresAt: admin.sessionAbsoluteExpiresAt.toISOString(),
      },
    };
  }
}

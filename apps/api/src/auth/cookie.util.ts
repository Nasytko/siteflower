import { ADMIN_SESSION_COOKIE } from '@bouquet-one/contracts';
import type { Response } from 'express';
import type { AppConfigService } from '../config/app-config.service';

export function setSessionCookie(
  res: Response,
  rawToken: string,
  appConfig: AppConfigService,
  absoluteExpiresAt: Date,
): void {
  res.cookie(ADMIN_SESSION_COOKIE, rawToken, {
    httpOnly: true,
    // Local production-mode boots (ALLOW_PRODUCTION_LOCAL_MEDIA) serve over http:// —
    // Secure cookies would break Admin session for Playwright/APIRequestContext.
    secure: appConfig.isProduction && !appConfig.allowProductionLocalMedia,
    sameSite: 'lax',
    path: '/',
    expires: absoluteExpiresAt,
  });
}

export function clearSessionCookie(res: Response, appConfig: AppConfigService): void {
  res.cookie(ADMIN_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: appConfig.isProduction && !appConfig.allowProductionLocalMedia,
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
  });
}

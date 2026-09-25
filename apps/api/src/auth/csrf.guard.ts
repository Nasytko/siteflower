import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { AppConfigService } from '../config/app-config.service';
import { isAdminApiPath } from './admin-path.util';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defense for cookie-authenticated admin mutations.
 * SameSite=Lax is the primary browser control; Origin/Referer validation
 * is an additional same-origin check for state-changing admin requests.
 */
@Injectable()
export class AdminCsrfGuard implements CanActivate {
  constructor(private readonly appConfig: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const path = request.path ?? request.url ?? '';
    if (!isAdminApiPath(path)) {
      return true;
    }
    if (SAFE_METHODS.has(request.method.toUpperCase())) {
      return true;
    }

    const allowed = new Set(this.appConfig.corsOrigins);
    const origin = request.headers.origin;
    if (origin) {
      if (!allowed.has(origin)) {
        throw new ForbiddenException('Invalid request origin');
      }
      return true;
    }

    const referer = request.headers.referer;
    if (referer) {
      try {
        const refererOrigin = new URL(referer).origin;
        if (!allowed.has(refererOrigin)) {
          throw new ForbiddenException('Invalid request origin');
        }
        return true;
      } catch {
        throw new ForbiddenException('Invalid request origin');
      }
    }

    // Non-browser clients (integration tests / scripts) may omit Origin.
    // Allow when neither header is present only outside production, or when
    // explicitly same-network tooling sets a trusted custom header later.
    if (!this.appConfig.isProduction) {
      return true;
    }

    throw new ForbiddenException('Missing request origin');
  }
}

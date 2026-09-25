import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ADMIN_SESSION_COOKIE } from '@bouquet-one/contracts';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './decorators';
import type { AuthenticatedAdmin } from './current-admin.decorator';
import { isAdminApiPath } from './admin-path.util';
import { SessionService } from './session.service';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { admin?: AuthenticatedAdmin }>();
    const path = request.path ?? request.url ?? '';
    if (!isAdminApiPath(path)) {
      return true;
    }

    const token = request.cookies?.[ADMIN_SESSION_COOKIE] as string | undefined;
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    const admin = await this.sessions.resolveSession(token, {
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    });
    if (!admin) {
      throw new UnauthorizedException('Authentication required');
    }

    request.admin = admin;
    return true;
  }
}

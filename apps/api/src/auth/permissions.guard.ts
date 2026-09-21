import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@bouquet-one/contracts';
import { roleHasAllPermissions } from '@bouquet-one/contracts';
import { IS_PUBLIC_KEY, REQUIRED_PERMISSIONS_KEY } from './decorators';
import type { AuthenticatedAdmin } from './current-admin.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ admin?: AuthenticatedAdmin }>();
    const admin = request.admin;
    if (!admin) {
      throw new ForbiddenException('Insufficient permissions');
    }

    if (!roleHasAllPermissions(admin.role, required)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}

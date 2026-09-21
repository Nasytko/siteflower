import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AdminRole, Permission } from '@bouquet-one/contracts';

export type AuthenticatedAdmin = {
  id: string;
  email: string;
  displayName: string;
  role: AdminRole;
  permissions: readonly Permission[];
  sessionId: string;
  sessionExpiresAt: Date;
  sessionAbsoluteExpiresAt: Date;
};

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedAdmin => {
    const request = ctx.switchToHttp().getRequest<{ admin?: AuthenticatedAdmin }>();
    if (!request.admin) {
      throw new Error('CurrentAdmin used outside authenticated context');
    }
    return request.admin;
  },
);

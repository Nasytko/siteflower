import type { Request } from 'express';
import type { AuthenticatedAdmin } from '../auth/current-admin.decorator';
import { getRequestId } from '../common/middleware/request-id.middleware';

export type ActorContext = {
  actorId: string;
  requestId?: string;
  userAgent?: string;
  ip?: string;
};

export function actorFrom(admin: AuthenticatedAdmin, req: Request): ActorContext {
  return {
    actorId: admin.id,
    requestId: getRequestId(req),
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  };
}

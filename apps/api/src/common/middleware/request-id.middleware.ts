import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

export function getRequestId(req: Request): string | undefined {
  const value = (req as Request & { requestId?: string }).requestId;
  return value;
}

export function setRequestId(req: Request, requestId: string): void {
  (req as Request & { requestId?: string }).requestId = requestId;
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(REQUEST_ID_HEADER);
  const requestId = incoming && incoming.trim().length > 0 ? incoming.trim() : randomUUID();
  setRequestId(req, requestId);
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}

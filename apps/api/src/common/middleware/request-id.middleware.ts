import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

/** Accept only compact opaque IDs — reject log-pollution / control chars. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{8,128}$/;

export function sanitizeRequestId(incoming: string | undefined): string {
  const trimmed = incoming?.trim() ?? '';
  if (SAFE_REQUEST_ID.test(trimmed)) {
    return trimmed;
  }
  return randomUUID();
}

export function getRequestId(req: Request): string | undefined {
  const value = (req as Request & { requestId?: string }).requestId;
  return value;
}

export function setRequestId(req: Request, requestId: string): void {
  (req as Request & { requestId?: string }).requestId = requestId;
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(REQUEST_ID_HEADER);
  const requestId = sanitizeRequestId(incoming);
  setRequestId(req, requestId);
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}

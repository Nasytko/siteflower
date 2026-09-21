import { createHash, randomBytes } from 'node:crypto';

/** 32 random bytes → base64url (~43 chars). High entropy for public tracking. */
export function generateTrackingToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashTrackingToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

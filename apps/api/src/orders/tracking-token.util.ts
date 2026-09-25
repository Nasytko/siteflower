import { createHash, randomBytes } from 'node:crypto';

/** base64url of 32 bytes → 43 characters (no padding). */
export const TRACKING_TOKEN_LENGTH = 43;
const TRACKING_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** 32 random bytes → base64url (~43 chars). High entropy for public tracking. */
export function generateTrackingToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashTrackingToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

/**
 * Format gate before hashing/lookup. Malformed tokens get the same 404 as unknown.
 * Does not reveal whether a token was "close" to a valid one.
 */
export function isWellFormedTrackingToken(rawToken: string | undefined | null): boolean {
  if (!rawToken) return false;
  return TRACKING_TOKEN_PATTERN.test(rawToken);
}

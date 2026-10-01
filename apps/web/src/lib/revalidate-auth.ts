import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Compare provided revalidate secret to expected using SHA-256 + timingSafeEqual.
 * Does not log either value.
 */
export function safeEqualSecret(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export function isRevalidateConfigured(secret: string | undefined): secret is string {
  return Boolean(secret && secret.length >= 16);
}

export function authorizeRevalidateRequest(
  providedHeader: string | null,
  expectedSecret: string | undefined,
): 'ok' | 'not_configured' | 'unauthorized' {
  if (!isRevalidateConfigured(expectedSecret)) {
    return 'not_configured';
  }
  if (!providedHeader || !safeEqualSecret(providedHeader, expectedSecret)) {
    return 'unauthorized';
  }
  return 'ok';
}

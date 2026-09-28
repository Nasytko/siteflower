import type { IntegrationFailureCategory } from '@bouquet-one/contracts';

/** Base delays before jitter: 30s, 2m, 10m, 30m, 1h, then +1h capped. */
const BACKOFF_BASE_MS = [
  30_000,
  120_000,
  600_000,
  1_800_000,
  3_600_000,
] as const;

const CAP_MS = 3_600_000;

export const RETRYABLE_FAILURE_CATEGORIES: ReadonlySet<IntegrationFailureCategory> = new Set([
  'NETWORK_ERROR',
  'TIMEOUT',
  'REMOTE_5XX',
  'RATE_LIMITED',
]);

export function isRetryableFailure(category: IntegrationFailureCategory): boolean {
  return RETRYABLE_FAILURE_CATEGORIES.has(category);
}

/**
 * Non-retryable categories fail after a small number of attempts (1–2).
 * Retryable categories continue until maxAttempts.
 */
export function shouldMarkFailed(
  category: IntegrationFailureCategory,
  attemptCount: number,
  maxAttempts: number,
): boolean {
  if (attemptCount >= maxAttempts) return true;
  if (!isRetryableFailure(category) && attemptCount >= 2) return true;
  return false;
}

/**
 * Compute nextAttemptAt from current attemptCount (post-increment).
 * Adds 0–20% jitter. `random` injectable for tests (0..1).
 */
export function computeBackoffMs(attemptCount: number, random: () => number = Math.random): number {
  const index = Math.max(0, attemptCount - 1);
  const base =
    index < BACKOFF_BASE_MS.length ? BACKOFF_BASE_MS[index]! : CAP_MS;
  const jitterFactor = 1 + Math.min(1, Math.max(0, random())) * 0.2;
  return Math.floor(base * jitterFactor);
}

export function computeNextAttemptAt(
  attemptCount: number,
  now: Date = new Date(),
  random: () => number = Math.random,
): Date {
  return new Date(now.getTime() + computeBackoffMs(attemptCount, random));
}

export function sanitizeErrorMessage(message: string, maxLen = 500): string {
  const cleaned = message
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/X-Bouquet-Integration-Signature:\s*\S+/gi, 'X-Bouquet-Integration-Signature: [REDACTED]')
    .replace(/secret[=:]\s*\S+/gi, 'secret=[REDACTED]')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen - 1)}…`;
}

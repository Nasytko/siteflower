import {
  computeBackoffMs,
  computeNextAttemptAt,
  isRetryableFailure,
  sanitizeErrorMessage,
  shouldMarkFailed,
} from './backoff';

describe('integration backoff', () => {
  it('uses fixed schedule before cap', () => {
    const noJitter = () => 0;
    expect(computeBackoffMs(1, noJitter)).toBe(30_000);
    expect(computeBackoffMs(2, noJitter)).toBe(120_000);
    expect(computeBackoffMs(3, noJitter)).toBe(600_000);
    expect(computeBackoffMs(4, noJitter)).toBe(1_800_000);
    expect(computeBackoffMs(5, noJitter)).toBe(3_600_000);
    expect(computeBackoffMs(6, noJitter)).toBe(3_600_000);
    expect(computeBackoffMs(20, noJitter)).toBe(3_600_000);
  });

  it('applies up to 20% jitter', () => {
    expect(computeBackoffMs(1, () => 1)).toBe(36_000);
    expect(computeBackoffMs(1, () => 0.5)).toBe(33_000);
  });

  it('computeNextAttemptAt offsets from now', () => {
    const now = new Date('2026-09-29T00:00:00.000Z');
    const next = computeNextAttemptAt(1, now, () => 0);
    expect(next.toISOString()).toBe('2026-09-29T00:00:30.000Z');
  });

  it('classifies retryable vs terminal', () => {
    expect(isRetryableFailure('NETWORK_ERROR')).toBe(true);
    expect(isRetryableFailure('TIMEOUT')).toBe(true);
    expect(isRetryableFailure('REMOTE_5XX')).toBe(true);
    expect(isRetryableFailure('RATE_LIMITED')).toBe(true);
    expect(isRetryableFailure('AUTH_FAILED')).toBe(false);
    expect(isRetryableFailure('REMOTE_4XX')).toBe(false);
    expect(isRetryableFailure('CONFIGURATION_ERROR')).toBe(false);
    expect(isRetryableFailure('INVALID_RESPONSE')).toBe(false);
  });

  it('marks non-retryable failed after 2 attempts', () => {
    expect(shouldMarkFailed('AUTH_FAILED', 1, 12)).toBe(false);
    expect(shouldMarkFailed('AUTH_FAILED', 2, 12)).toBe(true);
    expect(shouldMarkFailed('NETWORK_ERROR', 2, 12)).toBe(false);
    expect(shouldMarkFailed('NETWORK_ERROR', 12, 12)).toBe(true);
  });

  it('sanitizes secrets and truncates', () => {
    expect(sanitizeErrorMessage('Bearer abc.def.ghi failed')).toContain('[REDACTED]');
    expect(sanitizeErrorMessage('x'.repeat(600)).length).toBe(500);
  });
});

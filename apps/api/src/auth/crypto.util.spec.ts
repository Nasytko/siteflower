import { createHash } from 'node:crypto';
import {
  generateSessionToken,
  hashSessionToken,
  normalizeEmail,
  PASSWORD_MIN_LENGTH,
  assertPasswordPolicy,
} from './crypto.util';

describe('crypto utils', () => {
  it('normalizes email', () => {
    expect(normalizeEmail('  Admin@Example.COM ')).toBe('admin@example.com');
  });

  it('rejects short passwords', () => {
    expect(() => assertPasswordPolicy('short')).toThrow(/at least/);
  });

  it('accepts long enough passwords', () => {
    expect(() => assertPasswordPolicy('a'.repeat(PASSWORD_MIN_LENGTH))).not.toThrow();
  });

  it('hashes session tokens with sha256', () => {
    const token = generateSessionToken();
    expect(token.length).toBeGreaterThan(20);
    expect(hashSessionToken(token)).toBe(createHash('sha256').update(token).digest('hex'));
  });
});

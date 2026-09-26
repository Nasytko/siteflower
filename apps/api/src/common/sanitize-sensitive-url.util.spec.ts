import { sanitizeSensitiveUrl } from './sanitize-sensitive-url.util';

describe('sanitizeSensitiveUrl', () => {
  it('redacts tracking bearer tokens in path', () => {
    expect(sanitizeSensitiveUrl('/api/v1/orders/track/super-secret-token?x=1')).toBe(
      '/api/v1/orders/track/[REDACTED]?x=1',
    );
  });

  it('leaves unrelated paths unchanged', () => {
    expect(sanitizeSensitiveUrl('/api/v1/orders/admin')).toBe('/api/v1/orders/admin');
  });

  it('handles undefined', () => {
    expect(sanitizeSensitiveUrl(undefined)).toBeUndefined();
  });
});

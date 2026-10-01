import {
  authorizeRevalidateRequest,
  isRevalidateConfigured,
  safeEqualSecret,
} from './revalidate-auth';

describe('revalidate-auth', () => {
  it('requires secret length ≥ 16', () => {
    expect(isRevalidateConfigured(undefined)).toBe(false);
    expect(isRevalidateConfigured('short')).toBe(false);
    expect(isRevalidateConfigured('revalidate-secret-16')).toBe(true);
  });

  it('safeEqualSecret matches equal strings', () => {
    expect(safeEqualSecret('revalidate-secret-16', 'revalidate-secret-16')).toBe(true);
    expect(safeEqualSecret('revalidate-secret-16', 'revalidate-secret-17')).toBe(false);
  });

  it('authorizeRevalidateRequest returns not_configured when unset', () => {
    expect(authorizeRevalidateRequest('anything', undefined)).toBe('not_configured');
    expect(authorizeRevalidateRequest('anything', 'short')).toBe('not_configured');
  });

  it('authorizeRevalidateRequest rejects missing or wrong secret', () => {
    expect(authorizeRevalidateRequest(null, 'revalidate-secret-16')).toBe('unauthorized');
    expect(authorizeRevalidateRequest('wrong-secret-XXXX', 'revalidate-secret-16')).toBe(
      'unauthorized',
    );
  });

  it('authorizeRevalidateRequest accepts matching secret', () => {
    expect(authorizeRevalidateRequest('revalidate-secret-16', 'revalidate-secret-16')).toBe('ok');
  });
});

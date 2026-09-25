import { sanitizeRequestId } from './request-id.middleware';

describe('sanitizeRequestId', () => {
  it('accepts compact opaque ids', () => {
    expect(sanitizeRequestId('abc_DEF-01234567')).toBe('abc_DEF-01234567');
  });

  it('rejects newlines and spaces', () => {
    const out = sanitizeRequestId('bad\nid');
    expect(out).not.toBe('bad\nid');
    expect(out).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('rejects oversized values', () => {
    const out = sanitizeRequestId('x'.repeat(200));
    expect(out.length).not.toBe(200);
  });
});

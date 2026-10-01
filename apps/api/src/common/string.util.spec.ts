import { trimmedOrNull } from './string.util';

describe('trimmedOrNull', () => {
  it('returns null for nullish or blank', () => {
    expect(trimmedOrNull(null)).toBeNull();
    expect(trimmedOrNull(undefined)).toBeNull();
    expect(trimmedOrNull('')).toBeNull();
    expect(trimmedOrNull('   ')).toBeNull();
  });

  it('trims non-empty strings', () => {
    expect(trimmedOrNull('  hello  ')).toBe('hello');
  });
});

import { validateEnv } from './env.validation';

describe('validateEnv revalidation', () => {
  const base = {
    NODE_ENV: 'development',
  };

  it('allows both REVALIDATE_* unset (fail-soft)', () => {
    expect(() => validateEnv({ ...base })).not.toThrow();
  });

  it('accepts internal Docker URL + secret ≥16', () => {
    const env = validateEnv({
      ...base,
      REVALIDATE_URL: 'http://web:3000/api/revalidate',
      REVALIDATE_SECRET: 'revalidate-secret-16',
    });
    expect(env.REVALIDATE_URL).toBe('http://web:3000/api/revalidate');
    expect(env.REVALIDATE_SECRET).toBe('revalidate-secret-16');
  });

  it('rejects secret shorter than 16', () => {
    expect(() =>
      validateEnv({
        ...base,
        REVALIDATE_URL: 'http://web:3000/api/revalidate',
        REVALIDATE_SECRET: 'too-short',
      }),
    ).toThrow(/REVALIDATE_SECRET/);
  });

  it('rejects invalid REVALIDATE_URL', () => {
    expect(() =>
      validateEnv({
        ...base,
        REVALIDATE_URL: 'not-a-url',
        REVALIDATE_SECRET: 'revalidate-secret-16',
      }),
    ).toThrow(/REVALIDATE_URL/);
  });
});

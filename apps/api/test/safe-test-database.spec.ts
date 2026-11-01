import {
  FORBIDDEN_TEST_DATABASE_NAMES,
  UnsafeTestDatabaseError,
  assertSafeTestDatabaseUrl,
  resolveSafeTestDatabaseUrl,
} from './safe-test-database';

describe('safe-test-database (R21)', () => {
  const allow = { TEST_DATABASE_ALLOW_INTEGRATION: '1' };

  it('rejects missing allow flag', () => {
    expect(() =>
      assertSafeTestDatabaseUrl('postgresql://bouquet:x@127.0.0.1:5432/bouquet_one_ci', {}),
    ).toThrow(UnsafeTestDatabaseError);
  });

  it('rejects missing TEST_DATABASE_URL', () => {
    expect(() => resolveSafeTestDatabaseUrl({ ...allow })).toThrow(/TEST_DATABASE_URL/);
  });

  it('rejects working bouquet_one even with allow flag', () => {
    expect(() =>
      assertSafeTestDatabaseUrl(
        'postgresql://bouquet:x@127.0.0.1:5432/bouquet_one?schema=public',
        allow,
      ),
    ).toThrow(/forbidden database "bouquet_one"/);
  });

  it('rejects remote hosts', () => {
    expect(() =>
      assertSafeTestDatabaseUrl(
        'postgresql://bouquet:x@db.production.example:5432/bouquet_one_ci',
        allow,
      ),
    ).toThrow(/non-local integration host/);
  });

  it('rejects unsafe database names without test suffix', () => {
    expect(() =>
      assertSafeTestDatabaseUrl('postgresql://bouquet:x@127.0.0.1:5432/shop_live', allow),
    ).toThrow(/must match \*_test/);
  });

  it('accepts isolated local CI / audit / test names', () => {
    for (const db of ['bouquet_one_ci', 'bouquet_one_baseline_audit', 'acme_test', 'integration']) {
      const policy = assertSafeTestDatabaseUrl(
        `postgresql://bouquet:x@127.0.0.1:5432/${db}?schema=public`,
        allow,
      );
      expect(policy.database).toBe(db);
      expect(policy.hostname).toBe('127.0.0.1');
    }
  });

  it('does not treat ambient DATABASE_URL as sufficient', () => {
    expect(() =>
      resolveSafeTestDatabaseUrl({
        ...allow,
        DATABASE_URL: 'postgresql://bouquet:x@127.0.0.1:5432/bouquet_one_ci',
      }),
    ).toThrow(/TEST_DATABASE_URL is required/);
  });

  it('lists bouquet_one as forbidden', () => {
    expect(FORBIDDEN_TEST_DATABASE_NAMES.has('bouquet_one')).toBe(true);
  });

  it('createVerifiedIntegrationPool is exported for suites (no ambient URL bypass)', async () => {
    const mod = await import('./safe-test-database');
    expect(typeof mod.createVerifiedIntegrationPool).toBe('function');
  });
});

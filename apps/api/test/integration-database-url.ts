/**
 * Integration DB URL resolver — fail-closed (R21).
 * Prefer {@link resolveAndVerifySafeTestDatabase}; no bouquet_one / DATABASE_URL fallback.
 */
import {
  createVerifiedIntegrationPool,
  resolveAndVerifySafeTestDatabase,
  resolveSafeTestDatabaseUrl,
  type SafeTestDatabasePolicy,
} from './safe-test-database';

export {
  UnsafeTestDatabaseError,
  assertSafeTestDatabaseUrl,
  createVerifiedIntegrationPool,
  resolveSafeTestDatabaseUrl,
  verifySafeTestDatabaseConnection,
  resolveAndVerifySafeTestDatabase,
  TEST_DATABASE_ALLOW_ENV,
  TEST_DATABASE_URL_ENV,
  FORBIDDEN_TEST_DATABASE_NAMES,
} from './safe-test-database';

/** Resolve + live-verify TEST_DATABASE_URL. No bouquet_one / DATABASE_URL fallback. */
export async function resolveIntegrationDatabaseUrl(): Promise<string> {
  const policy = await resolveAndVerifySafeTestDatabase();
  return policy.url;
}

/** Preferred beforeAll helper: verified URL + Pool bound to that same URL. */
export async function openIntegrationDatabase(
  poolOptions?: Omit<import('pg').PoolConfig, 'connectionString'>,
): Promise<{ pool: import('pg').Pool; url: string; policy: SafeTestDatabasePolicy }> {
  return createVerifiedIntegrationPool(poolOptions);
}

/**
 * Sync policy-only resolve (no live connection). Prefer async helper in beforeAll.
 * Throws if TEST_DATABASE_URL / allow flag missing or unsafe.
 */
export function requireIntegrationDatabaseUrlSync(): SafeTestDatabasePolicy {
  return resolveSafeTestDatabaseUrl();
}

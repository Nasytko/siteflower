/**
 * Fail-closed gate for API DB integration tests (R21 / A0).
 *
 * Integration suites must NEVER fall back to the working developer DB
 * (`bouquet_one`) or to ambient `DATABASE_URL` alone.
 */
import pg from 'pg';

/** Explicit opt-in. Required in addition to TEST_DATABASE_URL. */
export const TEST_DATABASE_ALLOW_ENV = 'TEST_DATABASE_ALLOW_INTEGRATION';

/** Dedicated integration URL. Ambient DATABASE_URL is not accepted. */
export const TEST_DATABASE_URL_ENV = 'TEST_DATABASE_URL';

/** Exact database names that must never be targeted by integration suites. */
export const FORBIDDEN_TEST_DATABASE_NAMES = new Set([
  'bouquet_one',
  'postgres',
  'template0',
  'template1',
]);

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/** Safe isolated names: *_test / *_ci / *_audit / *_integration (optional suffix). */
const SAFE_DB_NAME =
  /^(?:[a-z][a-z0-9_]*_)?(?:test|ci|audit|integration)(?:_[a-z0-9]+)?$/i;

export type SafeTestDatabasePolicy = {
  url: string;
  hostname: string;
  database: string;
};

export class UnsafeTestDatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeTestDatabaseError';
  }
}

function requireAllowFlag(env: NodeJS.ProcessEnv = process.env): void {
  const raw = env[TEST_DATABASE_ALLOW_ENV]?.trim().toLowerCase();
  if (raw !== '1' && raw !== 'true' && raw !== 'yes') {
    throw new UnsafeTestDatabaseError(
      `Refusing DB integration: set ${TEST_DATABASE_ALLOW_ENV}=1 together with ${TEST_DATABASE_URL_ENV}. ` +
        'Ambient DATABASE_URL / bouquet_one fallbacks are forbidden (R21).',
    );
  }
}

export function parsePostgresUrl(raw: string): URL {
  let normalized = raw.trim();
  if (normalized.startsWith('postgresql+')) {
    normalized = `postgresql://${normalized.slice('postgresql+'.length)}`;
  }
  try {
    return new URL(normalized);
  } catch {
    throw new UnsafeTestDatabaseError(`Invalid ${TEST_DATABASE_URL_ENV}: not a valid URL`);
  }
}

export function databaseNameFromUrl(url: URL): string {
  const name = decodeURIComponent(url.pathname.replace(/^\//, '')).split('/')[0] ?? '';
  if (!name) {
    throw new UnsafeTestDatabaseError(`Invalid ${TEST_DATABASE_URL_ENV}: missing database name`);
  }
  return name;
}

/**
 * Sync policy check — no network. Use before opening pools / spawning API.
 */
export function assertSafeTestDatabaseUrl(
  rawUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): SafeTestDatabasePolicy {
  requireAllowFlag(env);

  const trimmed = rawUrl?.trim();
  if (!trimmed) {
    throw new UnsafeTestDatabaseError(
      `${TEST_DATABASE_URL_ENV} is required for DB integration tests (no bouquet_one fallback).`,
    );
  }

  const url = parsePostgresUrl(trimmed);
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new UnsafeTestDatabaseError(
      `Invalid ${TEST_DATABASE_URL_ENV}: expected postgres/postgresql scheme`,
    );
  }

  const hostname = url.hostname.toLowerCase();
  if (!LOCAL_HOSTS.has(hostname)) {
    throw new UnsafeTestDatabaseError(
      `Refusing non-local integration host "${hostname}". Only localhost / 127.0.0.1 / ::1 are allowed.`,
    );
  }

  const database = databaseNameFromUrl(url);
  if (FORBIDDEN_TEST_DATABASE_NAMES.has(database)) {
    throw new UnsafeTestDatabaseError(
      `Refusing forbidden database "${database}". Use an isolated name matching *_test / *_ci / *_audit / *_integration.`,
    );
  }
  if (!SAFE_DB_NAME.test(database)) {
    throw new UnsafeTestDatabaseError(
      `Refusing database "${database}". Name must match *_test / *_ci / *_audit / *_integration (R21).`,
    );
  }

  return { url: trimmed, hostname, database };
}

/**
 * Resolve URL from env and validate policy (sync). Does not open a connection.
 */
export function resolveSafeTestDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): SafeTestDatabasePolicy {
  requireAllowFlag(env);
  const fromTest = env[TEST_DATABASE_URL_ENV]?.trim();
  if (!fromTest) {
    throw new UnsafeTestDatabaseError(
      `${TEST_DATABASE_URL_ENV} is required. Do not use DATABASE_URL or bouquet_one fallbacks for integration.`,
    );
  }
  return assertSafeTestDatabaseUrl(fromTest, env);
}

/**
 * Live identity check: connect and confirm current_database() matches policy.
 * Call once in beforeAll before any destructive SQL.
 */
export async function verifySafeTestDatabaseConnection(
  policy: SafeTestDatabasePolicy,
): Promise<void> {
  const client = new pg.Client({ connectionString: policy.url });
  try {
    await client.connect();
    const result = await client.query<{ current_database: string }>(
      'SELECT current_database() AS current_database',
    );
    const live = result.rows[0]?.current_database;
    if (!live) {
      throw new UnsafeTestDatabaseError('Could not read current_database() from test Postgres');
    }
    if (live !== policy.database) {
      throw new UnsafeTestDatabaseError(
        `Live database "${live}" does not match TEST_DATABASE_URL database "${policy.database}"`,
      );
    }
    if (FORBIDDEN_TEST_DATABASE_NAMES.has(live)) {
      throw new UnsafeTestDatabaseError(`Live database "${live}" is forbidden (R21)`);
    }
    if (!SAFE_DB_NAME.test(live)) {
      throw new UnsafeTestDatabaseError(`Live database "${live}" is not an allowlisted test name`);
    }
  } catch (err) {
    if (err instanceof UnsafeTestDatabaseError) throw err;
    throw new UnsafeTestDatabaseError(
      `Failed to verify test database connection: ${(err as Error).message}`,
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** Resolve + live verify. Preferred entry for integration beforeAll. */
export async function resolveAndVerifySafeTestDatabase(
  env: NodeJS.ProcessEnv = process.env,
): Promise<SafeTestDatabasePolicy> {
  const policy = resolveSafeTestDatabaseUrl(env);
  await verifySafeTestDatabaseConnection(policy);
  return policy;
}

/**
 * Open a Pool only after policy + live identity checks.
 * Always pass `policy.url` through — never substitute ambient DATABASE_URL.
 */
export async function createVerifiedIntegrationPool(
  poolOptions: Omit<pg.PoolConfig, 'connectionString'> = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ pool: pg.Pool; url: string; policy: SafeTestDatabasePolicy }> {
  const policy = await resolveAndVerifySafeTestDatabase(env);
  // Re-validate the exact string handed to node-pg (no host/db swap).
  assertSafeTestDatabaseUrl(policy.url, env);
  const pool = new pg.Pool({ ...poolOptions, connectionString: policy.url });
  return { pool, url: policy.url, policy };
}

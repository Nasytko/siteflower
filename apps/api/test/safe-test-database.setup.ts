/**
 * Jest integration setup — fail closed before any suite opens a pool.
 * Live connection verify still runs in resolveIntegrationDatabaseUrl() / beforeAll.
 */
import { resolveSafeTestDatabaseUrl } from './safe-test-database';

resolveSafeTestDatabaseUrl();

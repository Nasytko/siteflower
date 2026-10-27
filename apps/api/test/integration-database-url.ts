/**
 * Resolve PostgreSQL URL for integration tests.
 * Prefer DATABASE_URL from the environment; otherwise probe common local ports.
 * Never points at production — localhost only.
 */
import net from 'node:net';

const DEFAULT_USER = 'bouquet';
const DEFAULT_PASS = 'bouquet_dev_password';
const DEFAULT_DB = 'bouquet_one';

async function canConnect(host: string, port: number, timeoutMs = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

export async function resolveIntegrationDatabaseUrl(): Promise<string> {
  const fromEnv = process.env.DATABASE_URL?.trim();
  if (fromEnv) {
    // If env points at a closed local port, fall through to probe.
    try {
      const u = new URL(fromEnv);
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
        const port = Number(u.port || 5432);
        if (await canConnect(u.hostname, port)) return fromEnv;
      } else {
        return fromEnv;
      }
    } catch {
      return fromEnv;
    }
  }

  for (const port of [5432, 5433]) {
    if (await canConnect('127.0.0.1', port)) {
      return `postgresql://${DEFAULT_USER}:${DEFAULT_PASS}@127.0.0.1:${port}/${DEFAULT_DB}?schema=public`;
    }
  }

  throw new Error(
    'Integration tests require PostgreSQL. Set DATABASE_URL or start local Postgres on :5432/:5433.',
  );
}

/** Sync fallback for suites that still read a constant at module load. Prefer async helper in beforeAll. */
export const INTEGRATION_DATABASE_URL_FALLBACK =
  process.env.DATABASE_URL?.trim() ||
  `postgresql://${DEFAULT_USER}:${DEFAULT_PASS}@127.0.0.1:5432/${DEFAULT_DB}?schema=public`;

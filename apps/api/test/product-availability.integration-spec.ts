/**
 * Quick availability — Nest API + real PostgreSQL.
 * Reuses PATCH /admin/catalog/products/:id with OCC; does not touch stock.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import request from 'supertest';
import pg from 'pg';
import * as argon2 from 'argon2';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://bouquet:bouquet_dev_password@localhost:5433/bouquet_one?schema=public';
const apiPort = String(3601 + Math.floor(Math.random() * 200));
const origin = 'http://localhost:3000';
const password = 'AvailPass12!!';

async function hashPassword(value: string): Promise<string> {
  return argon2.hash(value, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

function uuid(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

describe('Product quick availability (integration)', () => {
  let child: ChildProcessWithoutNullStreams;
  let pool: pg.Pool;
  let superEmail: string;
  let bootLog = '';
  const base = `http://127.0.0.1:${apiPort}`;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: databaseUrl });
    try {
      await pool.query('SELECT 1');
    } catch (err) {
      throw new Error(
        `Integration tests require PostgreSQL at DATABASE_URL. ${(err as Error).message}`,
      );
    }

    await pool.query(`DELETE FROM audit_logs WHERE action = 'PRODUCT_UPDATED'`);
    await pool.query('DELETE FROM admin_sessions');
    await pool.query(`DELETE FROM admin_users WHERE email LIKE 'avail-admin-%'`);
    await pool.query(`DELETE FROM products WHERE slug LIKE 'avail-%'`);

    superEmail = `avail-admin-${Date.now()}@example.com`;
    const passwordHash = await hashPassword(password);
    await pool.query(
      `INSERT INTO admin_users (id, email, display_name, password_hash, role, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'SUPER_ADMIN', 'ACTIVE', NOW(), NOW())`,
      [uuid(), superEmail, 'Avail Admin', passwordHash],
    );

    child = spawn(process.execPath, [path.join(__dirname, '..', 'dist', 'main.js')], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        API_PORT: apiPort,
        DATABASE_URL: databaseUrl,
        CORS_ORIGINS: origin,
        SWAGGER_ENABLED: 'false',
        TRUST_PROXY: 'false',
        SESSION_HMAC_SECRET: 'test-session-hmac-secret',
        LOGIN_THROTTLE_LIMIT: '1000',
        MEDIA_STORAGE: 'local',
        MEDIA_LOCAL_ROOT: './storage/media-test-availability',
        MEDIA_PUBLIC_BASE_URL: `http://127.0.0.1:${apiPort}/api/v1/media`,
        LOG_LEVEL: 'error',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk: Buffer) => {
      bootLog += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      bootLog += chunk.toString();
    });

    let ready = false;
    for (let i = 0; i < 60; i += 1) {
      try {
        const res = await fetch(`${base}/api/v1/health`);
        if (res.ok) {
          ready = true;
          break;
        }
      } catch {
        // retry
      }
      await delay(500);
    }
    if (!ready) {
      throw new Error(`API failed to start on :${apiPort}\n${bootLog}`);
    }
  }, 120_000);

  afterAll(async () => {
    child?.kill('SIGTERM');
    await pool?.end();
  });

  function agent() {
    return request.agent(base);
  }

  async function login() {
    const http = agent();
    await http
      .post('/api/v1/admin/auth/login')
      .set('Origin', origin)
      .send({ email: superEmail, password })
      .expect(201);
    return http;
  }

  async function createDraft(http: request.SuperAgentTest, slug: string) {
    const created = await http
      .post('/api/v1/admin/catalog/products')
      .set('Origin', origin)
      .send({ name: 'Availability Fixture', slug, availability: 'AVAILABLE' })
      .expect(201);
    return created.body as {
      id: string;
      version: number;
      availability: string;
    };
  }

  it('updates AVAILABLE ↔ TEMPORARILY_UNAVAILABLE with OCC, audit, and list version', async () => {
    const http = await login();
    const stockishBefore = await pool.query(`
      SELECT count(*)::int AS c
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name ~* '(stock|inventory|supply|movement|lot)'
    `);

    const product = await createDraft(http, `avail-ok-${Date.now()}`);
    expect(product.availability).toBe('AVAILABLE');
    const versionAtCreate = product.version;

    const unavailable = await http
      .patch(`/api/v1/admin/catalog/products/${product.id}`)
      .set('Origin', origin)
      .send({ expectedVersion: versionAtCreate, availability: 'TEMPORARILY_UNAVAILABLE' })
      .expect(200);

    expect(unavailable.body.availability).toBe('TEMPORARILY_UNAVAILABLE');
    expect(unavailable.body.version).toBe(versionAtCreate + 1);

    const availableAgain = await http
      .patch(`/api/v1/admin/catalog/products/${product.id}`)
      .set('Origin', origin)
      .send({
        expectedVersion: unavailable.body.version,
        availability: 'AVAILABLE',
      })
      .expect(200);
    expect(availableAgain.body.availability).toBe('AVAILABLE');
    expect(availableAgain.body.version).toBe(unavailable.body.version + 1);

    const list = await http
      .get('/api/v1/admin/catalog/products')
      .query({ search: 'Availability Fixture', pageSize: 50 })
      .expect(200);
    const listed = list.body.items.find((item: { id: string }) => item.id === product.id);
    expect(listed).toBeDefined();
    expect(listed.version).toBe(availableAgain.body.version);
    expect(listed.availability).toBe('AVAILABLE');

    const audit = await pool.query(
      `SELECT metadata FROM audit_logs
       WHERE action = 'PRODUCT_UPDATED' AND entity_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [product.id],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].metadata.previousAvailability).toBe('TEMPORARILY_UNAVAILABLE');
    expect(audit.rows[0].metadata.newAvailability).toBe('AVAILABLE');

    const stockishAfter = await pool.query(`
      SELECT count(*)::int AS c
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name ~* '(stock|inventory|supply|movement|lot)'
    `);
    expect(stockishAfter.rows[0].c).toBe(stockishBefore.rows[0].c);
  }, 120_000);

  it('returns 409 on stale expectedVersion and does not write availability audit', async () => {
    const http = await login();
    const product = await createDraft(http, `avail-occ-${Date.now()}`);
    const auditBefore = await pool.query(
      `SELECT count(*)::int AS c FROM audit_logs
       WHERE action = 'PRODUCT_UPDATED' AND entity_id = $1
         AND metadata ? 'newAvailability'`,
      [product.id],
    );

    await http
      .patch(`/api/v1/admin/catalog/products/${product.id}`)
      .set('Origin', origin)
      .send({ expectedVersion: product.version + 99, availability: 'PREORDER' })
      .expect(409);

    const row = await pool.query(`SELECT availability, version FROM products WHERE id = $1`, [
      product.id,
    ]);
    expect(row.rows[0].availability).toBe('AVAILABLE');
    expect(row.rows[0].version).toBe(product.version);

    const auditAfter = await pool.query(
      `SELECT count(*)::int AS c FROM audit_logs
       WHERE action = 'PRODUCT_UPDATED' AND entity_id = $1
         AND metadata ? 'newAvailability'`,
      [product.id],
    );
    expect(auditAfter.rows[0].c).toBe(auditBefore.rows[0].c);
  }, 60_000);

  it('returns 404 for missing product and 401 without session', async () => {
    await request(base)
      .patch(`/api/v1/admin/catalog/products/${uuid()}`)
      .set('Origin', origin)
      .send({ expectedVersion: 1, availability: 'SEASONAL' })
      .expect(401);

    const http = await login();
    await http
      .patch(`/api/v1/admin/catalog/products/${uuid()}`)
      .set('Origin', origin)
      .send({ expectedVersion: 1, availability: 'SEASONAL' })
      .expect(404);
  }, 60_000);

  it('rejects invalid availability values', async () => {
    const http = await login();
    const product = await createDraft(http, `avail-bad-${Date.now()}`);
    await http
      .patch(`/api/v1/admin/catalog/products/${product.id}`)
      .set('Origin', origin)
      .send({ expectedVersion: product.version, availability: 'OUT_OF_STOCK' })
      .expect(400);
  }, 60_000);
});

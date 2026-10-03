/**
 * Bulk product operations — Nest API + real PostgreSQL.
 * Reuses publish / unpublish / update (availability) with per-item OCC + partial success.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import request from 'supertest';
import pg from 'pg';
import * as argon2 from 'argon2';
import sharp from 'sharp';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://bouquet:bouquet_dev_password@localhost:5433/bouquet_one?schema=public';
const apiPort = String(3701 + Math.floor(Math.random() * 200));
const origin = 'http://localhost:3000';
const password = 'BulkPass12!!';

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

describe('Product bulk operations (integration)', () => {
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

    await pool.query('DELETE FROM product_media');
    await pool.query('DELETE FROM product_variants');
    await pool.query(`DELETE FROM products WHERE slug LIKE 'bulk-%'`);
    await pool.query('DELETE FROM admin_sessions');
    await pool.query(`DELETE FROM admin_users WHERE email LIKE 'bulk-admin-%'`);

    superEmail = `bulk-admin-${Date.now()}@example.com`;
    const passwordHash = await hashPassword(password);
    await pool.query(
      `INSERT INTO admin_users (id, email, display_name, password_hash, role, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'SUPER_ADMIN', 'ACTIVE', NOW(), NOW())`,
      [uuid(), superEmail, 'Bulk Admin', passwordHash],
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
        MEDIA_LOCAL_ROOT: './storage/media-test-bulk',
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

  async function createPublishable(
    http: request.SuperAgentTest,
    slug: string,
  ): Promise<{ id: string; version: number }> {
    let product = await http
      .post('/api/v1/admin/catalog/products')
      .set('Origin', origin)
      .send({
        name: `Bulk ${slug}`,
        slug,
        shortDescription: 'Коротко',
        description: 'Полное описание для публикации',
      })
      .expect(201);

    product = await http
      .put(`/api/v1/admin/catalog/products/${product.body.id}/variants`)
      .set('Origin', origin)
      .send({
        expectedVersion: product.body.version,
        variants: [{ name: 'Std', priceMinor: '9900', sortOrder: 0, status: 'ACTIVE' }],
      })
      .expect(200);

    const png = await sharp({
      create: { width: 400, height: 400, channels: 3, background: '#aa2244' },
    })
      .png()
      .toBuffer();

    product = await http
      .post(`/api/v1/admin/catalog/products/${product.body.id}/media`)
      .set('Origin', origin)
      .attach('file', png, 'bulk.png')
      .expect(201);

    return { id: product.body.id as string, version: product.body.version as number };
  }

  it('bulk SET_AVAILABILITY + mixed OCC conflict (partial success)', async () => {
    const http = await login();
    const a = await createPublishable(http, `bulk-avail-a-${Date.now()}`);
    const b = await createPublishable(http, `bulk-avail-b-${Date.now()}`);

    const result = await http
      .post('/api/v1/admin/catalog/products/bulk')
      .set('Origin', origin)
      .send({
        operation: 'SET_AVAILABILITY',
        availability: 'TEMPORARILY_UNAVAILABLE',
        items: [
          { productId: a.id, expectedVersion: a.version },
          { productId: b.id, expectedVersion: b.version + 99 },
        ],
      })
      .expect(200);

    expect(result.body.operation).toBe('SET_AVAILABILITY');
    expect(result.body.succeeded).toBe(1);
    expect(result.body.failed).toBe(1);
    const byId = new Map(
      result.body.results.map((row: { productId: string }) => [row.productId, row]),
    );
    expect(byId.get(a.id).status).toBe('SUCCESS');
    expect(byId.get(a.id).availability).toBe('TEMPORARILY_UNAVAILABLE');
    expect(byId.get(b.id).status).toBe('CONFLICT');

    const rowA = await pool.query(`SELECT availability, version FROM products WHERE id = $1`, [
      a.id,
    ]);
    const rowB = await pool.query(`SELECT availability, version FROM products WHERE id = $1`, [
      b.id,
    ]);
    expect(rowA.rows[0].availability).toBe('TEMPORARILY_UNAVAILABLE');
    expect(rowA.rows[0].version).toBe(a.version + 1);
    expect(rowB.rows[0].availability).toBe('AVAILABLE');
    expect(rowB.rows[0].version).toBe(b.version);

    const audit = await pool.query(
      `SELECT count(*)::int AS c FROM audit_logs
       WHERE action = 'PRODUCT_UPDATED' AND entity_id = $1
         AND metadata->>'bulk' = 'true'`,
      [a.id],
    );
    expect(audit.rows[0].c).toBeGreaterThan(0);
  }, 180_000);

  it('bulk publish / unpublish reuse domain rules', async () => {
    const http = await login();
    const ready = await createPublishable(http, `bulk-pub-${Date.now()}`);
    const draftOnly = await http
      .post('/api/v1/admin/catalog/products')
      .set('Origin', origin)
      .send({ name: 'Incomplete', slug: `bulk-incomplete-${Date.now()}` })
      .expect(201);

    const published = await http
      .post('/api/v1/admin/catalog/products/bulk')
      .set('Origin', origin)
      .send({
        operation: 'PUBLISH',
        items: [
          { productId: ready.id, expectedVersion: ready.version },
          {
            productId: draftOnly.body.id,
            expectedVersion: draftOnly.body.version,
          },
        ],
      })
      .expect(200);

    expect(published.body.succeeded).toBe(1);
    expect(published.body.failed).toBe(1);
    const pubById = new Map(
      published.body.results.map((row: { productId: string }) => [row.productId, row]),
    );
    expect(pubById.get(ready.id).status).toBe('SUCCESS');
    expect(pubById.get(ready.id).lifecycle).toBe('PUBLISHED');
    expect(pubById.get(draftOnly.body.id).status).toBe('VALIDATION_ERROR');

    const unpub = await http
      .post('/api/v1/admin/catalog/products/bulk')
      .set('Origin', origin)
      .send({
        operation: 'UNPUBLISH',
        items: [{ productId: ready.id, expectedVersion: pubById.get(ready.id).version }],
      })
      .expect(200);
    expect(unpub.body.succeeded).toBe(1);
    expect(unpub.body.results[0].lifecycle).toBe('DRAFT');
  }, 180_000);

  it('rejects unauthenticated and oversized batches', async () => {
    await request(base)
      .post('/api/v1/admin/catalog/products/bulk')
      .set('Origin', origin)
      .send({
        operation: 'UNPUBLISH',
        items: [{ productId: uuid(), expectedVersion: 1 }],
      })
      .expect(401);

    const http = await login();
    const items = Array.from({ length: 51 }, () => ({
      productId: uuid(),
      expectedVersion: 1,
    }));
    await http
      .post('/api/v1/admin/catalog/products/bulk')
      .set('Origin', origin)
      .send({ operation: 'UNPUBLISH', items })
      .expect(400);
  }, 60_000);
});

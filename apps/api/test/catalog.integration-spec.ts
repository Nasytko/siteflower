/**
 * Catalog domain integration tests against spawned Nest API + real PostgreSQL.
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
const apiPort = String(3201 + Math.floor(Math.random() * 200));
const origin = 'http://localhost:3000';
const password = 'CatalogPass12!!';

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

describe('Catalog (integration)', () => {
  let child: ChildProcessWithoutNullStreams;
  let pool: pg.Pool;
  let superEmail: string;
  const base = `http://127.0.0.1:${apiPort}`;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: databaseUrl });
    await pool.query('DELETE FROM bestseller_group_products');
    await pool.query('DELETE FROM bestseller_groups');
    await pool.query('DELETE FROM product_promotion_variant_prices');
    await pool.query('DELETE FROM product_promotions');
    await pool.query('DELETE FROM product_media');
    await pool.query('DELETE FROM media_derivatives');
    await pool.query('DELETE FROM media_assets');
    await pool.query('DELETE FROM product_variants');
    await pool.query('DELETE FROM product_components');
    await pool.query('DELETE FROM product_occasions');
    await pool.query('DELETE FROM product_recipients');
    await pool.query('DELETE FROM product_colors');
    await pool.query('DELETE FROM product_family_members');
    await pool.query('DELETE FROM product_families');
    await pool.query('DELETE FROM products');
    await pool.query('DELETE FROM slug_redirects');
    await pool.query('DELETE FROM audit_logs');
    await pool.query('DELETE FROM admin_sessions');
    await pool.query('DELETE FROM admin_users');

    superEmail = `catalog-admin-${Date.now()}@example.com`;
    const passwordHash = await hashPassword(password);
    await pool.query(
      `INSERT INTO admin_users (id, email, display_name, password_hash, role, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'SUPER_ADMIN', 'ACTIVE', NOW(), NOW())`,
      [uuid(), superEmail, 'Catalog Admin', passwordHash],
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
        MEDIA_LOCAL_ROOT: './storage/media-test',
        MEDIA_PUBLIC_BASE_URL: `http://127.0.0.1:${apiPort}/media`,
        LOG_LEVEL: 'error',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
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
      throw new Error(`API failed to start on :${apiPort}`);
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

  it('creates draft, rejects publish without requirements, then publishes with media/variant', async () => {
    const http = await login();
    const created = await http
      .post('/api/v1/admin/catalog/products')
      .set('Origin', origin)
      .send({ name: 'Ameli Test' })
      .expect(201);

    expect(created.body.lifecycle).toBe('DRAFT');

    await http
      .post(`/api/v1/admin/catalog/products/${created.body.id}/publish`)
      .set('Origin', origin)
      .send({ expectedVersion: created.body.version })
      .expect(400);

    const png = await sharp({
      create: { width: 800, height: 800, channels: 3, background: { r: 200, g: 40, b: 80 } },
    })
      .png()
      .toBuffer();

    let product = await http
      .patch(`/api/v1/admin/catalog/products/${created.body.id}`)
      .set('Origin', origin)
      .send({
        expectedVersion: created.body.version,
        shortDescription: 'Нежный букет',
        description: 'Полное описание букета',
      })
      .expect(200);

    product = await http
      .put(`/api/v1/admin/catalog/products/${created.body.id}/variants`)
      .set('Origin', origin)
      .send({
        expectedVersion: product.body.version,
        variants: [{ name: 'S', priceMinor: '9900', sortOrder: 0, status: 'ACTIVE' }],
      })
      .expect(200);

    product = await http
      .post(`/api/v1/admin/catalog/products/${created.body.id}/media`)
      .set('Origin', origin)
      .attach('file', png, 'ameli.png')
      .expect(201);

    expect(product.body.media.length).toBe(1);

    const published = await http
      .post(`/api/v1/admin/catalog/products/${created.body.id}/publish`)
      .set('Origin', origin)
      .send({ expectedVersion: product.body.version })
      .expect(201);

    expect(published.body.lifecycle).toBe('PUBLISHED');

    const publicList = await request(base).get('/api/v1/catalog/products').expect(200);
    expect(
      publicList.body.items.some((i: { slug: string }) => i.slug === published.body.slug),
    ).toBe(true);

    const publicOne = await request(base)
      .get(`/api/v1/catalog/products/${published.body.slug}`)
      .expect(200);
    expect(publicOne.body.product).toBeDefined();
    expect(publicOne.body.canonicalSlug).toBe(published.body.slug);
    expect(publicOne.body.redirectedFrom).toBeNull();
    expect(publicOne.body.product.version).toBeUndefined();
  });

  it('returns 409 on stale optimistic update', async () => {
    const http = await login();
    const created = await http
      .post('/api/v1/admin/catalog/products')
      .set('Origin', origin)
      .send({ name: 'OCC Test' })
      .expect(201);

    await http
      .patch(`/api/v1/admin/catalog/products/${created.body.id}`)
      .set('Origin', origin)
      .send({ expectedVersion: created.body.version, name: 'OCC Test 2' })
      .expect(200);

    await http
      .patch(`/api/v1/admin/catalog/products/${created.body.id}`)
      .set('Origin', origin)
      .send({ expectedVersion: created.body.version, name: 'stale' })
      .expect(409);
  });

  it('creates slug redirect and resolves publicly', async () => {
    const http = await login();
    const created = await http
      .post('/api/v1/admin/catalog/products')
      .set('Origin', origin)
      .send({ name: 'Redirect Flower' })
      .expect(201);

    const png = await sharp({
      create: { width: 400, height: 400, channels: 3, background: '#336699' },
    })
      .jpeg()
      .toBuffer();

    let product = await http
      .patch(`/api/v1/admin/catalog/products/${created.body.id}`)
      .set('Origin', origin)
      .send({
        expectedVersion: created.body.version,
        shortDescription: 'desc',
        description: 'long desc',
      })
      .expect(200);

    product = await http
      .put(`/api/v1/admin/catalog/products/${created.body.id}/variants`)
      .set('Origin', origin)
      .send({
        expectedVersion: product.body.version,
        variants: [{ name: 'Std', priceMinor: '5000', sortOrder: 0, status: 'ACTIVE' }],
      })
      .expect(200);

    product = await http
      .post(`/api/v1/admin/catalog/products/${created.body.id}/media`)
      .set('Origin', origin)
      .attach('file', png, 'x.jpg')
      .expect(201);

    product = await http
      .post(`/api/v1/admin/catalog/products/${created.body.id}/publish`)
      .set('Origin', origin)
      .send({ expectedVersion: product.body.version })
      .expect(201);

    const oldSlug = product.body.slug;
    product = await http
      .patch(`/api/v1/admin/catalog/products/${created.body.id}`)
      .set('Origin', origin)
      .send({
        expectedVersion: product.body.version,
        slug: `${oldSlug}-premium`,
      })
      .expect(200);

    const redirected = await request(base).get(`/api/v1/catalog/products/${oldSlug}`).expect(200);
    expect(redirected.body.redirectedFrom).toBe(oldSlug);
    expect(redirected.body.canonicalSlug).toBe(product.body.slug);
    expect(redirected.body.product.slug).toBe(product.body.slug);
  });

  it('hides drafts from public catalog', async () => {
    const http = await login();
    const created = await http
      .post('/api/v1/admin/catalog/products')
      .set('Origin', origin)
      .send({ name: 'Secret Draft', slug: `secret-draft-${Date.now()}` })
      .expect(201);

    await request(base).get(`/api/v1/catalog/products/${created.body.slug}`).expect(404);
  });
});

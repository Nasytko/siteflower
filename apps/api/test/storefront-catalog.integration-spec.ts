/**
 * Phase 3 storefront catalog filters / taxonomies / sitemap / related.
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
const apiPort = String(3401 + Math.floor(Math.random() * 200));
const origin = 'http://localhost:3000';
const password = 'StorefrontPass12!!';

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

describe('Storefront catalog (integration)', () => {
  let child: ChildProcessWithoutNullStreams;
  let pool: pg.Pool;
  let superEmail: string;
  const base = `http://127.0.0.1:${apiPort}`;
  let http: request.SuperAgentTest;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: databaseUrl });
    await pool.query('DELETE FROM collection_products');
    await pool.query('DELETE FROM collections');
    await pool.query('DELETE FROM product_media');
    await pool.query('DELETE FROM media_derivatives');
    await pool.query('DELETE FROM media_assets');
    await pool.query('DELETE FROM product_variants');
    await pool.query('DELETE FROM product_components');
    await pool.query('DELETE FROM product_categories');
    await pool.query('DELETE FROM product_occasions');
    await pool.query('DELETE FROM product_recipients');
    await pool.query('DELETE FROM product_styles');
    await pool.query('DELETE FROM product_colors');
    await pool.query('DELETE FROM products');
    await pool.query('DELETE FROM categories');
    await pool.query('DELETE FROM occasions');
    await pool.query('DELETE FROM recipients');
    await pool.query('DELETE FROM styles');
    await pool.query('DELETE FROM colors');
    await pool.query('DELETE FROM flowers');
    await pool.query('DELETE FROM slug_redirects');
    await pool.query('DELETE FROM audit_logs');
    await pool.query('DELETE FROM admin_sessions');
    await pool.query('DELETE FROM admin_users');

    superEmail = `storefront-admin-${Date.now()}@example.com`;
    const passwordHash = await hashPassword(password);
    await pool.query(
      `INSERT INTO admin_users (id, email, display_name, password_hash, role, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'SUPER_ADMIN', 'ACTIVE', NOW(), NOW())`,
      [uuid(), superEmail, 'Storefront Admin', passwordHash],
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
        MEDIA_LOCAL_ROOT: './storage/media-test-storefront',
        MEDIA_PUBLIC_BASE_URL: `http://127.0.0.1:${apiPort}/media`,
        LOG_LEVEL: 'warn',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const bootLogs: string[] = [];
    let exitCode: number | null = null;
    child.stdout.on('data', (chunk: Buffer) => bootLogs.push(chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => bootLogs.push(chunk.toString()));
    child.on('exit', (code) => {
      exitCode = code;
    });

    let ready = false;
    for (let i = 0; i < 90; i += 1) {
      if (exitCode !== null) break;
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
      throw new Error(
        `API failed to start on :${apiPort} (exit=${exitCode})\n${bootLogs.join('').slice(-4000)}`,
      );
    }

    http = request.agent(base);
    await http
      .post('/api/v1/admin/auth/login')
      .set('Origin', origin)
      .send({ email: superEmail, password })
      .expect(201);
  }, 120_000);

  afterAll(async () => {
    child?.kill('SIGTERM');
    await pool?.end();
  });

  async function publishProduct(input: {
    name: string;
    slug?: string;
    priceMinor: string;
    featured?: boolean;
    categoryIds?: string[];
    styleIds?: string[];
    colorIds?: string[];
    flowerId?: string;
  }) {
    let product = await http
      .post('/api/v1/admin/catalog/products')
      .set('Origin', origin)
      .send({ name: input.name, ...(input.slug ? { slug: input.slug } : {}) })
      .expect(201);

    product = await http
      .patch(`/api/v1/admin/catalog/products/${product.body.id}`)
      .set('Origin', origin)
      .send({
        expectedVersion: product.body.version,
        shortDescription: `${input.name} short`,
        description: `${input.name} long description`,
        ...(input.featured === undefined ? {} : { featured: input.featured }),
      })
      .expect(200);

    product = await http
      .put(`/api/v1/admin/catalog/products/${product.body.id}/variants`)
      .set('Origin', origin)
      .send({
        expectedVersion: product.body.version,
        variants: [{ name: 'Std', priceMinor: input.priceMinor, sortOrder: 0, status: 'ACTIVE' }],
      })
      .expect(200);

    if (input.flowerId) {
      product = await http
        .put(`/api/v1/admin/catalog/products/${product.body.id}/components`)
        .set('Origin', origin)
        .send({
          expectedVersion: product.body.version,
          components: [
            {
              flowerId: input.flowerId,
              displayName: 'Rose',
              quantity: 5,
              unit: 'STEM',
              sortOrder: 0,
            },
          ],
        })
        .expect(200);
    }

    if (input.categoryIds || input.styleIds || input.colorIds) {
      product = await http
        .put(`/api/v1/admin/catalog/products/${product.body.id}/taxonomies`)
        .set('Origin', origin)
        .send({
          expectedVersion: product.body.version,
          categoryIds: input.categoryIds ?? [],
          styleIds: input.styleIds ?? [],
          colorIds: input.colorIds ?? [],
        })
        .expect(200);
    }

    const png = await sharp({
      create: { width: 400, height: 400, channels: 3, background: '#aa3355' },
    })
      .png()
      .toBuffer();

    product = await http
      .post(`/api/v1/admin/catalog/products/${product.body.id}/media`)
      .set('Origin', origin)
      .attach('file', png, `${product.body.slug}.png`)
      .expect(201);

    product = await http
      .post(`/api/v1/admin/catalog/products/${product.body.id}/publish`)
      .set('Origin', origin)
      .send({ expectedVersion: product.body.version })
      .expect(201);

    return product.body as { id: string; slug: string; version: number };
  }

  it('filters by price and sorts by price_asc', async () => {
    const cheap = await publishProduct({ name: 'Cheap Bloom', priceMinor: '3000' });
    const mid = await publishProduct({ name: 'Mid Bloom', priceMinor: '8000' });
    const pricey = await publishProduct({ name: 'Pricey Bloom', priceMinor: '15000' });

    const filtered = await request(base)
      .get('/api/v1/catalog/products')
      .query({ minPriceMinor: '5000', maxPriceMinor: '10000' })
      .expect(200);

    const filteredSlugs = filtered.body.items.map((item: { slug: string }) => item.slug);
    expect(filteredSlugs).toContain(mid.slug);
    expect(filteredSlugs).not.toContain(cheap.slug);
    expect(filteredSlugs).not.toContain(pricey.slug);

    const sorted = await request(base)
      .get('/api/v1/catalog/products')
      .query({ sort: 'price_asc', pageSize: 48 })
      .expect(200);

    const prices = sorted.body.items.map(
      (item: { price: { minMinor: string } | null }) => item.price?.minMinor,
    );
    const numeric = prices.filter(Boolean).map((value: string) => BigInt(value));
    for (let i = 1; i < numeric.length; i += 1) {
      expect(numeric[i]! >= numeric[i - 1]!).toBe(true);
    }
  });

  it('serves taxonomy page, related products, and sitemap without drafts', async () => {
    const style = await http
      .post('/api/v1/admin/catalog/styles')
      .set('Origin', origin)
      .send({ name: 'Romantic Style', slug: `romantic-${Date.now()}`, description: 'Soft' })
      .expect(201);

    const flower = await http
      .post('/api/v1/admin/catalog/flowers')
      .set('Origin', origin)
      .send({ name: 'Peony', slug: `peony-${Date.now()}` })
      .expect(201);

    const category = await http
      .post('/api/v1/admin/catalog/categories')
      .set('Origin', origin)
      .send({ name: 'Bouquets', slug: `bouquets-${Date.now()}` })
      .expect(201);

    const primary = await publishProduct({
      name: 'Primary Related',
      priceMinor: '7000',
      styleIds: [style.body.id],
      categoryIds: [category.body.id],
      flowerId: flower.body.id,
    });
    const sibling = await publishProduct({
      name: 'Sibling Related',
      priceMinor: '7500',
      styleIds: [style.body.id],
    });
    await publishProduct({ name: 'Unrelated Other', priceMinor: '9000' });

    const draft = await http
      .post('/api/v1/admin/catalog/products')
      .set('Origin', origin)
      .send({ name: 'Draft Hidden', slug: `draft-hidden-${Date.now()}` })
      .expect(201);

    const taxonomy = await request(base)
      .get(`/api/v1/catalog/taxonomies/style/${style.body.slug}`)
      .expect(200);
    expect(taxonomy.body.kind).toBe('style');
    expect(taxonomy.body.slug).toBe(style.body.slug);
    expect(taxonomy.body.seo.resolvedTitle).toContain(style.body.name);

    await request(base)
      .get(`/api/v1/catalog/taxonomies/style/missing-${Date.now()}`)
      .expect(404);

    const styles = await request(base).get('/api/v1/catalog/styles').expect(200);
    expect(styles.body.some((item: { slug: string }) => item.slug === style.body.slug)).toBe(true);

    const related = await request(base)
      .get(`/api/v1/catalog/products/${primary.slug}/related`)
      .query({ limit: 8 })
      .expect(200);
    const relatedSlugs = related.body.map((item: { slug: string }) => item.slug);
    expect(relatedSlugs).toContain(sibling.slug);
    expect(relatedSlugs).not.toContain(primary.slug);

    const sitemap = await request(base).get('/api/v1/catalog/sitemap').expect(200);
    const paths = sitemap.body.map((entry: { path: string }) => entry.path);
    expect(paths).toContain(`/bukety/${primary.slug}`);
    expect(paths).toContain(`/cvety/${flower.body.slug}`);
    expect(paths).not.toContain(`/bukety/${draft.body.slug}`);
  });

  it('signals redirect when product slug alias is used', async () => {
    const product = await publishProduct({
      name: 'Alias Bloom',
      slug: `alias-bloom-${Date.now()}`,
      priceMinor: '5500',
    });
    const oldSlug = product.slug;

    const renamed = await http
      .patch(`/api/v1/admin/catalog/products/${product.id}`)
      .set('Origin', origin)
      .send({
        expectedVersion: product.version,
        slug: `${oldSlug}-new`,
      })
      .expect(200);

    const resolved = await request(base).get(`/api/v1/catalog/products/${oldSlug}`).expect(200);
    expect(resolved.body.redirectedFrom).toBe(oldSlug);
    expect(resolved.body.canonicalSlug).toBe(renamed.body.slug);
    expect(resolved.body.product.slug).toBe(renamed.body.slug);
  });
});

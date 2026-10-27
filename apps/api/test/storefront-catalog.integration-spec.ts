/**
 * Storefront catalog filters / taxonomies / promotions / bestsellers / sitemap.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import request from 'supertest';
import pg from 'pg';
import * as argon2 from 'argon2';
import sharp from 'sharp';
import { resolveIntegrationDatabaseUrl } from './integration-database-url';

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
  let databaseUrl: string;
  const base = `http://127.0.0.1:${apiPort}`;
  let http: request.SuperAgentTest;

  beforeAll(async () => {
    databaseUrl = await resolveIntegrationDatabaseUrl();
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
    await pool.query('DELETE FROM budget_ranges');
    await pool.query('DELETE FROM flower_items');
    await pool.query('DELETE FROM flower_varieties');
    await pool.query('DELETE FROM flower_types');
    await pool.query('DELETE FROM flower_origins');
    await pool.query('DELETE FROM occasions');
    await pool.query('DELETE FROM recipients');
    await pool.query('DELETE FROM colors');
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
    variantName?: string;
    occasionIds?: string[];
    recipientIds?: string[];
    colorIds?: string[];
    flowerItemId?: string;
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
      })
      .expect(200);

    product = await http
      .put(`/api/v1/admin/catalog/products/${product.body.id}/variants`)
      .set('Origin', origin)
      .send({
        expectedVersion: product.body.version,
        variants: [
          {
            name: input.variantName ?? 'Std',
            priceMinor: input.priceMinor,
            sortOrder: 0,
            status: 'ACTIVE',
          },
        ],
      })
      .expect(200);

    let flowerItemId = input.flowerItemId;
    if (!flowerItemId) {
      const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const flowerType = await http
        .post('/api/v1/admin/catalog/flower-refs/types')
        .set('Origin', origin)
        .send({ name: `Type ${stamp}`, slug: `ft-${stamp}` })
        .expect(201);
      const flowerItem = await http
        .post('/api/v1/admin/catalog/flower-refs/items')
        .set('Origin', origin)
        .send({ flowerTypeId: flowerType.body.id, heightCm: 50 })
        .expect(201);
      flowerItemId = flowerItem.body.id as string;
    }

    product = await http
      .put(`/api/v1/admin/catalog/products/${product.body.id}/components`)
      .set('Origin', origin)
      .send({
        expectedVersion: product.body.version,
        components: [
          {
            flowerItemId,
            displayName: 'Primary stem',
            quantity: 5,
            unit: 'STEM',
            sortOrder: 0,
          },
        ],
      })
      .expect(200);

    if (input.occasionIds || input.recipientIds || input.colorIds) {
      product = await http
        .put(`/api/v1/admin/catalog/products/${product.body.id}/taxonomies`)
        .set('Origin', origin)
        .send({
          expectedVersion: product.body.version,
          occasionIds: input.occasionIds ?? [],
          recipientIds: input.recipientIds ?? [],
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

    return product.body as {
      id: string;
      slug: string;
      version: number;
      variants: Array<{ id: string; priceMinor: string; effectivePriceMinor: string }>;
    };
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

  it('filters by budget, multi color/flower-type/occasion/recipient', async () => {
    const stamp = Date.now();

    const occasionA = await http
      .post('/api/v1/admin/catalog/occasions')
      .set('Origin', origin)
      .send({ name: 'Birthday', slug: `birthday-${stamp}` })
      .expect(201);
    const occasionB = await http
      .post('/api/v1/admin/catalog/occasions')
      .set('Origin', origin)
      .send({ name: 'Just Because', slug: `just-${stamp}` })
      .expect(201);

    const recipient = await http
      .post('/api/v1/admin/catalog/recipients')
      .set('Origin', origin)
      .send({ name: 'For Mom', slug: `mom-${stamp}` })
      .expect(201);

    const colorPink = await http
      .post('/api/v1/admin/catalog/colors')
      .set('Origin', origin)
      .send({ name: 'Pink', slug: `pink-${stamp}`, swatch: '#f3c4d4' })
      .expect(201);
    const colorWhite = await http
      .post('/api/v1/admin/catalog/colors')
      .set('Origin', origin)
      .send({ name: 'White', slug: `white-${stamp}`, swatch: '#f5f2ea' })
      .expect(201);

    const typeRose = await http
      .post('/api/v1/admin/catalog/flower-refs/types')
      .set('Origin', origin)
      .send({ name: 'Rose', slug: `rose-${stamp}` })
      .expect(201);
    const typePeony = await http
      .post('/api/v1/admin/catalog/flower-refs/types')
      .set('Origin', origin)
      .send({ name: 'Peony', slug: `peony-${stamp}` })
      .expect(201);
    const itemRose = await http
      .post('/api/v1/admin/catalog/flower-refs/items')
      .set('Origin', origin)
      .send({ flowerTypeId: typeRose.body.id, heightCm: 60 })
      .expect(201);
    const itemPeony = await http
      .post('/api/v1/admin/catalog/flower-refs/items')
      .set('Origin', origin)
      .send({ flowerTypeId: typePeony.body.id, heightCm: 50 })
      .expect(201);

    const budgetMid = await http
      .post('/api/v1/admin/catalog/budget-ranges')
      .set('Origin', origin)
      .send({ label: `Mid ${stamp}`, minMinor: '7000', maxMinor: '12000', sortOrder: 10 })
      .expect(201);

    const match = await publishProduct({
      name: 'Facet Match',
      slug: `facet-match-${stamp}`,
      priceMinor: '9000',
      occasionIds: [occasionA.body.id],
      recipientIds: [recipient.body.id],
      colorIds: [colorPink.body.id],
      flowerItemId: itemRose.body.id,
      variantName: '7 шт',
    });
    const orMatch = await publishProduct({
      name: 'Facet Or Color',
      slug: `facet-or-${stamp}`,
      priceMinor: '9500',
      occasionIds: [occasionB.body.id],
      colorIds: [colorWhite.body.id],
      flowerItemId: itemPeony.body.id,
      variantName: '15 шт',
    });
    const miss = await publishProduct({
      name: 'Facet Miss',
      slug: `facet-miss-${stamp}`,
      priceMinor: '20000',
      colorIds: [colorPink.body.id],
      variantName: '21 шт',
    });

    const byBudget = await request(base)
      .get('/api/v1/catalog/products')
      .query({ budgetRangeIds: budgetMid.body.id })
      .expect(200);
    const budgetSlugs = byBudget.body.items.map((item: { slug: string }) => item.slug);
    expect(budgetSlugs).toContain(match.slug);
    expect(budgetSlugs).toContain(orMatch.slug);
    expect(budgetSlugs).not.toContain(miss.slug);

    const byMultiColor = await request(base)
      .get('/api/v1/catalog/products')
      .query({ colorSlugs: `${colorPink.body.slug},${colorWhite.body.slug}` })
      .expect(200);
    const colorSlugs = byMultiColor.body.items.map((item: { slug: string }) => item.slug);
    expect(colorSlugs).toContain(match.slug);
    expect(colorSlugs).toContain(orMatch.slug);

    const byFlowerType = await request(base)
      .get('/api/v1/catalog/products')
      .query({ flowerTypeSlug: typeRose.body.slug })
      .expect(200);
    const flowerTypeSlugs = byFlowerType.body.items.map((item: { slug: string }) => item.slug);
    expect(flowerTypeSlugs).toContain(match.slug);
    expect(flowerTypeSlugs).not.toContain(orMatch.slug);

    const byOccasion = await request(base)
      .get('/api/v1/catalog/products')
      .query({ occasionSlugs: `${occasionA.body.slug},${occasionB.body.slug}` })
      .expect(200);
    const occasionSlugs = byOccasion.body.items.map((item: { slug: string }) => item.slug);
    expect(occasionSlugs).toContain(match.slug);
    expect(occasionSlugs).toContain(orMatch.slug);

    const byRecipient = await request(base)
      .get('/api/v1/catalog/products')
      .query({ recipientSlugs: recipient.body.slug })
      .expect(200);
    expect(byRecipient.body.items.map((item: { slug: string }) => item.slug)).toContain(match.slug);

    const budgetRanges = await request(base).get('/api/v1/catalog/budget-ranges').expect(200);
    expect(budgetRanges.body.some((item: { id: string }) => item.id === budgetMid.body.id)).toBe(
      true,
    );

    const flowerTypes = await request(base).get('/api/v1/catalog/flower-types').expect(200);
    expect(flowerTypes.body.some((item: { slug: string }) => item.slug === typeRose.body.slug)).toBe(
      true,
    );
  });

  it('exposes promotion effective pricing on list and detail', async () => {
    const stamp = Date.now();
    const product = await publishProduct({
      name: 'Promo Bloom',
      slug: `promo-bloom-${stamp}`,
      priceMinor: '10000',
    });

    await http
      .put(`/api/v1/admin/catalog/products/${product.id}/promotion`)
      .set('Origin', origin)
      .send({
        expectedVersion: product.version,
        enabled: true,
        type: 'PERCENT',
        percentOff: 20,
      })
      .expect(200);

    const list = await request(base)
      .get('/api/v1/catalog/products')
      .query({ search: product.slug })
      .expect(200);
    const listed = list.body.items.find((item: { slug: string }) => item.slug === product.slug);
    expect(listed).toBeDefined();
    expect(listed.promotion).toBeTruthy();
    expect(listed.promotion.type).toBe('PERCENT');
    // List `price` stays regular; sale lives on promotion + defaultVariant.
    expect(listed.price.minMinor).toBe('10000');
    expect(listed.promotion.originalPrice.minMinor).toBe('10000');
    expect(listed.promotion.salePrice.minMinor).toBe('8000');
    expect(listed.defaultVariant.priceMinor).toBe('8000');

    const detail = await request(base).get(`/api/v1/catalog/products/${product.slug}`).expect(200);
    expect(detail.body.product.promotion.type).toBe('PERCENT');
    expect(detail.body.product.variants[0].priceMinor).toBe('10000');
    expect(detail.body.product.variants[0].effectivePriceMinor).toBe('8000');

    const promotions = await request(base).get('/api/v1/catalog/promotions').expect(200);
    expect(promotions.body.some((item: { slug: string }) => item.slug === product.slug)).toBe(true);
  });

  it('serves bestsellers public endpoint', async () => {
    const stamp = Date.now();
    const a = await publishProduct({
      name: 'Best A',
      slug: `best-a-${stamp}`,
      priceMinor: '7000',
    });
    const b = await publishProduct({
      name: 'Best B',
      slug: `best-b-${stamp}`,
      priceMinor: '7500',
    });

    const group = await http
      .post('/api/v1/admin/catalog/bestsellers')
      .set('Origin', origin)
      .send({ name: 'Все', slug: `vse-${stamp}`, title: 'Все', sortOrder: 10 })
      .expect(201);

    await http
      .put(`/api/v1/admin/catalog/bestsellers/${group.body.id}/products`)
      .set('Origin', origin)
      .send({
        expectedVersion: group.body.version,
        productIds: [a.id, b.id],
      })
      .expect(200);

    const list = await request(base).get('/api/v1/catalog/bestsellers').expect(200);
    const found = list.body.find((item: { slug: string }) => item.slug === group.body.slug);
    expect(found).toBeDefined();
    expect(found.products.map((p: { slug: string }) => p.slug)).toEqual(
      expect.arrayContaining([a.slug, b.slug]),
    );

    const one = await request(base)
      .get(`/api/v1/catalog/bestsellers/${group.body.slug}`)
      .expect(200);
    expect(one.body.slug).toBe(group.body.slug);
    expect(one.body.products.length).toBe(2);
  });

  it('serves taxonomy page, related products, and sitemap without drafts', async () => {
    const stamp = Date.now();
    const occasion = await http
      .post('/api/v1/admin/catalog/occasions')
      .set('Origin', origin)
      .send({ name: 'Romantic Day', slug: `romantic-${stamp}`, description: 'Soft' })
      .expect(201);

    const flowerType = await http
      .post('/api/v1/admin/catalog/flower-refs/types')
      .set('Origin', origin)
      .send({ name: 'Peony Rel', slug: `peony-rel-${stamp}` })
      .expect(201);
    const flowerItem = await http
      .post('/api/v1/admin/catalog/flower-refs/items')
      .set('Origin', origin)
      .send({ flowerTypeId: flowerType.body.id, heightCm: 55 })
      .expect(201);

    const color = await http
      .post('/api/v1/admin/catalog/colors')
      .set('Origin', origin)
      .send({ name: 'Blush', slug: `blush-${stamp}` })
      .expect(201);

    const primary = await publishProduct({
      name: 'Primary Related',
      priceMinor: '7000',
      occasionIds: [occasion.body.id],
      colorIds: [color.body.id],
      flowerItemId: flowerItem.body.id,
    });
    const sibling = await publishProduct({
      name: 'Sibling Related',
      priceMinor: '7500',
      occasionIds: [occasion.body.id],
    });
    await publishProduct({ name: 'Unrelated Other', priceMinor: '9000' });

    const draft = await http
      .post('/api/v1/admin/catalog/products')
      .set('Origin', origin)
      .send({ name: 'Draft Hidden', slug: `draft-hidden-${stamp}` })
      .expect(201);

    const taxonomy = await request(base)
      .get(`/api/v1/catalog/taxonomies/occasion/${occasion.body.slug}`)
      .expect(200);
    expect(taxonomy.body.kind).toBe('occasion');
    expect(taxonomy.body.slug).toBe(occasion.body.slug);
    expect(taxonomy.body.seo.resolvedTitle).toContain(occasion.body.name);

    await request(base)
      .get(`/api/v1/catalog/taxonomies/occasion/missing-${stamp}`)
      .expect(404);

    const occasions = await request(base).get('/api/v1/catalog/occasions').expect(200);
    expect(occasions.body.some((item: { slug: string }) => item.slug === occasion.body.slug)).toBe(
      true,
    );

    const related = await request(base)
      .get(`/api/v1/catalog/products/${primary.slug}/related`)
      .query({ limit: 8 })
      .expect(200);
    const relatedSlugs = related.body.map((item: { slug: string }) => item.slug);
    expect(relatedSlugs).toContain(sibling.slug);
    expect(relatedSlugs).not.toContain(primary.slug);

    const sitemap = await request(base).get('/api/v1/catalog/sitemap').expect(200);
    const paths = sitemap.body.map((entry: { path: string }) => entry.path);
    expect(paths).toContain(`/products/${primary.slug}`);
    // FlowerType pages are not auto-indexed; discovery is filter-based.
    expect(paths).not.toContain(`/cvety/${flowerType.body.slug}`);
    expect(paths).toContain(`/povod/${occasion.body.slug}`);
    expect(paths).not.toContain(`/products/${draft.body.slug}`);
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

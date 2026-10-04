/**
 * Product duplicate — Nest API + real PostgreSQL.
 * Covers success clone, shared MediaAsset, transactional rollback, auth, and archived sources.
 */
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
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
const apiPort = String(3501 + Math.floor(Math.random() * 200));
const origin = 'http://localhost:3000';
const password = 'DupPass12!!';
const mediaRoot = './storage/media-test-duplicate';

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

async function pngBuffer(): Promise<Buffer> {
  return sharp({
    create: { width: 640, height: 640, channels: 3, background: { r: 190, g: 30, b: 60 } },
  })
    .png()
    .toBuffer();
}

describe('Product duplicate (integration)', () => {
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
    await pool.query('DELETE FROM product_product_lines');
    await pool.query('DELETE FROM product_family_members');
    await pool.query('DELETE FROM product_families');
    await pool.query('DELETE FROM products');
    await pool.query('DELETE FROM slug_redirects');
    await pool.query(`DELETE FROM audit_logs WHERE action = 'PRODUCT_DUPLICATED'`);
    await pool.query('DELETE FROM admin_sessions');
    await pool.query(`DELETE FROM admin_users WHERE email LIKE 'dup-admin-%'`);

    superEmail = `dup-admin-${Date.now()}@example.com`;
    const passwordHash = await hashPassword(password);
    await pool.query(
      `INSERT INTO admin_users (id, email, display_name, password_hash, role, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'SUPER_ADMIN', 'ACTIVE', NOW(), NOW())`,
      [uuid(), superEmail, 'Dup Admin', passwordHash],
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
        MEDIA_LOCAL_ROOT: mediaRoot,
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

  async function seedSourceProduct(
    http: request.SuperAgentTest,
    opts?: { slug?: string; seoTitle?: string; archived?: boolean },
  ) {
    const stamp = Date.now();
    const slug = opts?.slug ?? `dup-src-${stamp}`;

    const occasion = await http
      .post('/api/v1/admin/catalog/occasions')
      .set('Origin', origin)
      .send({ name: `Occasion ${stamp}`, slug: `occ-dup-${stamp}` })
      .expect(201);
    const recipient = await http
      .post('/api/v1/admin/catalog/recipients')
      .set('Origin', origin)
      .send({ name: `Recipient ${stamp}`, slug: `rec-dup-${stamp}` })
      .expect(201);
    const color = await http
      .post('/api/v1/admin/catalog/colors')
      .set('Origin', origin)
      .send({ name: `Color ${stamp}`, slug: `col-dup-${stamp}`, swatch: '#cc3344' })
      .expect(201);
    const flower = await http
      .post('/api/v1/admin/catalog/flowers')
      .set('Origin', origin)
      .send({ name: `Flower ${stamp}`, slug: `flw-dup-${stamp}` })
      .expect(201);
    const line = await http
      .post('/api/v1/admin/catalog/product-lines')
      .set('Origin', origin)
      .send({ name: `Line ${stamp}`, slug: `line-dup-${stamp}` })
      .expect(201);

    let product = await http
      .post('/api/v1/admin/catalog/products')
      .set('Origin', origin)
      .send({
        name: 'Красные розы',
        slug,
        shortDescription: 'Коротко',
        description: 'Полное описание',
        occasionIds: [occasion.body.id],
        recipientIds: [recipient.body.id],
        colorIds: [color.body.id],
        productLineIds: [line.body.id],
        seoTitle: opts?.seoTitle ?? 'SEO title for roses',
        seoDescription: 'SEO description for roses',
        noIndex: false,
      })
      .expect(201);

    product = await http
      .put(`/api/v1/admin/catalog/products/${product.body.id}/variants`)
      .set('Origin', origin)
      .send({
        expectedVersion: product.body.version,
        variants: [
          { name: 'S', priceMinor: '9900', sortOrder: 0, status: 'ACTIVE' },
          { name: 'L', priceMinor: '14900', sortOrder: 1, status: 'ACTIVE' },
        ],
      })
      .expect(200);

    product = await http
      .put(`/api/v1/admin/catalog/products/${product.body.id}/components`)
      .set('Origin', origin)
      .send({
        expectedVersion: product.body.version,
        components: [
          {
            flowerId: flower.body.id,
            displayName: 'Роза',
            quantity: 11,
            unit: 'STEM',
            sortOrder: 0,
          },
        ],
      })
      .expect(200);

    const file = await pngBuffer();
    product = await http
      .post(`/api/v1/admin/catalog/products/${product.body.id}/media`)
      .set('Origin', origin)
      .attach('file', file, 'roses.png')
      .expect(201);

    product = await http
      .put(`/api/v1/admin/catalog/products/${product.body.id}/promotion`)
      .set('Origin', origin)
      .send({
        expectedVersion: product.body.version,
        enabled: true,
        type: 'PERCENT',
        percentOff: 10,
      })
      .expect(200);

    const group = await http
      .post('/api/v1/admin/catalog/bestsellers')
      .set('Origin', origin)
      .send({ name: `Hits ${stamp}`, slug: `hits-dup-${stamp}`, title: `Hits ${stamp}`, sortOrder: 20 })
      .expect(201);
    await http
      .put(`/api/v1/admin/catalog/bestsellers/${group.body.id}/products`)
      .set('Origin', origin)
      .send({ expectedVersion: group.body.version, productIds: [product.body.id] })
      .expect(200);

    product = await http
      .get(`/api/v1/admin/catalog/products/${product.body.id}`)
      .expect(200);

    if (opts?.archived) {
      product = await http
        .post(`/api/v1/admin/catalog/products/${product.body.id}/archive`)
        .set('Origin', origin)
        .send({ expectedVersion: product.body.version })
        .expect(201);
    }

    return {
      product: product.body as {
        id: string;
        slug: string;
        version: number;
        lifecycle: string;
        variants: Array<{ id: string; name: string }>;
        components: Array<{ id: string; displayName: string }>;
        media: Array<{ id: string; mediaAssetId: string }>;
        occasions: Array<{ id: string }>;
        recipients: Array<{ id: string }>;
        colors: Array<{ id: string }>;
        productLines: Array<{ id: string }>;
        promotion: unknown;
        bestsellerGroupIds: string[];
        seoTitle: string | null;
        seoDescription: string | null;
        noIndex: boolean;
      },
      flowerId: flower.body.id as string,
      groupId: group.body.id as string,
    };
  }

  it('duplicates into an independent DRAFT with new IDs, no promo/bestsellers, shared media', async () => {
    const http = await login();
    const assetCountBefore = await pool.query(`SELECT count(*)::int AS c FROM media_assets`);
    const stockishBefore = await pool.query(`
      SELECT count(*)::int AS c
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name ~* '(stock|inventory|supply|movement|lot)'
    `);

    const { product: source } = await seedSourceProduct(http, {
      slug: `krasnye-rozy-${Date.now()}`,
    });
    expect(source.promotion).toBeTruthy();
    expect(source.bestsellerGroupIds.length).toBeGreaterThan(0);
    expect(source.media.length).toBe(1);

    const duplicated = await http
      .post(`/api/v1/admin/catalog/products/${source.id}/duplicate`)
      .set('Origin', origin)
      .send({})
      .expect(201);

    const copy = duplicated.body;
    expect(copy.id).not.toBe(source.id);
    expect(copy.lifecycle).toBe('DRAFT');
    expect(copy.version).toBe(1);
    expect(copy.slug).toBe(`${source.slug}-kopiya`);
    expect(copy.name).toBe('Красные розы — копия');
    expect(copy.seoTitle).toBe(source.seoTitle);
    expect(copy.seoDescription).toBe(source.seoDescription);
    expect(copy.promotion).toBeNull();
    expect(copy.bestsellerGroupIds).toEqual([]);
    expect(copy.publishAt ?? null).toBeNull();
    expect(copy.publishedAt ?? null).toBeNull();
    expect(copy.unpublishAt ?? null).toBeNull();

    expect(copy.variants).toHaveLength(source.variants.length);
    for (const variant of copy.variants) {
      expect(source.variants.some((v) => v.id === variant.id)).toBe(false);
    }
    expect(copy.components).toHaveLength(source.components.length);
    for (const component of copy.components) {
      expect(source.components.some((c) => c.id === component.id)).toBe(false);
    }

    expect(copy.occasions.map((o: { id: string }) => o.id).sort()).toEqual(
      source.occasions.map((o) => o.id).sort(),
    );
    expect(copy.recipients.map((o: { id: string }) => o.id).sort()).toEqual(
      source.recipients.map((o) => o.id).sort(),
    );
    expect(copy.colors.map((o: { id: string }) => o.id).sort()).toEqual(
      source.colors.map((o) => o.id).sort(),
    );
    expect(copy.productLines.map((o: { id: string }) => o.id).sort()).toEqual(
      source.productLines.map((o) => o.id).sort(),
    );

    expect(copy.media).toHaveLength(1);
    expect(copy.media[0].mediaAssetId).toBe(source.media[0].mediaAssetId);
    expect(copy.media[0].id).not.toBe(source.media[0].id);

    const assetCountAfter = await pool.query(`SELECT count(*)::int AS c FROM media_assets`);
    expect(assetCountAfter.rows[0].c).toBe(assetCountBefore.rows[0].c + 1);

    const stockishAfter = await pool.query(`
      SELECT count(*)::int AS c
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name ~* '(stock|inventory|supply|movement|lot)'
    `);
    expect(stockishAfter.rows[0].c).toBe(stockishBefore.rows[0].c);

    const audit = await pool.query(
      `SELECT metadata FROM audit_logs
       WHERE action = 'PRODUCT_DUPLICATED' AND entity_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [copy.id],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].metadata.sourceProductId).toBe(source.id);
    expect(audit.rows[0].metadata.slug).toBe(copy.slug);

    // DRAFT is never publicly indexable / never in sitemap (lifecycle gate, independent of noIndex).
    await request(base).get(`/api/v1/catalog/products/${copy.slug}`).expect(404);
    const sitemap = await request(base).get('/api/v1/catalog/sitemap').expect(200);
    const paths = sitemap.body.map((entry: { path: string }) => entry.path);
    expect(paths).not.toContain(`/bukety/${copy.slug}`);
  }, 120_000);

  it('keeps shared MediaAsset when one ProductMedia link is removed; orphan cleanup skips it', async () => {
    const http = await login();
    const { product: source } = await seedSourceProduct(http, {
      slug: `media-share-${Date.now()}`,
    });
    const assetId = source.media[0].mediaAssetId;

    const duplicated = await http
      .post(`/api/v1/admin/catalog/products/${source.id}/duplicate`)
      .set('Origin', origin)
      .send({})
      .expect(201);
    const copyMediaId = duplicated.body.media[0].id as string;
    expect(duplicated.body.media[0].mediaAssetId).toBe(assetId);

    await http
      .delete(`/api/v1/admin/catalog/products/${duplicated.body.id}/media/${copyMediaId}`)
      .set('Origin', origin)
      .expect(200);

    const assetStillThere = await pool.query(`SELECT id FROM media_assets WHERE id = $1`, [
      assetId,
    ]);
    expect(assetStillThere.rows).toHaveLength(1);

    const sourceRefs = await pool.query(
      `SELECT count(*)::int AS c FROM product_media WHERE media_asset_id = $1`,
      [assetId],
    );
    expect(sourceRefs.rows[0].c).toBe(1);

    // Age orphanedAt past grace so it would be eligible IF truly orphaned.
    await pool.query(
      `UPDATE media_assets SET orphaned_at = NOW() - INTERVAL '8 days' WHERE id = $1`,
      [assetId],
    );

    const tsxCli = path.join(__dirname, '..', 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const cleanupScript = path.join(__dirname, '..', 'src', 'cli', 'media-cleanup.ts');
    const dry = spawnSync(process.execPath, [tsxCli, cleanupScript, '--dry-run'], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        MEDIA_STORAGE: 'local',
        MEDIA_LOCAL_ROOT: mediaRoot,
        MEDIA_PUBLIC_BASE_URL: `http://127.0.0.1:${apiPort}/api/v1/media`,
        NODE_ENV: 'test',
        SESSION_HMAC_SECRET: 'test-session-hmac-secret-32chars!!',
      },
      encoding: 'utf8',
    });
    if (dry.status !== 0) {
      throw new Error(`media:cleanup --dry-run failed\nstdout=${dry.stdout}\nstderr=${dry.stderr}`);
    }
    expect(dry.stdout).not.toContain(assetId);

    const still = await pool.query(`SELECT id FROM media_assets WHERE id = $1`, [assetId]);
    expect(still.rows).toHaveLength(1);
  }, 120_000);

  it('rolls back the whole duplicate transaction on controlled mid-flight failure', async () => {
    const http = await login();
    const { product: source } = await seedSourceProduct(http, {
      slug: `rollback-src-${Date.now()}`,
    });
    const productsBefore = await pool.query(`SELECT count(*)::int AS c FROM products`);
    const variantsBefore = await pool.query(`SELECT count(*)::int AS c FROM product_variants`);
    const mediaBefore = await pool.query(`SELECT count(*)::int AS c FROM product_media`);
    const auditBefore = await pool.query(
      `SELECT count(*)::int AS c FROM audit_logs WHERE action = 'PRODUCT_DUPLICATED'`,
    );

    await pool.query(`
      CREATE OR REPLACE FUNCTION test_fail_product_duplicated_audit()
      RETURNS trigger AS $$
      BEGIN
        IF NEW.action = 'PRODUCT_DUPLICATED'::"AuditAction" THEN
          RAISE EXCEPTION 'controlled_duplicate_rollback';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await pool.query(`DROP TRIGGER IF EXISTS trg_test_fail_dup_audit ON audit_logs`);
    await pool.query(`
      CREATE TRIGGER trg_test_fail_dup_audit
      BEFORE INSERT ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION test_fail_product_duplicated_audit();
    `);

    try {
      await http
        .post(`/api/v1/admin/catalog/products/${source.id}/duplicate`)
        .set('Origin', origin)
        .send({})
        .expect(500);

      const productsAfter = await pool.query(`SELECT count(*)::int AS c FROM products`);
      const variantsAfter = await pool.query(`SELECT count(*)::int AS c FROM product_variants`);
      const mediaAfter = await pool.query(`SELECT count(*)::int AS c FROM product_media`);
      const auditAfter = await pool.query(
        `SELECT count(*)::int AS c FROM audit_logs WHERE action = 'PRODUCT_DUPLICATED'`,
      );
      const leaked = await pool.query(
        `SELECT id FROM products WHERE slug LIKE $1`,
        [`${source.slug}-kopiya%`],
      );

      expect(productsAfter.rows[0].c).toBe(productsBefore.rows[0].c);
      expect(variantsAfter.rows[0].c).toBe(variantsBefore.rows[0].c);
      expect(mediaAfter.rows[0].c).toBe(mediaBefore.rows[0].c);
      expect(auditAfter.rows[0].c).toBe(auditBefore.rows[0].c);
      expect(leaked.rows).toHaveLength(0);
    } finally {
      await pool.query(`DROP TRIGGER IF EXISTS trg_test_fail_dup_audit ON audit_logs`);
      await pool.query(`DROP FUNCTION IF EXISTS test_fail_product_duplicated_audit()`);
    }
  }, 120_000);

  it('requires auth (401) and CATALOG_CREATE session for success; unknown source → 404', async () => {
    await request(base)
      .post(`/api/v1/admin/catalog/products/${uuid()}/duplicate`)
      .set('Origin', origin)
      .send({})
      .expect(401);

    const http = await login();
    await http
      .post(`/api/v1/admin/catalog/products/${uuid()}/duplicate`)
      .set('Origin', origin)
      .send({})
      .expect(404);

    // All current admin roles include CATALOG_CREATE; CONTENT_MANAGER must succeed.
    const contentEmail = `dup-content-${Date.now()}@example.com`;
    await http
      .post('/api/v1/admin/users')
      .set('Origin', origin)
      .send({
        email: contentEmail,
        displayName: 'Content Dup',
        password,
        role: 'CONTENT_MANAGER',
      })
      .expect(201);

    const content = agent();
    await content
      .post('/api/v1/admin/auth/login')
      .set('Origin', origin)
      .send({ email: contentEmail, password })
      .expect(201);

    const { product: source } = await seedSourceProduct(http, {
      slug: `perm-src-${Date.now()}`,
    });
    await content
      .post(`/api/v1/admin/catalog/products/${source.id}/duplicate`)
      .set('Origin', origin)
      .send({})
      .expect(201);
  }, 120_000);

  it('allows duplicating an ARCHIVED source into a new DRAFT', async () => {
    const http = await login();
    const { product: source } = await seedSourceProduct(http, {
      slug: `archived-src-${Date.now()}`,
      archived: true,
    });
    expect(source.lifecycle).toBe('ARCHIVED');

    const duplicated = await http
      .post(`/api/v1/admin/catalog/products/${source.id}/duplicate`)
      .set('Origin', origin)
      .send({})
      .expect(201);

    expect(duplicated.body.lifecycle).toBe('DRAFT');
    expect(duplicated.body.id).not.toBe(source.id);
    expect(duplicated.body.slug).toContain('-kopiya');
  }, 120_000);
});

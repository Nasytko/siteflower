/**
 * Catalog category + flower-ref lifecycle: counts, move, safe delete, reassignment.
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
const password = 'TaxonomyPass12!!';

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

describe('Catalog taxonomy lifecycle (integration)', () => {
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

    await pool.query('DELETE FROM product_family_members');
    await pool.query('DELETE FROM product_families');
    await pool.query('DELETE FROM product_variants');
    await pool.query('DELETE FROM product_components');
    await pool.query('DELETE FROM product_occasions');
    await pool.query('DELETE FROM product_recipients');
    await pool.query('DELETE FROM product_colors');
    await pool.query('DELETE FROM product_product_lines');
    await pool.query('DELETE FROM product_media');
    await pool.query('DELETE FROM products');
    await pool.query('DELETE FROM flower_varieties');
    await pool.query('DELETE FROM flower_types');
    await pool.query('DELETE FROM flower_origins');
    await pool.query('DELETE FROM catalog_categories');
    await pool.query(`DELETE FROM audit_logs WHERE action IN ('TAXONOMY_CREATED','TAXONOMY_UPDATED','TAXONOMY_DELETED')`);
    await pool.query('DELETE FROM admin_sessions');
    await pool.query(`DELETE FROM admin_users WHERE email LIKE 'tax-admin-%'`);

    superEmail = `tax-admin-${Date.now()}@example.com`;
    const passwordHash = await hashPassword(password);
    await pool.query(
      `INSERT INTO admin_users (id, email, display_name, password_hash, role, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'SUPER_ADMIN', 'ACTIVE', NOW(), NOW())`,
      [uuid(), superEmail, 'Taxonomy Admin', passwordHash],
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
        MEDIA_LOCAL_ROOT: './storage/media-test-taxonomy',
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

  async function createDraftProduct(
    http: request.SuperAgentTest,
    name: string,
    extras: Record<string, unknown> = {},
  ) {
    const created = await http
      .post('/api/v1/admin/catalog/products')
      .set('Origin', origin)
      .send({ name, ...extras })
      .expect(201);
    return created.body as { id: string; version: number; slug: string };
  }

  it('requires auth for category mutations (401)', async () => {
    await request(base).get('/api/v1/admin/catalog/categories').expect(401);
    await request(base)
      .post('/api/v1/admin/catalog/categories')
      .set('Origin', origin)
      .send({ name: 'X' })
      .expect(401);
  });

  it('creates, edits, moves with cycle protection, reorders, deactivates', async () => {
    const http = await login();
    const suffix = Date.now();

    const flowers = await http
      .post('/api/v1/admin/catalog/categories')
      .set('Origin', origin)
      .send({ name: `Цветы ${suffix}`, sortOrder: 10 })
      .expect(201);

    const bouquets = await http
      .post('/api/v1/admin/catalog/categories')
      .set('Origin', origin)
      .send({ name: `Букеты ${suffix}`, sortOrder: 20 })
      .expect(201);

    const roses = await http
      .post('/api/v1/admin/catalog/categories')
      .set('Origin', origin)
      .send({ name: `Розы ${suffix}`, parentId: flowers.body.id, sortOrder: 10 })
      .expect(201);

    const ecuador = await http
      .post('/api/v1/admin/catalog/categories')
      .set('Origin', origin)
      .send({ name: `Эквадор ${suffix}`, parentId: roses.body.id, sortOrder: 10 })
      .expect(201);

    // Cycle: cannot move flowers under roses.
    await http
      .patch(`/api/v1/admin/catalog/categories/${flowers.body.id}`)
      .set('Origin', origin)
      .send({ expectedVersion: flowers.body.version, parentId: roses.body.id })
      .expect(400);

    // Self-parent blocked.
    await http
      .patch(`/api/v1/admin/catalog/categories/${roses.body.id}`)
      .set('Origin', origin)
      .send({ expectedVersion: roses.body.version, parentId: roses.body.id })
      .expect(400);

    // Valid move: roses → bouquets.
    const moved = await http
      .patch(`/api/v1/admin/catalog/categories/${roses.body.id}`)
      .set('Origin', origin)
      .send({ expectedVersion: roses.body.version, parentId: bouquets.body.id })
      .expect(200);
    expect(moved.body.parentId).toBe(bouquets.body.id);

    // Reorder siblings at root.
    const reordered = await http
      .post(`/api/v1/admin/catalog/categories/${flowers.body.id}/reorder`)
      .set('Origin', origin)
      .send({ expectedVersion: flowers.body.version, direction: 'down' })
      .expect(201);
    expect(reordered.body.id).toBe(flowers.body.id);

    // Deactivate.
    const hidden = await http
      .patch(`/api/v1/admin/catalog/categories/${ecuador.body.id}`)
      .set('Origin', origin)
      .send({ expectedVersion: ecuador.body.version, visibility: 'HIDDEN' })
      .expect(200);
    expect(hidden.body.visibility).toBe('HIDDEN');

    const publicTree = await request(base).get('/api/v1/catalog/categories/tree').expect(200);
    const flatIds: string[] = [];
    const walk = (nodes: Array<{ id: string; children?: unknown[] }>) => {
      for (const node of nodes) {
        flatIds.push(node.id);
        walk((node.children as Array<{ id: string; children?: unknown[] }>) ?? []);
      }
    };
    walk(publicTree.body);
    expect(flatIds).not.toContain(ecuador.body.id);

    // Admin list includes counts.
    const adminList = await http.get('/api/v1/admin/catalog/categories').expect(200);
    const rosesAdmin = adminList.body.find((row: { id: string }) => row.id === moved.body.id);
    expect(rosesAdmin.childrenCount).toBe(1);
    expect(typeof rosesAdmin.productsCount).toBe('number');
    expect(typeof rosesAdmin.descendantProductsCount).toBe('number');

    // Cleanup leaf first.
    await http
      .delete(`/api/v1/admin/catalog/categories/${ecuador.body.id}`)
      .set('Origin', origin)
      .send({ expectedVersion: hidden.body.version })
      .expect(200);
  });

  it('blocks delete with children / products; atomic reassign-and-delete', async () => {
    const http = await login();
    const suffix = Date.now();

    const parent = await http
      .post('/api/v1/admin/catalog/categories')
      .set('Origin', origin)
      .send({ name: `Parent ${suffix}`, sortOrder: 30 })
      .expect(201);

    const child = await http
      .post('/api/v1/admin/catalog/categories')
      .set('Origin', origin)
      .send({ name: `Child ${suffix}`, parentId: parent.body.id, sortOrder: 10 })
      .expect(201);

    const target = await http
      .post('/api/v1/admin/catalog/categories')
      .set('Origin', origin)
      .send({ name: `Target ${suffix}`, sortOrder: 40 })
      .expect(201);

    // Delete parent with children → blocked.
    const blockedChildren = await http
      .delete(`/api/v1/admin/catalog/categories/${parent.body.id}`)
      .set('Origin', origin)
      .send({ expectedVersion: parent.body.version })
      .expect(400);
    expect(blockedChildren.body.message).toMatch(/child/i);

    // Product on child.
    const product = await createDraftProduct(http, `Tax Product ${suffix}`);
    const linked = await http
      .patch(`/api/v1/admin/catalog/products/${product.id}`)
      .set('Origin', origin)
      .send({ expectedVersion: product.version, catalogCategoryId: child.body.id })
      .expect(200);

    // Delete child with products → blocked.
    const blockedProducts = await http
      .delete(`/api/v1/admin/catalog/categories/${child.body.id}`)
      .set('Origin', origin)
      .send({ expectedVersion: child.body.version })
      .expect(400);
    expect(blockedProducts.body.message).toMatch(/product/i);

    // Atomic reassign + delete.
    const result = await http
      .post(`/api/v1/admin/catalog/categories/${child.body.id}/reassign-and-delete`)
      .set('Origin', origin)
      .send({ expectedVersion: child.body.version, targetCategoryId: target.body.id })
      .expect(201);
    expect(result.body.reassignedCount).toBe(1);

    const movedProduct = await http
      .get(`/api/v1/admin/catalog/products/${linked.body.id}`)
      .expect(200);
    expect(movedProduct.body.catalogCategoryId).toBe(target.body.id);

    const gone = await http.get('/api/v1/admin/catalog/categories').expect(200);
    expect(gone.body.some((row: { id: string }) => row.id === child.body.id)).toBe(false);

    // Parent now empty → delete ok.
    const parentFresh = gone.body.find((row: { id: string }) => row.id === parent.body.id);
    await http
      .delete(`/api/v1/admin/catalog/categories/${parent.body.id}`)
      .set('Origin', origin)
      .send({ expectedVersion: parentFresh.version })
      .expect(200);

    // Invalid target id.
    const orphan = await http
      .post('/api/v1/admin/catalog/categories')
      .set('Origin', origin)
      .send({ name: `Orphan ${suffix}`, sortOrder: 50 })
      .expect(201);
    const prod2 = await createDraftProduct(http, `Tax Product 2 ${suffix}`);
    await http
      .patch(`/api/v1/admin/catalog/products/${prod2.id}`)
      .set('Origin', origin)
      .send({ expectedVersion: prod2.version, catalogCategoryId: orphan.body.id })
      .expect(200);

    await http
      .post(`/api/v1/admin/catalog/categories/${orphan.body.id}/reassign-and-delete`)
      .set('Origin', origin)
      .send({
        expectedVersion: orphan.body.version,
        targetCategoryId: '00000000-0000-4000-8000-000000000099',
      })
      .expect(400);

    // Category still exists after failed reassignment.
    const stillThere = await http.get('/api/v1/admin/catalog/categories').expect(200);
    expect(stillThere.body.some((row: { id: string }) => row.id === orphan.body.id)).toBe(true);
  });

  it('flower type/variety/origin: usage counts, blocked delete, reassignment', async () => {
    const http = await login();
    const suffix = Date.now();

    const typeA = await http
      .post('/api/v1/admin/catalog/flower-refs/types')
      .set('Origin', origin)
      .send({ name: `Роза ${suffix}`, sortOrder: 10 })
      .expect(201);

    const typeB = await http
      .post('/api/v1/admin/catalog/flower-refs/types')
      .set('Origin', origin)
      .send({ name: `Гербера ${suffix}`, sortOrder: 20 })
      .expect(201);

    const variety = await http
      .post('/api/v1/admin/catalog/flower-refs/varieties')
      .set('Origin', origin)
      .send({ flowerTypeId: typeA.body.id, name: `Мондиаль ${suffix}`, sortOrder: 10 })
      .expect(201);

    const originA = await http
      .post('/api/v1/admin/catalog/flower-refs/origins')
      .set('Origin', origin)
      .send({ name: `Эквадор ${suffix}`, sortOrder: 10 })
      .expect(201);

    const originB = await http
      .post('/api/v1/admin/catalog/flower-refs/origins')
      .set('Origin', origin)
      .send({ name: `Фермерская ${suffix}`, sortOrder: 20 })
      .expect(201);

    const product = await createDraftProduct(http, `Flower Prod ${suffix}`);
    await http
      .patch(`/api/v1/admin/catalog/products/${product.id}`)
      .set('Origin', origin)
      .send({
        expectedVersion: product.version,
        flowerTypeId: typeA.body.id,
        flowerVarietyId: variety.body.id,
        flowerOriginId: originA.body.id,
      })
      .expect(200);

    const types = await http.get('/api/v1/admin/catalog/flower-refs/types').expect(200);
    const typeRow = types.body.find((row: { id: string }) => row.id === typeA.body.id);
    expect(typeRow.productsCount).toBe(1);
    expect(typeRow.varietiesCount).toBe(1);

    // Type with varieties blocked.
    await http
      .delete(`/api/v1/admin/catalog/flower-refs/types/${typeA.body.id}`)
      .set('Origin', origin)
      .send({ expectedVersion: typeA.body.version })
      .expect(400);

    // Variety used → blocked empty delete.
    await http
      .delete(`/api/v1/admin/catalog/flower-refs/varieties/${variety.body.id}`)
      .set('Origin', origin)
      .send({ expectedVersion: variety.body.version })
      .expect(400);

    // Reassign variety to a new empty variety under same type, then delete.
    const variety2 = await http
      .post('/api/v1/admin/catalog/flower-refs/varieties')
      .set('Origin', origin)
      .send({ flowerTypeId: typeA.body.id, name: `Жизель ${suffix}`, sortOrder: 20 })
      .expect(201);

    await http
      .post(`/api/v1/admin/catalog/flower-refs/varieties/${variety.body.id}/reassign-and-delete`)
      .set('Origin', origin)
      .send({ expectedVersion: variety.body.version, targetVarietyId: variety2.body.id })
      .expect(201);

    // Origin reassignment.
    await http
      .post(`/api/v1/admin/catalog/flower-refs/origins/${originA.body.id}/reassign-and-delete`)
      .set('Origin', origin)
      .send({ expectedVersion: originA.body.version, targetOriginId: originB.body.id })
      .expect(201);

    // Clear variety, then reassign type (clears variety).
    const productFresh = await http
      .get(`/api/v1/admin/catalog/products/${product.id}`)
      .expect(200);
    await http
      .patch(`/api/v1/admin/catalog/products/${product.id}`)
      .set('Origin', origin)
      .send({ expectedVersion: productFresh.body.version, flowerVarietyId: null })
      .expect(200);

    // Delete remaining variety empty.
    const varieties = await http.get('/api/v1/admin/catalog/flower-refs/varieties').expect(200);
    const v2 = varieties.body.find((row: { id: string }) => row.id === variety2.body.id);
    await http
      .delete(`/api/v1/admin/catalog/flower-refs/varieties/${variety2.body.id}`)
      .set('Origin', origin)
      .send({ expectedVersion: v2.version })
      .expect(200);

    const typesFresh = await http.get('/api/v1/admin/catalog/flower-refs/types').expect(200);
    const typeAFresh = typesFresh.body.find((row: { id: string }) => row.id === typeA.body.id);

    await http
      .post(`/api/v1/admin/catalog/flower-refs/types/${typeA.body.id}/reassign-and-delete`)
      .set('Origin', origin)
      .send({ expectedVersion: typeAFresh.version, targetFlowerTypeId: typeB.body.id })
      .expect(201);

    const productAfter = await http
      .get(`/api/v1/admin/catalog/products/${product.id}`)
      .expect(200);
    expect(productAfter.body.flowerTypeId).toBe(typeB.body.id);
    expect(productAfter.body.flowerVarietyId).toBeNull();
    expect(productAfter.body.flowerOriginId).toBe(originB.body.id);

    // Unused typeB still has product — empty delete blocked.
    const typeBFresh = (
      await http.get('/api/v1/admin/catalog/flower-refs/types').expect(200)
    ).body.find((row: { id: string }) => row.id === typeB.body.id);
    await http
      .delete(`/api/v1/admin/catalog/flower-refs/types/${typeB.body.id}`)
      .set('Origin', origin)
      .send({ expectedVersion: typeBFresh.version })
      .expect(400);

    // OCC: stale version on update.
    await http
      .patch(`/api/v1/admin/catalog/flower-refs/types/${typeB.body.id}`)
      .set('Origin', origin)
      .send({ expectedVersion: typeBFresh.version, name: `Гербера upd ${suffix}` })
      .expect(200);
    await http
      .patch(`/api/v1/admin/catalog/flower-refs/types/${typeB.body.id}`)
      .set('Origin', origin)
      .send({ expectedVersion: typeBFresh.version, name: 'stale' })
      .expect(409);
  });

  it('rejects invalid parent UUID and non-whitelisted fields', async () => {
    const http = await login();
    await http
      .post('/api/v1/admin/catalog/categories')
      .set('Origin', origin)
      .send({ name: 'Bad parent', parentId: 'not-a-uuid' })
      .expect(400);

    await http
      .post('/api/v1/admin/catalog/categories')
      .set('Origin', origin)
      .send({ name: 'Extra', hackerField: true })
      .expect(400);
  });

  it('FlowerItem composition: create, reuse on duplicate, archive blocks hard delete', async () => {
    const http = await login();
    const suffix = Date.now();

    const type = await http
      .post('/api/v1/admin/catalog/flower-refs/types')
      .set('Origin', origin)
      .send({ name: `ItemType ${suffix}` })
      .expect(201);
    const variety = await http
      .post('/api/v1/admin/catalog/flower-refs/varieties')
      .set('Origin', origin)
      .send({ flowerTypeId: type.body.id, name: `ItemVar ${suffix}` })
      .expect(201);
    const originRow = await http
      .post('/api/v1/admin/catalog/flower-refs/origins')
      .set('Origin', origin)
      .send({ name: `ItemOrig ${suffix}` })
      .expect(201);

    const item = await http
      .post('/api/v1/admin/catalog/flower-refs/items')
      .set('Origin', origin)
      .send({
        flowerTypeId: type.body.id,
        flowerVarietyId: variety.body.id,
        flowerOriginId: originRow.body.id,
        heightCm: 70,
      })
      .expect(201);
    expect(item.body.name).toMatch(/70/);

    // Invalid variety/type combo rejected.
    const otherType = await http
      .post('/api/v1/admin/catalog/flower-refs/types')
      .set('Origin', origin)
      .send({ name: `OtherType ${suffix}` })
      .expect(201);
    await http
      .post('/api/v1/admin/catalog/flower-refs/items')
      .set('Origin', origin)
      .send({
        flowerTypeId: otherType.body.id,
        flowerVarietyId: variety.body.id,
        heightCm: 50,
      })
      .expect(400);

    const product = await createDraftProduct(http, `Comp Prod ${suffix}`);
    let editor = await http.get(`/api/v1/admin/catalog/products/${product.id}`).expect(200);
    editor = await http
      .put(`/api/v1/admin/catalog/products/${product.id}/editor`)
      .set('Origin', origin)
      .send({
        expectedVersion: editor.body.version,
        name: editor.body.name,
        slug: editor.body.slug,
        shortDescription: editor.body.shortDescription,
        description: editor.body.description,
        availability: editor.body.availability,
        heightCm: null,
        bouquetSizeId: null,
        catalogCategoryId: null,
        flowerTypeId: null,
        flowerVarietyId: null,
        flowerOriginId: null,
        familyId: null,
        publishAt: null,
        unpublishAt: null,
        seoTitle: null,
        seoDescription: null,
        noIndex: false,
        variants: [{ name: 'Std', priceMinor: '5000', sortOrder: 0, status: 'ACTIVE' }],
        components: [
          {
            flowerItemId: item.body.id,
            displayName: item.body.name,
            quantity: 9,
            unit: 'STEM',
            sortOrder: 0,
          },
        ],
        occasionIds: [],
        recipientIds: [],
        colorIds: [],
        productLineIds: [],
        promotion: { enabled: false, type: 'PERCENT', percentOff: null, startsAt: null, endsAt: null },
        groupIds: [],
      })
      .expect(200);

    expect(editor.body.components[0].flowerItemId).toBe(item.body.id);
    expect(editor.body.components[0].quantity).toBe(9);

    const dup = await http
      .post(`/api/v1/admin/catalog/products/${product.id}/duplicate`)
      .set('Origin', origin)
      .send({})
      .expect(201);
    const dupFull = await http.get(`/api/v1/admin/catalog/products/${dup.body.id}`).expect(200);
    expect(dupFull.body.components[0].flowerItemId).toBe(item.body.id);

    // Used item cannot hard-delete.
    const items = await http
      .get('/api/v1/admin/catalog/flower-refs/items?includeHidden=1')
      .expect(200);
    const used = items.body.find((row: { id: string }) => row.id === item.body.id);
    await http
      .delete(`/api/v1/admin/catalog/flower-refs/items/${item.body.id}`)
      .set('Origin', origin)
      .send({ expectedVersion: used.version })
      .expect(400);

    // Archive works; component still references it.
    const archived = await http
      .patch(`/api/v1/admin/catalog/flower-refs/items/${item.body.id}`)
      .set('Origin', origin)
      .send({ expectedVersion: used.version, visibility: 'HIDDEN' })
      .expect(200);
    expect(archived.body.visibility).toBe('HIDDEN');

    const still = await http.get(`/api/v1/admin/catalog/products/${product.id}`).expect(200);
    expect(still.body.components[0].flowerItemId).toBe(item.body.id);
    expect(still.body.compositionSetupStatus).toBe('ready');
  });

  it('lists needsCompositionMigration and setupCompositionFromItem clears legacy attrs', async () => {
    const http = await login();
    const suffix = Date.now();

    const type = await http
      .post('/api/v1/admin/catalog/flower-refs/types')
      .set('Origin', origin)
      .send({ name: `MigType ${suffix}`, slug: `mig-type-${suffix}` })
      .expect(201);
    const item = await http
      .post('/api/v1/admin/catalog/flower-refs/items')
      .set('Origin', origin)
      .send({ flowerTypeId: type.body.id, heightCm: 60 })
      .expect(201);

    const product = await createDraftProduct(http, `Legacy Mig ${suffix}`);
    const linked = await http
      .patch(`/api/v1/admin/catalog/products/${product.id}`)
      .set('Origin', origin)
      .send({ expectedVersion: product.version, flowerTypeId: type.body.id })
      .expect(200);
    expect(linked.body.compositionSetupStatus).toBe('legacy_pending');

    const pending = await http
      .get('/api/v1/admin/catalog/products?needsCompositionMigration=true&pageSize=100')
      .expect(200);
    expect(pending.body.items.some((row: { id: string }) => row.id === product.id)).toBe(true);

    const setup = await http
      .post(`/api/v1/admin/catalog/products/${product.id}/composition-setup`)
      .set('Origin', origin)
      .send({
        expectedVersion: linked.body.version,
        flowerItemId: item.body.id,
        quantity: 9,
        unit: 'STEM',
        clearLegacyFlowerAttrs: true,
      })
      .expect(201);
    expect(setup.body.compositionSetupStatus).toBe('ready');
    expect(setup.body.flowerTypeId).toBeNull();
    expect(setup.body.components[0].flowerItemId).toBe(item.body.id);
    expect(setup.body.components[0].quantity).toBe(9);

    const pendingAfter = await http
      .get('/api/v1/admin/catalog/products?needsCompositionMigration=true&pageSize=100')
      .expect(200);
    expect(pendingAfter.body.items.some((row: { id: string }) => row.id === product.id)).toBe(
      false,
    );
  });
});

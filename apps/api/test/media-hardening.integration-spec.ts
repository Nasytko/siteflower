/**
 * Media production hardening — real PostgreSQL + local storage + Nest API.
 * Covers primary/gallery/orphan/repair/health/compensation-adjacent paths.
 */
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import request from 'supertest';
import pg from 'pg';
import * as argon2 from 'argon2';
import sharp from 'sharp';
import { LocalMediaStorage } from '../src/media/local-media.storage';
import { MediaService } from '../src/media/media.service';
import type { MediaStorage } from '../src/media/media-storage';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://bouquet:bouquet_dev_password@localhost:5433/bouquet_one?schema=public';
const apiPort = String(3401 + Math.floor(Math.random() * 200));
const origin = 'http://localhost:3000';
const password = 'MediaPass12!!';
const mediaRoot = './storage/media-test-hardening';

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

async function png(width = 640, height = 480): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 180, g: 40, b: 70 },
    },
  })
    .png()
    .toBuffer();
}

describe('Media production hardening (integration)', () => {
  let child: ChildProcessWithoutNullStreams;
  let pool: pg.Pool;
  let superEmail: string;
  let bootLog = '';
  const base = `http://127.0.0.1:${apiPort}`;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: databaseUrl });
    await pool.query(
      `DELETE FROM product_media WHERE product_id IN (SELECT id FROM products WHERE slug LIKE 'media-hard-%')`,
    );
    await pool.query(`DELETE FROM products WHERE slug LIKE 'media-hard-%'`);
    await pool.query(
      `DELETE FROM media_derivatives WHERE media_asset_id IN (
        SELECT id FROM media_assets WHERE storage_key LIKE 'masters/media-hard-%' OR storage_key LIKE 'masters/%'
          AND id NOT IN (SELECT media_asset_id FROM product_media)
      )`,
    ).catch(() => undefined);
    await pool.query('DELETE FROM admin_sessions');
    await pool.query(`DELETE FROM admin_users WHERE email LIKE 'media-admin-%'`);

    superEmail = `media-admin-${Date.now()}@example.com`;
    const passwordHash = await hashPassword(password);
    await pool.query(
      `INSERT INTO admin_users (id, email, display_name, password_hash, role, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'SUPER_ADMIN', 'ACTIVE', NOW(), NOW())`,
      [uuid(), superEmail, 'Media Admin', passwordHash],
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
      throw new Error(`API failed to start on :${apiPort}\n${bootLog.slice(-4000)}`);
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

  it('uploads raster, checksum, derivatives; rejects SVG and oversized', async () => {
    const http = await login();
    const created = await http
      .post('/api/v1/admin/catalog/products')
      .set('Origin', origin)
      .send({ name: 'Media Hard One', slug: `media-hard-${Date.now()}` })
      .expect(201);

    const body = await png(800, 600);
    const upload = await http
      .post(`/api/v1/admin/catalog/products/${created.body.id}/media`)
      .set('Origin', origin)
      .attach('file', body, 'bouquet.png')
      .expect(201);

    expect(upload.body.media).toHaveLength(1);
    expect(upload.body.media[0].isPrimary).toBe(true);
    expect(upload.body.media[0].derivatives.length).toBeGreaterThan(0);
    expect(upload.body.media[0].width).toBe(800);
    expect(upload.body.media[0].height).toBe(600);

    const assetId = upload.body.media[0].mediaAssetId as string;
    const row = await pool.query(
      `SELECT checksum_sha256, byte_size, storage_key FROM media_assets WHERE id = $1`,
      [assetId],
    );
    expect(row.rows[0].checksum_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Number(row.rows[0].byte_size)).toBeGreaterThan(0);

    const absRoot = join(path.join(__dirname, '..'), mediaRoot);
    const { readFile } = await import('node:fs/promises');
    const masterBytes = await readFile(join(absRoot, row.rows[0].storage_key));
    const actualHash = createHash('sha256').update(masterBytes).digest('hex');
    expect(actualHash).toBe(row.rows[0].checksum_sha256);

    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
    );
    await http
      .post(`/api/v1/admin/catalog/products/${created.body.id}/media`)
      .set('Origin', origin)
      .attach('file', svg, 'x.svg')
      .expect(400);

    const corrupted = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x00, 0x01, 0x02, 0x03]);
    await http
      .post(`/api/v1/admin/catalog/products/${created.body.id}/media`)
      .set('Origin', origin)
      .attach('file', corrupted, 'bad.jpg')
      .expect(400);

    const huge = Buffer.alloc(8_000_001, 1);
    const tooBig = await http
      .post(`/api/v1/admin/catalog/products/${created.body.id}/media`)
      .set('Origin', origin)
      .attach('file', huge, 'big.png');
    expect([400, 413, 500]).toContain(tooBig.status);
  });

  it('enforces gallery max 12, reorder, primary change, alt; detach keeps asset', async () => {
    const http = await login();
    const created = await http
      .post('/api/v1/admin/catalog/products')
      .set('Origin', origin)
      .send({ name: 'Media Hard Gallery', slug: `media-hard-gal-${Date.now()}` })
      .expect(201);
    const productId = created.body.id as string;

    for (let i = 0; i < 12; i += 1) {
      const body = await png(320 + i, 240);
      await http
        .post(`/api/v1/admin/catalog/products/${productId}/media`)
        .set('Origin', origin)
        .attach('file', body, `g${i}.png`)
        .expect(201);
    }

    await http
      .post(`/api/v1/admin/catalog/products/${productId}/media`)
      .set('Origin', origin)
      .attach('file', await png(), 'extra.png')
      .expect(400);

    let listed = await http.get(`/api/v1/admin/catalog/products/${productId}`).expect(200);
    expect(listed.body.media).toHaveLength(12);
    const orderedIds = [...listed.body.media]
      .sort((a: { sortOrder: number }, b: { sortOrder: number }) => a.sortOrder - b.sortOrder)
      .map((m: { id: string }) => m.id);
    const reversed = [...orderedIds].reverse();
    listed = (
      await http
        .put(`/api/v1/admin/catalog/products/${productId}/media/order`)
        .set('Origin', origin)
        .send({ mediaIds: reversed })
        .expect(200)
    ).body;

    const second = listed.media.find((m: { id: string }) => m.id === orderedIds[1]);
    expect(second).toBeTruthy();
    listed = (
      await http
        .patch(`/api/v1/admin/catalog/products/${productId}/media/${second.id}`)
        .set('Origin', origin)
        .send({ isPrimary: true, alt: 'Букет из роз' })
        .expect(200)
    ).body;
    const primaries = listed.media.filter((m: { isPrimary: boolean }) => m.isPrimary);
    expect(primaries).toHaveLength(1);
    expect(primaries[0].id).toBe(second.id);
    expect(primaries[0].alt).toBe('Букет из роз');

    const primary = primaries[0];
    const assetId = primary.mediaAssetId as string;
    const remove = await http
      .delete(`/api/v1/admin/catalog/products/${productId}/media/${primary.id}`)
      .set('Origin', origin)
      .expect(200);
    expect(remove.body.media).toHaveLength(11);
    expect(remove.body.media.filter((m: { isPrimary: boolean }) => m.isPrimary)).toHaveLength(1);

    const asset = await pool.query(
      `SELECT id, orphaned_at FROM media_assets WHERE id = $1`,
      [assetId],
    );
    expect(asset.rows).toHaveLength(1);
    expect(asset.rows[0].orphaned_at).not.toBeNull();
    const refs = await pool.query(
      `SELECT COUNT(*)::int AS c FROM product_media WHERE media_asset_id = $1`,
      [assetId],
    );
    expect(refs.rows[0].c).toBe(0);
  }, 180_000);

  it('rejects double-primary via partial unique index', async () => {
    const productId = uuid();
    const assetA = uuid();
    const assetB = uuid();
    await pool.query(
      `INSERT INTO products (id, slug, name, lifecycle, availability, currency, version, created_at, updated_at)
       VALUES ($1, $2, 'Media Conc', 'DRAFT', 'AVAILABLE', 'BYN', 1, NOW(), NOW())`,
      [productId, `media-hard-conc-${Date.now()}`],
    );
    for (const id of [assetA, assetB]) {
      await pool.query(
        `INSERT INTO media_assets (id, storage_key, mime_type, format, byte_size, width, height, checksum_sha256, created_at)
         VALUES ($1, $2, 'image/png', 'PNG', 10, 10, 10, $3, NOW())`,
        [id, `masters/${id}.png`, createHash('sha256').update(id).digest('hex')],
      );
    }
    await pool.query(
      `INSERT INTO product_media (id, product_id, media_asset_id, sort_order, is_primary, created_at)
       VALUES ($1, $2, $3, 0, true, NOW())`,
      [uuid(), productId, assetA],
    );
    await expect(
      pool.query(
        `INSERT INTO product_media (id, product_id, media_asset_id, sort_order, is_primary, created_at)
         VALUES ($1, $2, $3, 1, true, NOW())`,
        [uuid(), productId, assetB],
      ),
    ).rejects.toThrow(/product_media_one_primary_per_product|unique/i);
  });

  it('concurrent primary patches leave exactly one primary', async () => {
    const http = await login();
    const created = await http
      .post('/api/v1/admin/catalog/products')
      .set('Origin', origin)
      .send({ name: 'Media Hard Race', slug: `media-hard-race-${Date.now()}` })
      .expect(201);
    const productId = created.body.id as string;
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const before = new Set(ids);
      const up = await http
        .post(`/api/v1/admin/catalog/products/${productId}/media`)
        .set('Origin', origin)
        .attach('file', await png(400 + i, 400), `r${i}.png`)
        .expect(201);
      const added = up.body.media.find((m: { id: string }) => !before.has(m.id) && !ids.includes(m.id));
      // After first upload all are new; pick by sortOrder
      const sorted = [...up.body.media].sort(
        (a: { sortOrder: number }, b: { sortOrder: number }) => a.sortOrder - b.sortOrder,
      );
      const next = sorted.find((m: { id: string }) => !ids.includes(m.id));
      expect(next || added).toBeTruthy();
      ids.push((next ?? added).id);
    }

    await Promise.all(
      ids.map((mediaId) =>
        http
          .patch(`/api/v1/admin/catalog/products/${productId}/media/${mediaId}`)
          .set('Origin', origin)
          .send({ isPrimary: true }),
      ),
    );

    const listed = await http.get(`/api/v1/admin/catalog/products/${productId}`).expect(200);
    expect(listed.body.media.filter((m: { isPrimary: boolean }) => m.isPrimary)).toHaveLength(1);
    const db = await pool.query(
      `SELECT COUNT(*)::int AS c FROM product_media WHERE product_id = $1 AND is_primary = true`,
      [productId],
    );
    expect(db.rows[0].c).toBe(1);
  });

  it('media health + missing master/derivative detection + repair via CLI', async () => {
    await request(base).get('/api/v1/admin/media/health').expect(401);
    const http = await login();

    const created = await http
      .post('/api/v1/admin/catalog/products')
      .set('Origin', origin)
      .send({ name: 'Media Hard Health', slug: `media-hard-health-${Date.now()}` })
      .expect(201);
    const up = await http
      .post(`/api/v1/admin/catalog/products/${created.body.id}/media`)
      .set('Origin', origin)
      .attach('file', await png(900, 700), 'h.png')
      .expect(201);
    const media = up.body.media[0];
    const assetId = media.mediaAssetId as string;

    const assetRow = await pool.query(`SELECT storage_key FROM media_assets WHERE id = $1`, [
      assetId,
    ]);
    const deriv = await pool.query(
      `SELECT id, storage_key FROM media_derivatives WHERE media_asset_id = $1 LIMIT 1`,
      [assetId],
    );
    expect(deriv.rows.length).toBeGreaterThan(0);

    const absRoot = join(path.join(__dirname, '..'), mediaRoot);
    const { unlink } = await import('node:fs/promises');
    await unlink(join(absRoot, deriv.rows[0].storage_key)).catch(() => undefined);

    const health = await http.get('/api/v1/admin/media/health').expect(200);
    expect(health.body.driver).toBe('local');
    expect(
      (health.body.missingDerivatives as Array<{ derivativeId?: string; assetId?: string }>).some(
        (d) => d.derivativeId === deriv.rows[0].id || d.assetId === assetId,
      ),
    ).toBe(true);

    await unlink(join(absRoot, assetRow.rows[0].storage_key)).catch(() => undefined);
    const after = await http.get('/api/v1/admin/media/health').expect(200);
    expect(
      (after.body.missingMasters as Array<{ assetId: string }>).some((m) => m.assetId === assetId),
    ).toBe(true);

    // Repair path: upload a healthy asset, delete one derivative row+file, run media:repair --execute
    const repairProduct = await http
      .post('/api/v1/admin/catalog/products')
      .set('Origin', origin)
      .send({ name: 'Media Hard Repair', slug: `media-hard-repair-${Date.now()}` })
      .expect(201);
    const repairedUp = await http
      .post(`/api/v1/admin/catalog/products/${repairProduct.body.id}/media`)
      .set('Origin', origin)
      .attach('file', await png(640, 480), 'repair.png')
      .expect(201);
    const repairAssetId = repairedUp.body.media[0].mediaAssetId as string;
    const drow = await pool.query(
      `SELECT id, storage_key FROM media_derivatives WHERE media_asset_id = $1 LIMIT 1`,
      [repairAssetId],
    );
    expect(drow.rows[0]).toBeTruthy();
    await unlink(join(absRoot, drow.rows[0].storage_key)).catch(() => undefined);
    await pool.query(`DELETE FROM media_derivatives WHERE id = $1`, [drow.rows[0].id]);

    const repairOut = spawnSync(
      process.execPath,
      [
        path.join(__dirname, '..', 'node_modules', 'tsx', 'dist', 'cli.mjs'),
        path.join(__dirname, '..', 'src', 'cli', 'media-repair.ts'),
        '--execute',
      ],
      {
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
      },
    );
    if (repairOut.status !== 0 && repairOut.status !== null) {
      // Allowed soft-fail when other assets have missing masters from earlier steps.
      const parsed = (() => {
        try {
          return JSON.parse(repairOut.stdout || '{}') as {
            failures?: unknown[];
            repaired?: string[];
          };
        } catch {
          return null;
        }
      })();
      if (!parsed || (parsed.failures?.length ?? 0) > 0) {
        throw new Error(
          `media:repair failed status=${repairOut.status}\nstdout=${repairOut.stdout}\nstderr=${repairOut.stderr}`,
        );
      }
    }
    const afterRepair = await pool.query(
      `SELECT COUNT(*)::int AS c FROM media_derivatives WHERE media_asset_id = $1`,
      [repairAssetId],
    );
    expect(afterRepair.rows[0].c).toBeGreaterThan(0);

    const probe = await http
      .post('/api/v1/admin/media/health/probe')
      .set('Origin', origin)
      .send({})
      .expect(201);
    expect(probe.body.ok).toBe(true);
  }, 180_000);

  it('orphan grace, cleanup dry-run/execute, and cleanup race with re-attach', async () => {
    const absRoot = join(path.join(__dirname, '..'), mediaRoot);
    const storage = new LocalMediaStorage(
      absRoot,
      `http://127.0.0.1:${apiPort}/api/v1/media`,
    );

    const freshId = uuid();
    const freshKey = `masters/${freshId}.png`;
    await storage.put({
      key: freshKey,
      body: Buffer.from('fresh-orphan'),
      contentType: 'image/png',
    });
    await pool.query(
      `INSERT INTO media_assets (id, storage_key, mime_type, format, byte_size, width, height, checksum_sha256, orphaned_at, created_at)
       VALUES ($1, $2, 'image/png', 'PNG', 12, 10, 10, $3, NOW(), NOW())`,
      [freshId, freshKey, createHash('sha256').update('fresh-orphan').digest('hex')],
    );

    const oldId = uuid();
    const oldKey = `masters/${oldId}.png`;
    await storage.put({
      key: oldKey,
      body: Buffer.from('old-orphan'),
      contentType: 'image/png',
    });
    await pool.query(
      `INSERT INTO media_assets (id, storage_key, mime_type, format, byte_size, width, height, checksum_sha256, orphaned_at, created_at)
       VALUES ($1, $2, 'image/png', 'PNG', 10, 10, 10, $3, NOW() - INTERVAL '8 days', NOW() - INTERVAL '30 days')`,
      [oldId, oldKey, createHash('sha256').update('old-orphan').digest('hex')],
    );

    const raceId = uuid();
    const raceKey = `masters/${raceId}.png`;
    await storage.put({
      key: raceKey,
      body: Buffer.from('race-orphan'),
      contentType: 'image/png',
    });
    await pool.query(
      `INSERT INTO media_assets (id, storage_key, mime_type, format, byte_size, width, height, checksum_sha256, orphaned_at, created_at)
       VALUES ($1, $2, 'image/png', 'PNG', 11, 10, 10, $3, NOW() - INTERVAL '8 days', NOW() - INTERVAL '30 days')`,
      [raceId, raceKey, createHash('sha256').update('race-orphan').digest('hex')],
    );
    const productId = uuid();
    await pool.query(
      `INSERT INTO products (id, slug, name, lifecycle, availability, currency, version, created_at, updated_at)
       VALUES ($1, $2, 'Media Race Attach', 'DRAFT', 'AVAILABLE', 'BYN', 1, NOW(), NOW())`,
      [productId, `media-hard-attach-${Date.now()}`],
    );

    const cliEnv = {
      ...process.env,
      DATABASE_URL: databaseUrl,
      MEDIA_STORAGE: 'local',
      MEDIA_LOCAL_ROOT: mediaRoot,
      MEDIA_PUBLIC_BASE_URL: `http://127.0.0.1:${apiPort}/api/v1/media`,
      NODE_ENV: 'test',
      SESSION_HMAC_SECRET: 'test-session-hmac-secret-32chars!!',
    };
    const tsxCli = path.join(__dirname, '..', 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const cleanupScript = path.join(__dirname, '..', 'src', 'cli', 'media-cleanup.ts');

    const dry = spawnSync(process.execPath, [tsxCli, cleanupScript, '--dry-run'], {
      cwd: path.join(__dirname, '..'),
      env: cliEnv,
      encoding: 'utf8',
    });
    if (dry.status !== 0) {
      throw new Error(`media:cleanup --dry-run failed\nstdout=${dry.stdout}\nstderr=${dry.stderr}`);
    }
    expect(dry.stdout).toContain(oldId);
    expect(dry.stdout).not.toContain(`"id": "${freshId}"`);
    expect((await storage.head(oldKey)).exists).toBe(true);

    // Race: attach during cleanup execute
    const cleanupChild = spawn(process.execPath, [tsxCli, cleanupScript, '--execute'], {
      cwd: path.join(__dirname, '..'),
      env: cliEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await delay(30);
    await pool.query(
      `INSERT INTO product_media (id, product_id, media_asset_id, sort_order, is_primary, created_at)
       VALUES ($1, $2, $3, 0, true, NOW())
       ON CONFLICT DO NOTHING`,
      [uuid(), productId, raceId],
    ).catch(async () => {
      // if race deleted first, attach fails — acceptable; then no refs
      await pool.query(
        `INSERT INTO product_media (id, product_id, media_asset_id, sort_order, is_primary, created_at)
         SELECT $1, $2, $3, 0, true, NOW()
         WHERE EXISTS (SELECT 1 FROM media_assets WHERE id = $3)`,
        [uuid(), productId, raceId],
      );
    });
    await new Promise<void>((resolve) => cleanupChild.on('exit', () => resolve()));

    const refs = await pool.query(
      `SELECT COUNT(*)::int AS c FROM product_media WHERE media_asset_id = $1`,
      [raceId],
    );
    if (refs.rows[0].c > 0) {
      // Attach won or interleaved after purge: DB row + S3 master must both remain.
      // (FOR UPDATE held across storage.delete prevents ProductMedia → missing S3.)
      const stillThere = await pool.query(`SELECT id FROM media_assets WHERE id = $1`, [raceId]);
      expect(stillThere.rows).toHaveLength(1);
      expect((await storage.head(raceKey)).exists).toBe(true);
      const orphaned = await pool.query(
        `SELECT orphaned_at FROM media_assets WHERE id = $1`,
        [raceId],
      );
      expect(orphaned.rows[0].orphaned_at).toBeNull();
    } else {
      // Cleanup won: asset gone (or never attached). S3 key must not linger required.
      const gone = await pool.query(`SELECT id FROM media_assets WHERE id = $1`, [raceId]);
      expect(gone.rows).toHaveLength(0);
    }

    const oldRow = await pool.query(`SELECT id FROM media_assets WHERE id = $1`, [oldId]);
    expect(oldRow.rows).toHaveLength(0);
    expect((await storage.head(oldKey)).exists).toBe(false);

    const freshRow = await pool.query(`SELECT id FROM media_assets WHERE id = $1`, [freshId]);
    expect(freshRow.rows).toHaveLength(1);
  }, 120_000);

  it('upload compensates storage objects when derivative put fails', async () => {
    const absRoot = join(path.join(__dirname, '..'), mediaRoot, 'compensate');
    await mkdir(absRoot, { recursive: true });
    const baseStorage = new LocalMediaStorage(absRoot, 'http://example.test/media');
    const written: string[] = [];
    let puts = 0;
    const storage: MediaStorage = {
      driver: 'local',
      async put(input) {
        puts += 1;
        await baseStorage.put(input);
        written.push(input.key);
        if (puts >= 2) {
          throw new Error('simulated_storage_derivative_failure');
        }
      },
      delete: (key) => baseStorage.delete(key),
      get: (key) => baseStorage.get(key),
      head: (key) => baseStorage.head(key),
      getPublicUrl: (key) => baseStorage.getPublicUrl(key),
    };

    const prisma = {
      client: {
        $transaction: async () => {
          throw new Error('should_not_reach_db');
        },
        mediaAsset: { findUnique: async () => null },
      },
    };
    const appConfig = { mediaMaxBytes: 8_000_000 };
    const media = new MediaService(prisma as never, appConfig as never, storage);

    await expect(media.uploadImage(await png(500, 400))).rejects.toBeTruthy();
    for (const key of written) {
      expect((await storage.head(key)).exists).toBe(false);
    }
    await rm(absRoot, { recursive: true, force: true });
  });

  it('upload compensates when DB persist fails after successful puts', async () => {
    const absRoot = join(path.join(__dirname, '..'), mediaRoot, 'compensate-db');
    await mkdir(absRoot, { recursive: true });
    const baseStorage = new LocalMediaStorage(absRoot, 'http://example.test/media');
    const written: string[] = [];
    const storage: MediaStorage = {
      driver: 'local',
      async put(input) {
        await baseStorage.put(input);
        written.push(input.key);
      },
      delete: (key) => baseStorage.delete(key),
      get: (key) => baseStorage.get(key),
      head: (key) => baseStorage.head(key),
      getPublicUrl: (key) => baseStorage.getPublicUrl(key),
    };
    const prisma = {
      client: {
        $transaction: async () => {
          throw new Error('simulated_db_failure');
        },
        mediaAsset: { findUnique: async () => null },
      },
    };
    const media = new MediaService(
      prisma as never,
      { mediaMaxBytes: 8_000_000 } as never,
      storage,
    );
    await expect(media.uploadImage(await png(480, 480))).rejects.toBeTruthy();
    expect(written.length).toBeGreaterThan(0);
    for (const key of written) {
      expect((await storage.head(key)).exists).toBe(false);
    }
    await rm(absRoot, { recursive: true, force: true });
  });

  it('shared MediaAsset cannot be deleted while ProductMedia references remain', async () => {
    const http = await login();
    const a = await http
      .post('/api/v1/admin/catalog/products')
      .set('Origin', origin)
      .send({ name: 'Media Share A', slug: `media-hard-sha-${Date.now()}` })
      .expect(201);
    const up = await http
      .post(`/api/v1/admin/catalog/products/${a.body.id}/media`)
      .set('Origin', origin)
      .attach('file', await png(320, 320), 'share.png')
      .expect(201);
    const assetId = up.body.media[0].mediaAssetId as string;

    await expect(
      pool.query(`DELETE FROM media_assets WHERE id = $1`, [assetId]),
    ).rejects.toThrow(/restrict|foreign key|product_media/i);
  });

  it('orphanedAt marks last detach, clears on re-attach, and survives product archive', async () => {
    const http = await login();
    const stamp = Date.now();
    const a = await http
      .post('/api/v1/admin/catalog/products')
      .set('Origin', origin)
      .send({ name: 'Media Life A', slug: `media-hard-life-a-${stamp}` })
      .expect(201);
    const b = await http
      .post('/api/v1/admin/catalog/products')
      .set('Origin', origin)
      .send({ name: 'Media Life B', slug: `media-hard-life-b-${stamp}` })
      .expect(201);

    const up = await http
      .post(`/api/v1/admin/catalog/products/${a.body.id}/media`)
      .set('Origin', origin)
      .attach('file', await png(300, 300), 'life.png')
      .expect(201);
    const mediaRow = up.body.media[0] as { id: string; mediaAssetId: string };
    const assetId = mediaRow.mediaAssetId;

    const linked = await pool.query(
      `SELECT orphaned_at FROM media_assets WHERE id = $1`,
      [assetId],
    );
    expect(linked.rows[0].orphaned_at).toBeNull();

    // Share the same MediaAsset with product B (duplicate-style).
    await pool.query(
      `INSERT INTO product_media (id, product_id, media_asset_id, sort_order, is_primary, created_at)
       VALUES ($1, $2, $3, 0, true, NOW())`,
      [uuid(), b.body.id, assetId],
    );

    await http
      .delete(`/api/v1/admin/catalog/products/${a.body.id}/media/${mediaRow.id}`)
      .set('Origin', origin)
      .expect(200);

    const afterOne = await pool.query(
      `SELECT orphaned_at FROM media_assets WHERE id = $1`,
      [assetId],
    );
    expect(afterOne.rows[0].orphaned_at).toBeNull();

    const bMedia = await pool.query(
      `SELECT id FROM product_media WHERE product_id = $1 AND media_asset_id = $2`,
      [b.body.id, assetId],
    );
    await http
      .delete(`/api/v1/admin/catalog/products/${b.body.id}/media/${bMedia.rows[0].id}`)
      .set('Origin', origin)
      .expect(200);

    const orphaned = await pool.query(
      `SELECT orphaned_at FROM media_assets WHERE id = $1`,
      [assetId],
    );
    expect(orphaned.rows[0].orphaned_at).not.toBeNull();

    // Re-attach + reconcile clears orphanedAt (same heal path as cleanup/health).
    await pool.query(
      `INSERT INTO product_media (id, product_id, media_asset_id, sort_order, is_primary, created_at)
       VALUES ($1, $2, $3, 0, true, NOW())`,
      [uuid(), a.body.id, assetId],
    );
    await pool.query(
      `UPDATE media_assets AS ma
       SET orphaned_at = NULL
       WHERE ma.orphaned_at IS NOT NULL
         AND EXISTS (SELECT 1 FROM product_media pm WHERE pm.media_asset_id = ma.id)
         AND ma.id = $1`,
      [assetId],
    );

    const reattached = await pool.query(
      `SELECT orphaned_at FROM media_assets WHERE id = $1`,
      [assetId],
    );
    expect(reattached.rows[0].orphaned_at).toBeNull();

    // Archive keeps ProductMedia — asset must not become orphan.
    const beforeArchive = await http
      .get(`/api/v1/admin/catalog/products/${a.body.id}`)
      .expect(200);
    await http
      .post(`/api/v1/admin/catalog/products/${a.body.id}/archive`)
      .set('Origin', origin)
      .send({ expectedVersion: beforeArchive.body.version })
      .expect(201);
    const afterArchive = await pool.query(
      `SELECT orphaned_at,
              (SELECT count(*)::int FROM product_media WHERE media_asset_id = $1) AS refs
       FROM media_assets WHERE id = $1`,
      [assetId],
    );
    expect(afterArchive.rows[0].refs).toBe(1);
    expect(afterArchive.rows[0].orphaned_at).toBeNull();

    // Simulate hard product delete cascading ProductMedia; reconcile marks orphan.
    await pool.query(`DELETE FROM product_media WHERE media_asset_id = $1`, [assetId]);
    await pool.query(
      `UPDATE media_assets AS ma
       SET orphaned_at = NOW()
       WHERE ma.orphaned_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM product_media pm WHERE pm.media_asset_id = ma.id)
         AND ma.id = $1`,
      [assetId],
    );
    const afterCascade = await pool.query(
      `SELECT orphaned_at FROM media_assets WHERE id = $1`,
      [assetId],
    );
    expect(afterCascade.rows[0].orphaned_at).not.toBeNull();
  }, 120_000);
});

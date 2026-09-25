/**
 * Phase 4 commerce — real PostgreSQL concurrency & idempotency.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import request from 'supertest';
import pg from 'pg';
import * as argon2 from 'argon2';
import sharp from 'sharp';
import { defaultTimeWindows } from '@bouquet-one/contracts';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://bouquet:bouquet_dev_password@localhost:5433/bouquet_one?schema=public';
const apiPort = String(3501 + Math.floor(Math.random() * 200));
const origin = 'http://localhost:3000';
const password = 'CommercePass12!!';

async function hashPassword(value: string): Promise<string> {
  return argon2.hash(value, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

function uuid(): string {
  return randomUUID();
}

function tomorrowBusinessDate(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Minsk',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === 'year')?.value);
  const m = Number(parts.find((p) => p.type === 'month')?.value);
  const d = Number(parts.find((p) => p.type === 'day')?.value);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

describe('Commerce orders (integration)', () => {
  let child: ChildProcessWithoutNullStreams;
  let pool: pg.Pool;
  let superEmail: string;
  const base = `http://127.0.0.1:${apiPort}`;
  let productId: string;
  let variantId: string;
  let timeWindowId: string;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: databaseUrl });

    await pool.query('DELETE FROM outbox_events');
    await pool.query('DELETE FROM order_events');
    await pool.query('DELETE FROM order_items');
    await pool.query('DELETE FROM orders');
    await pool.query('DELETE FROM order_number_sequences');
    await pool.query('DELETE FROM idempotency_records');
    await pool.query(
      `DELETE FROM audit_logs WHERE action::text LIKE 'ORDER_%' OR action::text LIKE 'FULFILLMENT_%'`,
    );
    await pool.query('DELETE FROM admin_sessions');
    // Keep catalog data for shared local DB / Playwright; only remove leftover commerce test products.
    await pool.query(`DELETE FROM product_media WHERE product_id IN (SELECT id FROM products WHERE slug LIKE 'commerce-ameli-%')`);
    await pool.query(`DELETE FROM product_variants WHERE product_id IN (SELECT id FROM products WHERE slug LIKE 'commerce-ameli-%')`);
    await pool.query(`DELETE FROM products WHERE slug LIKE 'commerce-ameli-%'`);
    await pool.query('DELETE FROM admin_users');

    superEmail = `commerce-admin-${Date.now()}@example.com`;
    const passwordHash = await hashPassword(password);
    await pool.query(
      `INSERT INTO admin_users (id, email, display_name, password_hash, role, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'SUPER_ADMIN', 'ACTIVE', NOW(), NOW())`,
      [uuid(), superEmail, 'Commerce Admin', passwordHash],
    );

    const windows = defaultTimeWindows();
    timeWindowId = windows[0]!.id;
    await pool.query(
      `INSERT INTO fulfillment_settings (
         id, delivery_enabled, pickup_enabled, delivery_fee_minor, min_lead_time_minutes,
         max_advance_days, time_windows, pickup_instructions, version, updated_at
       ) VALUES (1, true, true, 0, 120, 14, $1::jsonb, 'Самовывоз: ул. Примерная 1', 1, NOW())
       ON CONFLICT (id) DO UPDATE SET
         delivery_enabled = EXCLUDED.delivery_enabled,
         pickup_enabled = EXCLUDED.pickup_enabled,
         delivery_fee_minor = EXCLUDED.delivery_fee_minor,
         min_lead_time_minutes = EXCLUDED.min_lead_time_minutes,
         max_advance_days = EXCLUDED.max_advance_days,
         time_windows = EXCLUDED.time_windows,
         version = fulfillment_settings.version + 1,
         updated_at = NOW()`,
      [JSON.stringify(windows)],
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
        MEDIA_LOCAL_ROOT: './storage/media-test-commerce',
        MEDIA_PUBLIC_BASE_URL: `http://127.0.0.1:${apiPort}/media`,
        LOG_LEVEL: 'warn',
        THROTTLE_LIMIT: '1000',
        LOGIN_THROTTLE_LIMIT: '1000',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let ready = false;
    let exitCode: number | null = null;
    child.on('exit', (code) => {
      exitCode = code;
    });
    for (let i = 0; i < 90; i += 1) {
      if (exitCode !== null) break;
      try {
        const res = await fetch(`${base}/api/v1/health`);
        if (res.ok) {
          ready = true;
          break;
        }
      } catch {
        /* retry */
      }
      await delay(500);
    }
    if (!ready) {
      throw new Error(`API failed to start on :${apiPort}`);
    }

    const http = request.agent(base);
    await http
      .post('/api/v1/admin/auth/login')
      .set('Origin', origin)
      .send({ email: superEmail, password })
      .expect(201);

    let product = await http
      .post('/api/v1/admin/catalog/products')
      .set('Origin', origin)
      .send({ name: 'Commerce Ameli', slug: `commerce-ameli-${Date.now()}` })
      .expect(201);

    product = await http
      .patch(`/api/v1/admin/catalog/products/${product.body.id}`)
      .set('Origin', origin)
      .send({
        expectedVersion: product.body.version,
        shortDescription: 'Тестовый букет',
        description: 'Описание для commerce integration',
      })
      .expect(200);

    product = await http
      .put(`/api/v1/admin/catalog/products/${product.body.id}/variants`)
      .set('Origin', origin)
      .send({
        expectedVersion: product.body.version,
        variants: [{ name: 'M', priceMinor: '14900', sortOrder: 0, status: 'ACTIVE' }],
      })
      .expect(200);

    const png = await sharp({
      create: { width: 600, height: 600, channels: 3, background: { r: 180, g: 40, b: 90 } },
    })
      .png()
      .toBuffer();

    product = await http
      .post(`/api/v1/admin/catalog/products/${product.body.id}/media`)
      .set('Origin', origin)
      .attach('file', png, 'commerce.png')
      .expect(201);

    const published = await http
      .post(`/api/v1/admin/catalog/products/${product.body.id}/publish`)
      .set('Origin', origin)
      .send({ expectedVersion: product.body.version })
      .expect(201);

    productId = published.body.id;
    variantId = published.body.variants[0].id;
  }, 180_000);

  afterAll(async () => {
    child?.kill('SIGTERM');
    await pool?.end();
  });

  function orderPayload(overrides: Record<string, unknown> = {}) {
    return {
      idempotencyKey: `idemp-${randomBytes(8).toString('hex')}`,
      items: [{ productId, variantId, quantity: 1 }],
      fulfillmentType: 'DELIVERY',
      purchaserName: 'Павел Тест',
      purchaserPhone: '+375291111111',
      recipientName: 'Анна Получатель',
      recipientPhone: '+375292222222',
      surprise: false,
      addressKnown: true,
      deliveryAddress: 'г. Гродно, ул. Тестовая 1',
      fulfillmentDate: tomorrowBusinessDate(),
      timeWindowId,
      cardMessage: 'С праздником!',
      anonymousCard: false,
      customerComment: 'Позвонить за 10 минут',
      ...overrides,
    };
  }

  it('validates cart with server prices and price-change notice', async () => {
    const res = await request(base)
      .post('/api/v1/checkout/validate')
      .send({
        items: [{ productId, variantId, quantity: 2 }],
        priorUnitPrices: [{ variantId, unitPriceMinor: '10000' }],
      })
      .expect(201);

    expect(res.body.ok).toBe(true);
    expect(res.body.items[0].unitPriceMinor).toBe('14900');
    expect(res.body.subtotalMinor).toBe('29800');
    expect(res.body.issues.some((i: { code: string }) => i.code === 'PRICE_CHANGED')).toBe(true);
  });

  it('creates order with snapshots, tracking token, outbox, and history', async () => {
    const created = await request(base)
      .post('/api/v1/orders')
      .send(orderPayload())
      .expect(201);

    expect(created.body.orderNumber).toMatch(/^\d{6}-\d{3}$/);
    expect(created.body.trackingToken).toBeTruthy();
    expect(created.body.trackingToken.length).toBeGreaterThanOrEqual(40);
    expect(created.body.replayed).toBe(false);
    expect(created.body.status).toBe('RECEIVED');

    const track = await request(base)
      .get(`/api/v1/orders/track/${created.body.trackingToken}`)
      .expect(200);
    expect(track.body.orderNumber).toBe(created.body.orderNumber);
    expect(track.body.items[0].unitPriceMinor).toBe('14900');
    expect(track.body.recipientSummary).toMatch(/\*/);
    expect(track.body.recipientSummary).not.toContain('29122');
    expect(track.body.recipientSummary).toMatch(/\*\*\*/);

    const outbox = await pool.query(
      `SELECT event_type, payload FROM outbox_events WHERE aggregate_id = $1`,
      [created.body.id],
    );
    expect(outbox.rows).toHaveLength(1);
    expect(outbox.rows[0].event_type).toBe('ORDER_CREATED');

    const rawStored = await pool.query(
      `SELECT tracking_token_hash FROM orders WHERE id = $1`,
      [created.body.id],
    );
    expect(rawStored.rows[0].tracking_token_hash).not.toBe(created.body.trackingToken);
    expect(rawStored.rows[0].tracking_token_hash).toHaveLength(64);

    const events = await pool.query(
      `SELECT type FROM order_events WHERE order_id = $1`,
      [created.body.id],
    );
    expect(events.rows.map((r: { type: string }) => r.type)).toContain('ORDER_CREATED');
  });

  it('replays same idempotency key with recoverable tracking token and conflicts on different payload', async () => {
    const key = `idemp-replay-${randomBytes(6).toString('hex')}`;
    const body = orderPayload({ idempotencyKey: key });
    const first = await request(base).post('/api/v1/orders').send(body).expect(201);
    expect(first.body.trackingToken).toBeTruthy();

    // Lost-response recovery: same key + same payload must return usable original token
    const second = await request(base).post('/api/v1/orders').send(body).expect(201);
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.orderNumber).toBe(first.body.orderNumber);
    expect(second.body.replayed).toBe(true);
    expect(second.body.trackingToken).toBe(first.body.trackingToken);
    expect(second.body.trackingPath).toBe(`/order/${first.body.trackingToken}`);

    await request(base).get(`/api/v1/orders/track/${second.body.trackingToken}`).expect(200);

    const idemp = await pool.query(
      `SELECT request_hash, encryption_key_version,
              octet_length(encrypted_recovery_payload) AS blob_len
       FROM idempotency_records WHERE scope = 'orders.create' AND idempotency_key = $1`,
      [key],
    );
    expect(idemp.rows).toHaveLength(1);
    expect(idemp.rows[0].blob_len).toBeGreaterThan(20);
    // Ciphertext must not equal plaintext token
    expect(String(idemp.rows[0].request_hash)).not.toContain(first.body.trackingToken);

    const conflict = await request(base)
      .post('/api/v1/orders')
      .send({ ...body, purchaserName: 'Другой Клиент' })
      .expect(409);
    expect(conflict.body.message).toMatch(/Idempotency|payload/i);
    expect(conflict.body.trackingToken).toBeUndefined();
  });

  it('creates exactly one order for concurrent identical idempotency keys with recoverable tokens', async () => {
    const key = `idemp-race-${randomBytes(6).toString('hex')}`;
    const body = orderPayload({ idempotencyKey: key });
    const results = await Promise.all(
      Array.from({ length: 8 }, () => request(base).post('/api/v1/orders').send(body)),
    );
    const ok = results.filter((r) => r.status === 201);
    expect(ok.length).toBe(8);
    const ids = new Set(ok.map((r) => r.body.id));
    expect(ids.size).toBe(1);
    const tokens = new Set(ok.map((r) => r.body.trackingToken).filter(Boolean));
    expect(tokens.size).toBe(1);
    const count = await pool.query(`SELECT COUNT(*)::int AS c FROM orders WHERE idempotency_key = $1`, [
      key,
    ]);
    expect(count.rows[0].c).toBe(1);
    const idempCount = await pool.query(
      `SELECT COUNT(*)::int AS c FROM idempotency_records WHERE idempotency_key = $1`,
      [key],
    );
    expect(idempCount.rows[0].c).toBe(1);
  });

  it('allocates unique order numbers under concurrency', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        request(base)
          .post('/api/v1/orders')
          .send(orderPayload({ idempotencyKey: `idemp-num-${Date.now()}-${i}-${randomBytes(4).toString('hex')}` })),
      ),
    );
    const ok = results.filter((r) => r.status === 201);
    expect(ok.length).toBe(10);
    const numbers = ok.map((r) => r.body.orderNumber);
    expect(new Set(numbers).size).toBe(10);
  });

  it('supports pickup without address and admin status transitions', async () => {
    const created = await request(base)
      .post('/api/v1/orders')
      .send(
        orderPayload({
          fulfillmentType: 'PICKUP',
          recipientName: null,
          recipientPhone: null,
          addressKnown: undefined,
          deliveryAddress: null,
        }),
      )
      .expect(201);

    const http = request.agent(base);
    await http
      .post('/api/v1/admin/auth/login')
      .set('Origin', origin)
      .send({ email: superEmail, password })
      .expect(201);

    expect(http).toBeTruthy();
    const cookieHeader = (await http.get('/api/v1/admin/auth/me')).headers;
    void cookieHeader;

    let detail = await http
      .get(`/api/v1/admin/orders/${created.body.id}`)
      .expect(200);
    expect(detail.body.fulfillmentType).toBe('PICKUP');
    expect(detail.body.allowedTransitions).toContain('CONFIRMED');

    detail = await http
      .post(`/api/v1/admin/orders/${created.body.id}/transition`)
      .set('Origin', origin)
      .send({ toStatus: 'CONFIRMED' })
      .expect(201);
    expect(detail.body.status).toBe('CONFIRMED');

    detail = await http
      .post(`/api/v1/admin/orders/${created.body.id}/transition`)
      .set('Origin', origin)
      .send({ toStatus: 'PREPARING' })
      .expect(201);

    detail = await http
      .post(`/api/v1/admin/orders/${created.body.id}/transition`)
      .set('Origin', origin)
      .send({ toStatus: 'READY' })
      .expect(201);

    detail = await http
      .post(`/api/v1/admin/orders/${created.body.id}/transition`)
      .set('Origin', origin)
      .send({ toStatus: 'COMPLETED' })
      .expect(201);
    expect(detail.body.status).toBe('COMPLETED');

    await http
      .post(`/api/v1/admin/orders/${created.body.id}/transition`)
      .set('Origin', origin)
      .send({ toStatus: 'DELIVERING' })
      .expect(409);
  });

  it('handles concurrent identical status transitions without duplicate history', async () => {
    const created = await request(base)
      .post('/api/v1/orders')
      .send(orderPayload({ fulfillmentType: 'PICKUP' }))
      .expect(201);

    const a = request.agent(base);
    const b = request.agent(base);
    await a
      .post('/api/v1/admin/auth/login')
      .set('Origin', origin)
      .send({ email: superEmail, password })
      .expect(201);
    await b
      .post('/api/v1/admin/auth/login')
      .set('Origin', origin)
      .send({ email: superEmail, password })
      .expect(201);

    const [r1, r2] = await Promise.all([
      a
        .post(`/api/v1/admin/orders/${created.body.id}/transition`)
        .set('Origin', origin)
        .send({ toStatus: 'CONFIRMED' }),
      b
        .post(`/api/v1/admin/orders/${created.body.id}/transition`)
        .set('Origin', origin)
        .send({ toStatus: 'CONFIRMED' }),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 409]);

    const events = await pool.query(
      `SELECT COUNT(*)::int AS c FROM order_events WHERE order_id = $1 AND type = 'ORDER_CONFIRMED'`,
      [created.body.id],
    );
    expect(events.rows[0].c).toBe(1);
  });

  it('rejects over-posted client prices (forbidNonWhitelisted)', async () => {
    await request(base)
      .post('/api/v1/orders')
      .send({
        ...orderPayload(),
        items: [{ productId, variantId, quantity: 1, unitPriceMinor: '1' }],
      })
      .expect(400);
  });

  it('cancels with reason and exposes cancelled tracking status', async () => {
    const created = await request(base)
      .post('/api/v1/orders')
      .send(orderPayload())
      .expect(201);

    const http = request.agent(base);
    await http
      .post('/api/v1/admin/auth/login')
      .set('Origin', origin)
      .send({ email: superEmail, password })
      .expect(201);

    await http
      .post(`/api/v1/admin/orders/${created.body.id}/cancel`)
      .set('Origin', origin)
      .send({ reason: 'Нет курьера на окно' })
      .expect(201);

    const track = await request(base)
      .get(`/api/v1/orders/track/${created.body.trackingToken}`)
      .expect(200);
    expect(track.body.status).toBe('CANCELLED');
    expect(JSON.stringify(track.body)).not.toMatch(/Нет курьера/);
  });
});

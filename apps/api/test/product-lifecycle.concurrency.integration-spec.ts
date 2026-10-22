/**
 * PostgreSQL concurrency tests for product deletion vs order creation,
 * and for a product update that must keep variant ids, promotions, and collections.
 *
 * Uses the same lock SQL as order creation and hard delete. Requires a
 * reachable DATABASE_URL. Creates only rows prefixed with `race-`.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { planVariantSync } from '../src/catalog/product-editor.util';
import { lockProductRows, PRODUCT_ROW_LOCK_SQL } from '../src/catalog/product-lock.util';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://bouquet:bouquet_dev_password@localhost:5433/bouquet_one?schema=public';

function hex(bytes: number): string {
  return randomBytes(bytes).toString('hex');
}

function asLockClient(client: pg.PoolClient) {
  return {
    $queryRawUnsafe: async (query: string, ...values: unknown[]) => {
      const result = await client.query(query, values as never[]);
      return result.rows;
    },
  };
}

async function waitForProductLockWaiter(pool: pg.Pool): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const result = await pool.query<{ waiting: number }>(
      `SELECT COUNT(*)::int AS waiting
       FROM pg_locks
       WHERE relation = 'products'::regclass
         AND NOT granted`,
    );
    if (Number(result.rows[0]?.waiting ?? 0) > 0) return;
    await delay(40);
  }
  throw new Error('timed out waiting for a blocked product-row lock');
}

describe('product lifecycle concurrency (PostgreSQL)', () => {
  let pool: pg.Pool;
  let connected = false;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 3_000 });
    try {
      await pool.query('SELECT 1');
      connected = true;
    } catch (error) {
      await pool.end().catch(() => undefined);
      const reason =
        error instanceof AggregateError
          ? error.errors.map((item) => (item instanceof Error ? item.message : String(item))).join('; ')
          : error instanceof Error
            ? error.message
            : 'connection failed';
      throw new Error(`Integration tests require PostgreSQL (${reason || 'connection failed'})`);
    }
  }, 20_000);

  afterAll(async () => {
    if (!connected) return;
    await pool.query(`DELETE FROM orders WHERE idempotency_key LIKE 'race-%'`);
    await pool.query(`DELETE FROM products WHERE slug LIKE 'race-%'`);
    await pool.query(`DELETE FROM bestseller_groups WHERE slug LIKE 'race-%'`);
    await pool.end();
  });

  async function seedProduct(label: string) {
    const productId = randomUUID();
    const visibleId = randomUUID();
    const hiddenId = randomUUID();
    const slug = `race-${label}-${hex(4)}`;
    await pool.query(
      `INSERT INTO products (id, slug, name, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())`,
      [productId, slug, `Race ${label}`],
    );
    await pool.query(
      `INSERT INTO product_variants (id, product_id, name, price_minor, sort_order, status, created_at, updated_at)
       VALUES
         ($1, $2, 'Стандарт', 1000, 0, 'ACTIVE', NOW(), NOW()),
         ($3, $2, 'Скрытый', 1, 1, 'INACTIVE', NOW(), NOW())`,
      [visibleId, productId, hiddenId],
    );
    return { productId, visibleId, hiddenId, slug };
  }

  async function insertOrder(
    client: pg.PoolClient,
    productId: string,
    variantId: string,
    slug: string,
  ) {
    const orderId = randomUUID();
    await client.query(
      `INSERT INTO orders (
         id, order_number, tracking_token_hash, idempotency_key, status, fulfillment_type,
         purchaser_name, purchaser_phone_e164, fulfillment_date, time_window_id, time_window_label,
         time_window_start_minutes, time_window_end_minutes, currency, subtotal_minor,
         delivery_fee_minor, total_minor, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, 'RECEIVED', 'PICKUP',
         'Race buyer', '+375291110000', '2026-10-23', 'race-window', '10:00–12:00',
         600, 720, 'BYN', 1000, 0, 1000, NOW(), NOW()
       )`,
      [orderId, `R${hex(8)}`, hex(32), `race-${hex(8)}`],
    );
    await client.query(
      `INSERT INTO order_items (
         id, order_id, sort_order, product_id, variant_id, product_name, product_slug,
         variant_name, unit_price_minor, quantity, line_total_minor, currency
       ) VALUES ($1, $2, 0, $3, $4, 'Race', $5, 'Стандарт', 1000, 1, 1000, 'BYN')`,
      [randomUUID(), orderId, productId, variantId, slug],
    );
  }

  async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const value = await fn(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  it('uses the product-row lock SQL from the application', () => {
    expect(PRODUCT_ROW_LOCK_SQL).toContain('FOR UPDATE');
    expect(PRODUCT_ROW_LOCK_SQL).toContain('products');
  });

  it('keeps the product and the order when checkout locks the row first', async () => {
    const { productId, visibleId, slug } = await seedProduct('order-first');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let ready!: () => void;
    const readyPromise = new Promise<void>((resolve) => {
      ready = resolve;
    });

    const orderTask = withTransaction(async (client) => {
      const locked = await lockProductRows(asLockClient(client), [productId]);
      expect(locked).toEqual([productId]);
      await insertOrder(client, productId, visibleId, slug);
      ready();
      await gate;
    });

    const deleteTask = (async () => {
      try {
        await Promise.race([
          readyPromise,
          delay(8_000).then(() => {
            throw new Error('order transaction did not take the product lock');
          }),
        ]);
        const pending = withTransaction(async (client) => {
          await lockProductRows(asLockClient(client), [productId]);
          const count = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM order_items WHERE product_id = $1`,
            [productId],
          );
          if (Number(count.rows[0]?.count ?? 0) > 0) throw new Error('HAS_ORDERS');
          await client.query(`DELETE FROM products WHERE id = $1`, [productId]);
        });
        await waitForProductLockWaiter(pool);
        return await pending;
      } finally {
        release();
      }
    })();

    const [orderResult, deleteResult] = await Promise.allSettled([orderTask, deleteTask]);
    expect(orderResult.status).toBe('fulfilled');
    expect(deleteResult.status).toBe('rejected');
    if (deleteResult.status === 'rejected') {
      expect(String(deleteResult.reason)).toContain('HAS_ORDERS');
    }

    const still = await pool.query(`SELECT id FROM products WHERE id = $1`, [productId]);
    const items = await pool.query<{ variant_id: string }>(
      `SELECT variant_id FROM order_items WHERE product_id = $1`,
      [productId],
    );
    expect(still.rowCount).toBe(1);
    expect(items.rows).toHaveLength(1);
    expect(items.rows[0]?.variant_id).toBe(visibleId);
  });

  it('does not create an order for a product deleted under the same lock', async () => {
    const { productId, visibleId, slug } = await seedProduct('delete-first');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let ready!: () => void;
    const readyPromise = new Promise<void>((resolve) => {
      ready = resolve;
    });

    const deleteTask = withTransaction(async (client) => {
      const locked = await lockProductRows(asLockClient(client), [productId]);
      expect(locked).toEqual([productId]);
      const count = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM order_items WHERE product_id = $1`,
        [productId],
      );
      expect(Number(count.rows[0]?.count ?? 0)).toBe(0);
      ready();
      await gate;
      await client.query(`DELETE FROM products WHERE id = $1`, [productId]);
    });

    const orderTask = (async () => {
      try {
        await Promise.race([
          readyPromise,
          delay(8_000).then(() => {
            throw new Error('delete transaction did not take the product lock');
          }),
        ]);
        const pending = withTransaction(async (client) => {
          const locked = await lockProductRows(asLockClient(client), [productId]);
          if (!locked.includes(productId)) return 'missing' as const;
          await insertOrder(client, productId, visibleId, slug);
          return 'created' as const;
        });
        await waitForProductLockWaiter(pool);
        return await pending;
      } finally {
        release();
      }
    })();

    const [deleteResult, orderResult] = await Promise.allSettled([deleteTask, orderTask]);
    expect(deleteResult.status).toBe('fulfilled');
    expect(orderResult.status).toBe('fulfilled');
    if (orderResult.status === 'fulfilled') {
      expect(orderResult.value).toBe('missing');
    }
    const still = await pool.query(`SELECT id FROM products WHERE id = $1`, [productId]);
    const items = await pool.query(`SELECT id FROM order_items WHERE product_id = $1`, [productId]);
    expect(still.rowCount).toBe(0);
    expect(items.rowCount).toBe(0);
  });

  it('locks overlapping product sets in sorted id order without deadlocking', async () => {
    const first = await seedProduct('multi-a');
    const second = await seedProduct('multi-b');
    const sorted = [first.productId, second.productId].sort();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let ready!: () => void;
    const readyPromise = new Promise<void>((resolve) => {
      ready = resolve;
    });

    const holder = withTransaction(async (client) => {
      const locked = await lockProductRows(asLockClient(client), [
        second.productId,
        first.productId,
      ]);
      expect(locked).toEqual(sorted);
      ready();
      await gate;
    });

    const waiter = (async () => {
      try {
        await readyPromise;
        const pending = withTransaction(async (client) => {
          await lockProductRows(asLockClient(client), [second.productId, first.productId]);
        });
        await waitForProductLockWaiter(pool);
        return await pending;
      } finally {
        release();
      }
    })();

    const [held, waited] = await Promise.allSettled([holder, waiter]);
    expect(held.status).toBe('fulfilled');
    expect(waited.status).toBe('fulfilled');
  });

  it('keeps variant ids, the promotion, and the collection when the product row changes', async () => {
    const { productId, visibleId, hiddenId } = await seedProduct('merch');
    const groupId = randomUUID();
    await pool.query(
      `INSERT INTO bestseller_groups (id, slug, name, created_at, updated_at)
       VALUES ($1, $2, 'Race collection', NOW(), NOW())`,
      [groupId, `race-group-${hex(4)}`],
    );
    await pool.query(
      `INSERT INTO bestseller_group_products (group_id, product_id, sort_order)
       VALUES ($1, $2, 0)`,
      [groupId, productId],
    );
    await pool.query(
      `INSERT INTO product_promotions (
         id, product_id, enabled, type, percent_off, version, created_at, updated_at
       ) VALUES ($1, $2, TRUE, 'PERCENT', 10, 1, NOW(), NOW())`,
      [randomUUID(), productId],
    );

    const editor = withTransaction(async (client) => {
      await lockProductRows(asLockClient(client), [productId]);
      const existing = await client.query<{ id: string; sort_order: number }>(
        `SELECT id, sort_order FROM product_variants WHERE product_id = $1`,
        [productId],
      );
      const plan = planVariantSync(
        existing.rows.map((row) => ({ id: row.id, sortOrder: row.sort_order })),
        [
          {
            id: visibleId,
            name: 'Стандарт',
            priceMinor: 8800n,
            sortOrder: 0,
            status: 'ACTIVE',
          },
        ],
        'keep-unmentioned',
      );
      expect(plan.deleteIds).toEqual([]);
      expect(plan.creates).toEqual([]);
      expect(plan.updates.map((row) => row.id)).toEqual([visibleId]);
      for (const row of plan.updates) {
        const updated = await client.query(
          `UPDATE product_variants
           SET name = $1, price_minor = $2, sort_order = $3, status = $4, updated_at = NOW()
           WHERE id = $5 AND product_id = $6`,
          [row.name, row.priceMinor.toString(), row.sortOrder, row.status, row.id, productId],
        );
        expect(updated.rowCount).toBe(1);
      }
      await client.query(
        `UPDATE products SET name = $1, description = $2, updated_at = NOW() WHERE id = $3`,
        ['После сохранения', 'Новое описание', productId],
      );
    });

    const promotionEdit = pool.query(
      `UPDATE product_promotions SET percent_off = 33, updated_at = NOW() WHERE product_id = $1`,
      [productId],
    );
    await Promise.all([editor, promotionEdit]);

    const product = await pool.query<{ name: string; description: string }>(
      `SELECT name, description FROM products WHERE id = $1`,
      [productId],
    );
    const variants = await pool.query<{ id: string; price_minor: string; status: string }>(
      `SELECT id, price_minor::text, status FROM product_variants WHERE product_id = $1 ORDER BY sort_order`,
      [productId],
    );
    const promotion = await pool.query<{ percent_off: number; enabled: boolean }>(
      `SELECT percent_off, enabled FROM product_promotions WHERE product_id = $1`,
      [productId],
    );
    const links = await pool.query<{ group_id: string }>(
      `SELECT group_id FROM bestseller_group_products WHERE product_id = $1`,
      [productId],
    );

    expect(product.rows[0]?.name).toBe('После сохранения');
    expect(product.rows[0]?.description).toBe('Новое описание');
    expect(variants.rows.map((row) => row.id)).toEqual([visibleId, hiddenId]);
    expect(variants.rows[0]?.price_minor).toBe('8800');
    expect(variants.rows[1]?.status).toBe('INACTIVE');
    expect(variants.rows[1]?.price_minor).toBe('1');
    expect(promotion.rows[0]?.percent_off).toBe(33);
    expect(promotion.rows[0]?.enabled).toBe(true);
    expect(links.rows.map((row) => row.group_id)).toEqual([groupId]);
  });
});

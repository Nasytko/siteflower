/**
 * Outbox SKIP LOCKED concurrency — real PostgreSQL via `pg`.
 * Avoids Nest/Prisma ESM under Jest (same pattern as other integration specs).
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { computeBackoffMs, shouldMarkFailed } from '../src/integration/backoff';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://bouquet:bouquet_dev_password@localhost:5433/bouquet_one?schema=public';

const hasDb = Boolean(databaseUrl);

async function claimBatchForIds(
  client: pg.PoolClient,
  ids: string[],
  limit: number,
  workerId: string,
  now: Date,
  leaseSeconds: number,
): Promise<string[]> {
  const leaseExpiresAt = new Date(now.getTime() + leaseSeconds * 1000);
  const result = await client.query<{ id: string }>(
    `
    WITH candidates AS (
      SELECT id
      FROM outbox_events
      WHERE id = ANY($5::uuid[])
        AND (
          (status IN ('PENDING'::"OutboxDeliveryStatus", 'RETRY'::"OutboxDeliveryStatus")
            AND available_at <= $1)
          OR (
            status = 'PROCESSING'::"OutboxDeliveryStatus"
            AND lease_expires_at IS NOT NULL
            AND lease_expires_at < $1
          )
        )
      ORDER BY available_at ASC, created_at ASC
      LIMIT $2
      FOR UPDATE SKIP LOCKED
    )
    UPDATE outbox_events o
    SET
      status = 'PROCESSING'::"OutboxDeliveryStatus",
      lease_owner = $3,
      lease_expires_at = $4,
      attempt_count = o.attempt_count + 1,
      attempts = o.attempts + 1,
      last_attempt_at = $1,
      next_attempt_at = NULL
    FROM candidates c
    WHERE o.id = c.id
    RETURNING o.id
    `,
    [now, limit, workerId, leaseExpiresAt, ids],
  );
  return result.rows.map((row) => row.id);
}

(hasDb ? describe : describe.skip)('integration outbox (integration)', () => {
  let pool: pg.Pool;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: databaseUrl });
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  it('claimBatch is exclusive under concurrency (SKIP LOCKED)', async () => {
    const now = new Date();
    const ids = [randomUUID(), randomUUID(), randomUUID()];

    for (const id of ids) {
      await pool.query(
        `INSERT INTO outbox_events (
          id, event_type, aggregate_type, aggregate_id, schema_version, payload,
          status, available_at, created_at, attempt_count, attempts
        ) VALUES (
          $1, 'ORDER_CREATED', 'Order', $2, 1, $3::jsonb,
          'PENDING'::"OutboxDeliveryStatus", $4, $4, 0, 0
        )`,
        [id, randomUUID(), JSON.stringify({ eventId: id, test: true }), now],
      );
    }

    const [a, b] = await Promise.all([
      pool.connect().then(async (client) => {
        try {
          await client.query('BEGIN');
          const claimed = await claimBatchForIds(client, ids, 2, 'worker-a', now, 60);
          await client.query('COMMIT');
          return claimed;
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      }),
      pool.connect().then(async (client) => {
        try {
          await client.query('BEGIN');
          const claimed = await claimBatchForIds(client, ids, 2, 'worker-b', now, 60);
          await client.query('COMMIT');
          return claimed;
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      }),
    ]);

    const claimedIds = [...a, ...b];
    expect(new Set(claimedIds).size).toBe(claimedIds.length);
    expect(claimedIds.length).toBe(3);
    expect(a.some((id) => b.includes(id))).toBe(false);

    await pool.query(`DELETE FROM outbox_events WHERE id = ANY($1::uuid[])`, [ids]);
  });

  it('unit-level backoff helpers remain consistent', () => {
    expect(computeBackoffMs(1, () => 0)).toBe(30_000);
    expect(shouldMarkFailed('AUTH_FAILED', 2, 12)).toBe(true);
  });
});

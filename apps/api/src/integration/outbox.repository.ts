import { Injectable } from '@nestjs/common';
import type {
  IntegrationFailureCategory,
  OutboxDeliveryStatus,
  OutboxEventAdminDetail,
  OutboxEventAdminListItem,
} from '@bouquet-one/contracts';
import type { OutboxEvent, Prisma } from '@bouquet-one/database';
import { PrismaService } from '../database/prisma.service';
import { maskPhoneE164 } from '../orders/phone.util';
import { computeNextAttemptAt, sanitizeErrorMessage } from './backoff';

export type OutboxListFilters = {
  status?: OutboxDeliveryStatus;
  /** Order id → filter by aggregateId */
  orderId?: string;
  page?: number;
  pageSize?: number;
};

type ClaimRow = {
  id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  schema_version: number;
  payload: unknown;
  created_at: Date;
  available_at: Date;
  status: OutboxDeliveryStatus;
  attempt_count: number;
  last_attempt_at: Date | null;
  next_attempt_at: Date | null;
  delivered_at: Date | null;
  processed_at: Date | null;
  attempts: number;
  lease_owner: string | null;
  lease_expires_at: Date | null;
  failure_category: string | null;
  last_error_sanitized: string | null;
  remote_reference: string | null;
};

function mapClaimRow(row: ClaimRow): OutboxEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    schemaVersion: row.schema_version,
    payload: row.payload as Prisma.JsonValue,
    createdAt: row.created_at,
    availableAt: row.available_at,
    status: row.status,
    attemptCount: row.attempt_count,
    lastAttemptAt: row.last_attempt_at,
    nextAttemptAt: row.next_attempt_at,
    deliveredAt: row.delivered_at,
    processedAt: row.processed_at,
    attempts: row.attempts,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at,
    failureCategory: row.failure_category,
    lastErrorSanitized: row.last_error_sanitized,
    remoteReference: row.remote_reference,
  };
}

function orderNumberFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  if (typeof root.orderNumber === 'string') return root.orderNumber;
  const order = root.order;
  if (order && typeof order === 'object') {
    const n = (order as Record<string, unknown>).orderNumber;
    if (typeof n === 'string') return n;
  }
  return null;
}

function toListItem(event: OutboxEvent): OutboxEventAdminListItem {
  return {
    id: event.id,
    eventType: event.eventType,
    schemaVersion: event.schemaVersion,
    aggregateId: event.aggregateId,
    orderNumber: orderNumberFromPayload(event.payload),
    status: event.status,
    attemptCount: event.attemptCount,
    createdAt: event.createdAt.toISOString(),
    availableAt: event.availableAt.toISOString(),
    lastAttemptAt: event.lastAttemptAt?.toISOString() ?? null,
    nextAttemptAt: event.nextAttemptAt?.toISOString() ?? null,
    deliveredAt: event.deliveredAt?.toISOString() ?? null,
    failureCategory: event.failureCategory,
    lastErrorSanitized: event.lastErrorSanitized,
    remoteReference: event.remoteReference,
  };
}

function maskPayloadPhones(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') return null;
  const clone = structuredClone(payload) as Record<string, unknown>;
  const order = clone.order;
  if (order && typeof order === 'object') {
    const o = order as Record<string, unknown>;
    const purchaser = o.purchaser;
    if (purchaser && typeof purchaser === 'object') {
      const p = purchaser as Record<string, unknown>;
      if (typeof p.phoneE164 === 'string') p.phoneE164 = maskPhoneE164(p.phoneE164);
      if (typeof p.name === 'string' && p.name.length > 0) {
        p.name = `${p.name.slice(0, 1)}***`;
      }
    }
    const recipient = o.recipient;
    if (recipient && typeof recipient === 'object') {
      const r = recipient as Record<string, unknown>;
      if (typeof r.phoneE164 === 'string') r.phoneE164 = maskPhoneE164(r.phoneE164);
      if (typeof r.name === 'string' && r.name.length > 0) {
        r.name = `${r.name.slice(0, 1)}***`;
      }
    }
    const delivery = o.delivery;
    if (delivery && typeof delivery === 'object') {
      const d = delivery as Record<string, unknown>;
      if (typeof d.address === 'string' && d.address.length > 8) {
        d.address = `${d.address.slice(0, 8)}…`;
      }
    }
  }
  return clone;
}

@Injectable()
export class OutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Claim a batch with FOR UPDATE SKIP LOCKED.
   * Eligible: PENDING/RETRY with availableAt<=now, or PROCESSING with expired lease.
   */
  async claimBatch(limit: number, workerId: string, now: Date, leaseSeconds: number): Promise<OutboxEvent[]> {
    const leaseExpiresAt = new Date(now.getTime() + leaseSeconds * 1000);
    const rows = await this.prisma.client.$queryRaw<ClaimRow[]>`
      WITH candidates AS (
        SELECT id
        FROM outbox_events
        WHERE (
          (status IN ('PENDING'::"OutboxDeliveryStatus", 'RETRY'::"OutboxDeliveryStatus")
            AND available_at <= ${now})
          OR (
            status = 'PROCESSING'::"OutboxDeliveryStatus"
            AND lease_expires_at IS NOT NULL
            AND lease_expires_at < ${now}
          )
        )
        ORDER BY available_at ASC, created_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE outbox_events o
      SET
        status = 'PROCESSING'::"OutboxDeliveryStatus",
        lease_owner = ${workerId},
        lease_expires_at = ${leaseExpiresAt},
        attempt_count = o.attempt_count + 1,
        attempts = o.attempts + 1,
        last_attempt_at = ${now},
        next_attempt_at = NULL
      FROM candidates c
      WHERE o.id = c.id
      RETURNING
        o.id,
        o.event_type,
        o.aggregate_type,
        o.aggregate_id,
        o.schema_version,
        o.payload,
        o.created_at,
        o.available_at,
        o.status,
        o.attempt_count,
        o.last_attempt_at,
        o.next_attempt_at,
        o.delivered_at,
        o.processed_at,
        o.attempts,
        o.lease_owner,
        o.lease_expires_at,
        o.failure_category,
        o.last_error_sanitized,
        o.remote_reference
    `;
    return rows.map(mapClaimRow);
  }

  /**
   * Completes delivery only if this worker still owns the PROCESSING lease.
   * Returns false when the lease was stolen/expired (stale worker — no-op).
   */
  async markDelivered(
    id: string,
    workerId: string,
    remoteReference: string,
    now: Date = new Date(),
  ): Promise<boolean> {
    const result = await this.prisma.client.outboxEvent.updateMany({
      where: {
        id,
        status: 'PROCESSING',
        leaseOwner: workerId,
        leaseExpiresAt: { gt: now },
      },
      data: {
        status: 'DELIVERED',
        deliveredAt: now,
        processedAt: now,
        remoteReference: remoteReference.slice(0, 200),
        leaseOwner: null,
        leaseExpiresAt: null,
        failureCategory: null,
        lastErrorSanitized: null,
        nextAttemptAt: null,
        availableAt: now,
      },
    });
    return result.count === 1;
  }

  async markRetry(
    id: string,
    workerId: string,
    category: IntegrationFailureCategory,
    sanitizedError: string,
    nextAttemptAt: Date,
    now: Date = new Date(),
  ): Promise<boolean> {
    const result = await this.prisma.client.outboxEvent.updateMany({
      where: {
        id,
        status: 'PROCESSING',
        leaseOwner: workerId,
        leaseExpiresAt: { gt: now },
      },
      data: {
        status: 'RETRY',
        failureCategory: category,
        lastErrorSanitized: sanitizeErrorMessage(sanitizedError),
        nextAttemptAt,
        availableAt: nextAttemptAt,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    return result.count === 1;
  }

  async markFailed(
    id: string,
    workerId: string,
    category: IntegrationFailureCategory,
    sanitizedError: string,
    now: Date = new Date(),
  ): Promise<boolean> {
    const result = await this.prisma.client.outboxEvent.updateMany({
      where: {
        id,
        status: 'PROCESSING',
        leaseOwner: workerId,
        leaseExpiresAt: { gt: now },
      },
      data: {
        status: 'FAILED',
        failureCategory: category,
        lastErrorSanitized: sanitizeErrorMessage(sanitizedError),
        leaseOwner: null,
        leaseExpiresAt: null,
        nextAttemptAt: null,
      },
    });
    return result.count === 1;
  }

  async releaseExpiredLeases(now: Date = new Date()): Promise<number> {
    const result = await this.prisma.client.outboxEvent.updateMany({
      where: {
        status: 'PROCESSING',
        leaseExpiresAt: { lt: now },
      },
      data: {
        status: 'RETRY',
        availableAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
        failureCategory: 'TIMEOUT',
        lastErrorSanitized: 'Lease expired — requeued',
      },
    });
    return result.count;
  }

  async scheduleRetryFromAttempt(
    id: string,
    workerId: string,
    category: IntegrationFailureCategory,
    error: string,
    attemptCount: number,
    now: Date = new Date(),
  ): Promise<boolean> {
    const next = computeNextAttemptAt(attemptCount, now);
    return this.markRetry(id, workerId, category, error, next, now);
  }

  async listAdmin(filters: OutboxListFilters): Promise<{
    items: OutboxEventAdminListItem[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    const where: Prisma.OutboxEventWhereInput = {};
    if (filters.status) where.status = filters.status;
    if (filters.orderId) where.aggregateId = filters.orderId;

    const [total, rows] = await Promise.all([
      this.prisma.client.outboxEvent.count({ where }),
      this.prisma.client.outboxEvent.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map(toListItem),
      total,
      page,
      pageSize,
    };
  }

  async getAdminDetail(id: string): Promise<OutboxEventAdminDetail | null> {
    const event = await this.prisma.client.outboxEvent.findUnique({ where: { id } });
    if (!event) return null;
    return {
      ...toListItem(event),
      payloadPreview: maskPayloadPhones(event.payload),
    };
  }

  async manualRetry(id: string, now: Date = new Date()): Promise<OutboxEvent | null> {
    const event = await this.prisma.client.outboxEvent.findUnique({ where: { id } });
    if (!event) return null;
    if (event.status === 'DELIVERED' || event.status === 'PROCESSING') {
      return event;
    }
    return this.prisma.client.outboxEvent.update({
      where: { id },
      data: {
        status: 'PENDING',
        availableAt: now,
        nextAttemptAt: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        failureCategory: null,
        lastErrorSanitized: null,
      },
    });
  }

  async stats(now: Date = new Date()): Promise<{
    pending: number;
    processing: number;
    retry: number;
    failed: number;
    deliveredLast24h: number;
    oldestPendingAgeSeconds: number | null;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
  }> {
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const [pending, processing, retry, failed, deliveredLast24h, oldestPending, lastSuccess, lastFailure] =
      await Promise.all([
        this.prisma.client.outboxEvent.count({ where: { status: 'PENDING' } }),
        this.prisma.client.outboxEvent.count({ where: { status: 'PROCESSING' } }),
        this.prisma.client.outboxEvent.count({ where: { status: 'RETRY' } }),
        this.prisma.client.outboxEvent.count({ where: { status: 'FAILED' } }),
        this.prisma.client.outboxEvent.count({
          where: { status: 'DELIVERED', deliveredAt: { gte: dayAgo } },
        }),
        this.prisma.client.outboxEvent.findFirst({
          where: { status: { in: ['PENDING', 'RETRY'] } },
          orderBy: { availableAt: 'asc' },
          select: { availableAt: true, createdAt: true },
        }),
        this.prisma.client.outboxEvent.findFirst({
          where: { status: 'DELIVERED', deliveredAt: { not: null } },
          orderBy: { deliveredAt: 'desc' },
          select: { deliveredAt: true },
        }),
        this.prisma.client.outboxEvent.findFirst({
          where: { status: 'FAILED', lastAttemptAt: { not: null } },
          orderBy: { lastAttemptAt: 'desc' },
          select: { lastAttemptAt: true },
        }),
      ]);

    let oldestPendingAgeSeconds: number | null = null;
    if (oldestPending) {
      const anchor = oldestPending.createdAt;
      oldestPendingAgeSeconds = Math.max(0, Math.floor((now.getTime() - anchor.getTime()) / 1000));
    }

    return {
      pending,
      processing,
      retry,
      failed,
      deliveredLast24h,
      oldestPendingAgeSeconds,
      lastSuccessAt: lastSuccess?.deliveredAt?.toISOString() ?? null,
      lastFailureAt: lastFailure?.lastAttemptAt?.toISOString() ?? null,
    };
  }

  async ensureRuntimeSettings(): Promise<{ paused: boolean; updatedAt: Date }> {
    const row = await this.prisma.client.integrationRuntimeSettings.upsert({
      where: { id: 1 },
      create: { id: 1, paused: false },
      update: {},
    });
    return { paused: row.paused, updatedAt: row.updatedAt };
  }

  async setPaused(paused: boolean): Promise<{ paused: boolean; updatedAt: Date }> {
    const row = await this.prisma.client.integrationRuntimeSettings.upsert({
      where: { id: 1 },
      create: { id: 1, paused },
      update: { paused },
    });
    return { paused: row.paused, updatedAt: row.updatedAt };
  }

  async isPaused(): Promise<boolean> {
    const row = await this.ensureRuntimeSettings();
    return row.paused;
  }

  async upsertHeartbeat(workerId: string, host: string | null, now: Date = new Date()): Promise<void> {
    await this.prisma.client.integrationWorkerHeartbeat.upsert({
      where: { id: workerId },
      create: {
        id: workerId,
        lastSeenAt: now,
        hostname: host,
      },
      update: {
        lastSeenAt: now,
        hostname: host,
      },
    });
  }

  async latestHeartbeat(): Promise<{
    id: string;
    lastSeenAt: Date;
    hostname: string | null;
  } | null> {
    return this.prisma.client.integrationWorkerHeartbeat.findFirst({
      orderBy: { lastSeenAt: 'desc' },
    });
  }
}

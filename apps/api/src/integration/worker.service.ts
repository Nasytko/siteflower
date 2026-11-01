import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type {
  TelegramNotifyKind,
  TelegramNotifyPayloadV1,
} from '@bouquet-one/contracts';
import type { OutboxEvent, Prisma } from '@bouquet-one/database';
import { PrismaService } from '../database/prisma.service';
import { maskPhoneE164 } from '../orders/phone.util';
import { shouldMarkFailed } from './backoff';
import { IntegrationAttemptRepository } from './attempt.repository';
import { IntegrationConfigService } from './config';
import { DeliveryClient } from './delivery.client';
import { OutboxRepository } from './outbox.repository';
import { formatTelegramNotifyText } from './telegram-format';
import { TelegramClient } from './telegram.client';

const ERP_EVENT = 'ORDER_CREATED';
const TG_EVENT = 'TELEGRAM_NOTIFY';

@Injectable()
export class IntegrationWorkerService {
  private readonly logger = new Logger(IntegrationWorkerService.name);
  private stopping = false;

  constructor(
    private readonly config: IntegrationConfigService,
    private readonly outbox: OutboxRepository,
    private readonly delivery: DeliveryClient,
    private readonly telegram: TelegramClient,
    private readonly attempts: IntegrationAttemptRepository,
    private readonly prisma: PrismaService,
  ) {}

  requestStop(): void {
    this.stopping = true;
  }

  get isStopping(): boolean {
    return this.stopping;
  }

  async tick(): Promise<{ claimed: number; delivered: number; failed: number }> {
    const now = new Date();
    await this.outbox.upsertHeartbeat(this.config.workerId, hostname(), now);

    const paused = await this.outbox.isPaused();
    if (paused) {
      return { claimed: 0, delivered: 0, failed: 0 };
    }

    await this.outbox.releaseExpiredLeases(now);

    const batch = await this.outbox.claimBatch(
      this.config.concurrency,
      this.config.workerId,
      now,
      this.config.leaseSeconds,
    );

    let delivered = 0;
    let failed = 0;
    for (const event of batch) {
      if (this.stopping) break;
      const outcome =
        event.eventType === TG_EVENT
          ? await this.processTelegram(event)
          : await this.processErp(event);
      if (outcome === 'delivered') delivered += 1;
      if (outcome === 'failed') failed += 1;
    }

    return { claimed: batch.length, delivered, failed };
  }

  private async processErp(event: OutboxEvent): Promise<'delivered' | 'retry' | 'failed'> {
    const workerId = this.config.workerId;
    const orderId = event.aggregateId;

    // Integration hard-off: acknowledge without remote call, still notify Telegram.
    if (!this.config.isDeliveryActive()) {
      await this.attempts.record({
        channel: 'ERP',
        orderId,
        outboxEventId: event.id,
        attemptNumber: event.attemptCount,
        outcome: 'SKIPPED',
        remoteReference: 'integration-disabled',
        errorCode: 'DISABLED',
        errorSanitized: 'Integration delivery disabled',
        meta: { eventType: event.eventType },
      });
      await this.prisma.client.order.update({
        where: { id: orderId },
        data: { erpSyncStatus: 'DISABLED', erpRemoteReference: null },
      });
      const applied = await this.outbox.markDelivered(event.id, workerId, 'integration-disabled');
      if (applied) {
        await this.enqueueTelegramAfterErp(orderId, 'AFTER_ERP_FAILURE', {
          erpSyncStatus: 'DISABLED',
          erpRemoteReference: null,
          erpErrorSanitized: 'Интеграция ERP отключена',
          hadPriorErpFailure: false,
        });
      }
      return applied ? 'delivered' : 'retry';
    }

    const priorFailures = await this.prisma.client.integrationDeliveryAttempt.count({
      where: { orderId, channel: 'ERP', outcome: 'FAILURE' },
    });

    const result = await this.delivery.deliver(event);
    if (result.ok) {
      await this.attempts.record({
        channel: 'ERP',
        orderId,
        outboxEventId: event.id,
        attemptNumber: event.attemptCount,
        outcome: 'SUCCESS',
        remoteReference: result.remoteReference,
        meta: { eventType: event.eventType },
      });
      await this.prisma.client.order.update({
        where: { id: orderId },
        data: {
          erpSyncStatus: 'SYNCED',
          erpRemoteReference: result.remoteReference.slice(0, 200),
        },
      });
      const applied = await this.outbox.markDelivered(event.id, workerId, result.remoteReference);
      if (!applied) {
        this.logger.warn(`Stale lease — skipped markDelivered for outbox ${event.id}`);
        return 'retry';
      }
      const kind: TelegramNotifyKind =
        priorFailures > 0 ? 'ERP_RECOVERED' : 'AFTER_ERP_SUCCESS';
      await this.enqueueTelegramAfterErp(orderId, kind, {
        erpSyncStatus: 'SYNCED',
        erpRemoteReference: result.remoteReference,
        erpErrorSanitized: null,
        hadPriorErpFailure: priorFailures > 0,
      });
      this.logger.log(`Delivered outbox ${event.id} → ${result.remoteReference}`);
      return 'delivered';
    }

    if (shouldMarkFailed(result.category, event.attemptCount, this.config.maxAttempts)) {
      await this.attempts.record({
        channel: 'ERP',
        orderId,
        outboxEventId: event.id,
        attemptNumber: event.attemptCount,
        outcome: 'FAILURE',
        errorCode: result.category,
        errorSanitized: result.message,
        meta: { eventType: event.eventType },
      });
      await this.prisma.client.order.update({
        where: { id: orderId },
        data: { erpSyncStatus: 'FAILED' },
      });
      const applied = await this.outbox.markFailed(
        event.id,
        workerId,
        result.category,
        result.message,
      );
      if (!applied) {
        this.logger.warn(`Stale lease — skipped markFailed for outbox ${event.id}`);
        return 'retry';
      }
      await this.enqueueTelegramAfterErp(orderId, 'AFTER_ERP_FAILURE', {
        erpSyncStatus: 'FAILED',
        erpRemoteReference: null,
        erpErrorSanitized: result.message,
        hadPriorErpFailure: true,
      });
      this.logger.warn(
        `Failed outbox ${event.id} [${result.category}] after ${event.attemptCount} attempts`,
      );
      return 'failed';
    }

    const next = await this.outbox.scheduleRetryFromAttempt(
      event.id,
      workerId,
      result.category,
      result.message,
      event.attemptCount,
    );
    await this.attempts.record({
      channel: 'ERP',
      orderId,
      outboxEventId: event.id,
      attemptNumber: event.attemptCount,
      outcome: 'FAILURE',
      errorCode: result.category,
      errorSanitized: result.message,
      nextAttemptAt: next
        ? (
            await this.prisma.client.outboxEvent.findUnique({
              where: { id: event.id },
              select: { nextAttemptAt: true },
            })
          )?.nextAttemptAt
        : null,
      meta: { eventType: event.eventType },
    });
    await this.prisma.client.order.update({
      where: { id: orderId },
      data: { erpSyncStatus: 'RETRYING' },
    });
    if (!next) {
      this.logger.warn(`Stale lease — skipped markRetry for outbox ${event.id}`);
      return 'retry';
    }
    this.logger.warn(`Retry outbox ${event.id} [${result.category}] attempt=${event.attemptCount}`);
    return 'retry';
  }

  private async processTelegram(
    event: OutboxEvent,
  ): Promise<'delivered' | 'retry' | 'failed'> {
    const workerId = this.config.workerId;
    const orderId = event.aggregateId;
    const payload = event.payload as unknown as TelegramNotifyPayloadV1;
    const text = formatTelegramNotifyText(payload);

    const result = await this.telegram.sendMessage(text);
    if (result.ok) {
      await this.attempts.record({
        channel: 'TELEGRAM',
        orderId,
        outboxEventId: event.id,
        attemptNumber: event.attemptCount,
        outcome: 'SUCCESS',
        remoteReference: result.messageId,
        meta: { kind: payload.kind },
      });
      await this.prisma.client.order.update({
        where: { id: orderId },
        data: { telegramNotifyStatus: 'SENT' },
      });
      const applied = await this.outbox.markDelivered(event.id, workerId, result.messageId);
      return applied ? 'delivered' : 'retry';
    }

    if (result.skipped) {
      await this.attempts.record({
        channel: 'TELEGRAM',
        orderId,
        outboxEventId: event.id,
        attemptNumber: event.attemptCount,
        outcome: 'SKIPPED',
        errorCode: result.category,
        errorSanitized: result.message,
        meta: { kind: payload.kind },
      });
      await this.prisma.client.order.update({
        where: { id: orderId },
        data: { telegramNotifyStatus: this.telegram.configured ? 'SKIPPED' : 'DISABLED' },
      });
      const applied = await this.outbox.markDelivered(
        event.id,
        workerId,
        'telegram-skipped',
      );
      return applied ? 'delivered' : 'retry';
    }

    if (shouldMarkFailed(result.category, event.attemptCount, this.config.maxAttempts)) {
      await this.attempts.record({
        channel: 'TELEGRAM',
        orderId,
        outboxEventId: event.id,
        attemptNumber: event.attemptCount,
        outcome: 'FAILURE',
        errorCode: result.category,
        errorSanitized: result.message,
        meta: { kind: payload.kind },
      });
      await this.prisma.client.order.update({
        where: { id: orderId },
        data: { telegramNotifyStatus: 'FAILED' },
      });
      const applied = await this.outbox.markFailed(
        event.id,
        workerId,
        result.category,
        result.message,
      );
      return applied ? 'failed' : 'retry';
    }

    const applied = await this.outbox.scheduleRetryFromAttempt(
      event.id,
      workerId,
      result.category,
      result.message,
      event.attemptCount,
    );
    await this.attempts.record({
      channel: 'TELEGRAM',
      orderId,
      outboxEventId: event.id,
      attemptNumber: event.attemptCount,
      outcome: 'FAILURE',
      errorCode: result.category,
      errorSanitized: result.message,
      meta: { kind: payload.kind },
    });
    await this.prisma.client.order.update({
      where: { id: orderId },
      data: { telegramNotifyStatus: 'RETRYING' },
    });
    return applied ? 'retry' : 'retry';
  }

  /**
   * Enqueue at most one pending/retry telegram for the same order+kind.
   * Successful history is preserved; new kinds (e.g. ERP_RECOVERED) create a new event.
   */
  private async enqueueTelegramAfterErp(
    orderId: string,
    kind: TelegramNotifyKind,
    erp: {
      erpSyncStatus: string;
      erpRemoteReference: string | null;
      erpErrorSanitized: string | null;
      hadPriorErpFailure: boolean;
    },
  ): Promise<void> {
    const order = await this.prisma.client.order.findUnique({
      where: { id: orderId },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!order) return;

    // Prefer cash-specific kind when first success and cash.
    let notifyKind = kind;
    if (
      kind === 'AFTER_ERP_SUCCESS' &&
      order.paymentMethod === 'CASH_ON_DELIVERY' &&
      !erp.hadPriorErpFailure
    ) {
      notifyKind = 'CASH_ON_DELIVERY';
    }

    const existing = await this.prisma.client.outboxEvent.findFirst({
      where: {
        aggregateId: orderId,
        eventType: TG_EVENT,
        status: { in: ['PENDING', 'PROCESSING', 'RETRY'] },
      },
    });
    if (existing) {
      // Avoid duplicate in-flight notifies; recovered after fail still allowed if previous delivered.
      return;
    }

    // Dedupe identical already-delivered kind (except ERP_RECOVERED which is intentional re-notify).
    if (notifyKind !== 'ERP_RECOVERED') {
      const deliveredSame = await this.prisma.client.outboxEvent.findFirst({
        where: {
          aggregateId: orderId,
          eventType: TG_EVENT,
          status: 'DELIVERED',
        },
        orderBy: { deliveredAt: 'desc' },
      });
      if (deliveredSame) {
        const prev = deliveredSame.payload as { kind?: string } | null;
        if (prev && typeof prev === 'object' && prev.kind === notifyKind) return;
      }
    }

    const eventId = randomUUID();
    const deliverySummary =
      order.fulfillmentType === 'DELIVERY'
        ? order.addressKnown
          ? order.deliveryAddress
          : 'Адрес уточняется'
        : 'Самовывоз';

    const payload: TelegramNotifyPayloadV1 = {
      eventId,
      eventType: 'TELEGRAM_NOTIFY',
      schemaVersion: 1,
      kind: notifyKind,
      occurredAt: new Date().toISOString(),
      orderId: order.id,
      orderNumber: order.orderNumber,
      snapshot: {
        fulfillmentType: order.fulfillmentType,
        fulfillmentDate: order.fulfillmentDate,
        timeWindowLabel: order.timeWindowLabel,
        purchaserName: order.purchaserName,
        purchaserPhoneMasked: maskPhoneE164(order.purchaserPhoneE164),
        deliverySummary,
        paymentMethod:
          order.paymentMethod === 'CARD_ONLINE' ? 'CARD_ONLINE' : 'CASH_ON_DELIVERY',
        paymentStatus: order.paymentStatus,
        totalMinor: order.totalMinor.toString(),
        currency: 'BYN',
        itemLines: order.items.map((i) => ({
          name: `${i.productName} (${i.variantName})`,
          quantity: i.quantity,
          lineTotalMinor: i.lineTotalMinor.toString(),
        })),
        erpSyncStatus: erp.erpSyncStatus,
        erpRemoteReference: erp.erpRemoteReference,
        erpErrorSanitized: erp.erpErrorSanitized
          ? erp.erpErrorSanitized.slice(0, 200)
          : null,
      },
    };

    await this.prisma.client.outboxEvent.create({
      data: {
        id: eventId,
        eventType: TG_EVENT,
        aggregateType: 'Order',
        aggregateId: orderId,
        schemaVersion: 1,
        payload: payload as unknown as Prisma.InputJsonValue,
        status: 'PENDING',
        availableAt: new Date(),
      },
    });

    if (order.telegramNotifyStatus === 'PENDING' || order.telegramNotifyStatus === 'FAILED') {
      await this.prisma.client.order.update({
        where: { id: orderId },
        data: { telegramNotifyStatus: 'PENDING' },
      });
    }
  }

  async runLoop(options?: { idleSleepMs?: number; busySleepMs?: number }): Promise<void> {
    const idleSleepMs = options?.idleSleepMs ?? 2000;
    const busySleepMs = options?.busySleepMs ?? 200;
    this.logger.log(
      `Integration worker starting id=${this.config.workerId} mode=${this.config.mode} enabled=${this.config.enabled} telegram=${this.telegram.enabled}`,
    );

    while (!this.stopping) {
      try {
        const result = await this.tick();
        const sleep = result.claimed > 0 ? busySleepMs : idleSleepMs;
        await this.sleep(sleep);
      } catch (err) {
        this.logger.error(
          `Worker tick error: ${err instanceof Error ? err.message : String(err)}`,
        );
        await this.sleep(idleSleepMs);
      }
    }

    this.logger.log('Integration worker stopped gracefully');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export { ERP_EVENT, TG_EVENT };

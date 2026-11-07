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
import { computeNextAttemptAt, shouldMarkFailed } from './backoff';
import { IntegrationAttemptRepository } from './attempt.repository';
import { IntegrationConfigService } from './config';
import { DeliveryClient } from './delivery.client';
import {
  markDeliveredOwned,
  markFailedOwned,
  markRetryOwned,
} from './erp-finalize';
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

    // SF-03: event may have waited behind siblings in the batch — renew or bail before I/O.
    if (!(await this.outbox.renewLease(event.id, workerId, this.config.leaseSeconds))) {
      this.logger.warn(`Lost lease before ERP work for outbox ${event.id}`);
      return 'retry';
    }

    // Integration hard-off: acknowledge without remote call, still notify Telegram.
    if (!this.config.isDeliveryActive()) {
      const applied = await this.finalizeErpAndTelegram({
        eventId: event.id,
        workerId,
        orderId,
        terminal: 'delivered',
        remoteReference: 'integration-disabled',
        orderPatch: { erpSyncStatus: 'DISABLED', erpRemoteReference: null },
        telegramKind: 'AFTER_ERP_FAILURE',
        telegramErp: {
          erpSyncStatus: 'DISABLED',
          erpRemoteReference: null,
          erpErrorSanitized: 'Интеграция ERP отключена',
          hadPriorErpFailure: false,
        },
      });
      if (applied) {
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
      }
      return applied ? 'delivered' : 'retry';
    }

    const priorFailures = await this.prisma.client.integrationDeliveryAttempt.count({
      where: { orderId, channel: 'ERP', outcome: 'FAILURE' },
    });

    // HTTP outside DB transaction.
    const result = await this.delivery.deliver(event);

    if (!(await this.outbox.renewLease(event.id, workerId, this.config.leaseSeconds))) {
      this.logger.warn(`Lost lease after ERP HTTP for outbox ${event.id}`);
      return 'retry';
    }

    if (result.ok) {
      const kind: TelegramNotifyKind =
        priorFailures > 0 ? 'ERP_RECOVERED' : 'AFTER_ERP_SUCCESS';
      const applied = await this.finalizeErpAndTelegram({
        eventId: event.id,
        workerId,
        orderId,
        terminal: 'delivered',
        remoteReference: result.remoteReference,
        orderPatch: {
          erpSyncStatus: 'SYNCED',
          erpRemoteReference: result.remoteReference.slice(0, 200),
        },
        telegramKind: kind,
        telegramErp: {
          erpSyncStatus: 'SYNCED',
          erpRemoteReference: result.remoteReference,
          erpErrorSanitized: null,
          hadPriorErpFailure: priorFailures > 0,
        },
      });
      if (!applied) {
        this.logger.warn(`Stale lease — skipped ERP finalize for outbox ${event.id}`);
        return 'retry';
      }
      await this.attempts.record({
        channel: 'ERP',
        orderId,
        outboxEventId: event.id,
        attemptNumber: event.attemptCount,
        outcome: 'SUCCESS',
        remoteReference: result.remoteReference,
        meta: { eventType: event.eventType },
      });
      this.logger.log(`Delivered outbox ${event.id} → ${result.remoteReference}`);
      return 'delivered';
    }

    if (shouldMarkFailed(result.category, event.attemptCount, this.config.maxAttempts)) {
      const applied = await this.finalizeErpAndTelegram({
        eventId: event.id,
        workerId,
        orderId,
        terminal: 'failed',
        failureCategory: result.category,
        failureMessage: result.message,
        orderPatch: { erpSyncStatus: 'FAILED' },
        telegramKind: 'AFTER_ERP_FAILURE',
        telegramErp: {
          erpSyncStatus: 'FAILED',
          erpRemoteReference: null,
          erpErrorSanitized: result.message,
          hadPriorErpFailure: true,
        },
      });
      if (!applied) {
        this.logger.warn(`Stale lease — skipped markFailed for outbox ${event.id}`);
        return 'retry';
      }
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
      this.logger.warn(
        `Failed outbox ${event.id} [${result.category}] after ${event.attemptCount} attempts`,
      );
      return 'failed';
    }

    const nextAttemptAt = computeNextAttemptAt(event.attemptCount);
    const applied = await this.prisma.client.$transaction(async (tx) => {
      const marked = await markRetryOwned(
        tx,
        event.id,
        workerId,
        result.category,
        result.message,
        nextAttemptAt,
      );
      if (!marked) return false;
      await tx.order.update({
        where: { id: orderId },
        data: { erpSyncStatus: 'RETRYING' },
      });
      return true;
    });
    await this.attempts.record({
      channel: 'ERP',
      orderId,
      outboxEventId: event.id,
      attemptNumber: event.attemptCount,
      outcome: 'FAILURE',
      errorCode: result.category,
      errorSanitized: result.message,
      nextAttemptAt: applied ? nextAttemptAt : null,
      meta: { eventType: event.eventType },
    });
    if (!applied) {
      this.logger.warn(`Stale lease — skipped markRetry for outbox ${event.id}`);
      return 'retry';
    }
    this.logger.warn(`Retry outbox ${event.id} [${result.category}] attempt=${event.attemptCount}`);
    return 'retry';
  }

  /**
   * SF-02: lease-gated ERP terminal + order mirror + Telegram enqueue in one TX.
   * Returns false when lease was stolen (no order/outbox mutation).
   */
  private async finalizeErpAndTelegram(input: {
    eventId: string;
    workerId: string;
    orderId: string;
    terminal: 'delivered' | 'failed';
    remoteReference?: string;
    failureCategory?: Parameters<typeof markFailedOwned>[3];
    failureMessage?: string;
    orderPatch: { erpSyncStatus: string; erpRemoteReference?: string | null };
    telegramKind: TelegramNotifyKind;
    telegramErp: {
      erpSyncStatus: string;
      erpRemoteReference: string | null;
      erpErrorSanitized: string | null;
      hadPriorErpFailure: boolean;
    };
  }): Promise<boolean> {
    return this.prisma.client.$transaction(async (tx) => {
      const marked =
        input.terminal === 'delivered'
          ? await markDeliveredOwned(
              tx,
              input.eventId,
              input.workerId,
              input.remoteReference ?? 'ok',
            )
          : await markFailedOwned(
              tx,
              input.eventId,
              input.workerId,
              input.failureCategory!,
              input.failureMessage ?? 'failed',
            );
      if (!marked) return false;

      await tx.order.update({
        where: { id: input.orderId },
        data: {
          erpSyncStatus: input.orderPatch.erpSyncStatus as 'SYNCED' | 'FAILED' | 'DISABLED',
          ...(input.orderPatch.erpRemoteReference !== undefined
            ? { erpRemoteReference: input.orderPatch.erpRemoteReference }
            : {}),
        },
      });

      await this.enqueueTelegramAfterErpTx(tx, input.orderId, input.telegramKind, input.telegramErp);
      return true;
    });
  }

  private async processTelegram(
    event: OutboxEvent,
  ): Promise<'delivered' | 'retry' | 'failed'> {
    const workerId = this.config.workerId;
    const orderId = event.aggregateId;
    const payload = event.payload as unknown as TelegramNotifyPayloadV1;
    const text = formatTelegramNotifyText(payload);

    if (!(await this.outbox.renewLease(event.id, workerId, this.config.leaseSeconds))) {
      this.logger.warn(`Lost lease before Telegram work for outbox ${event.id}`);
      return 'retry';
    }

    // Ambiguous outcome: if HTTP succeeds and process dies before markDelivered,
    // manual retry / reclaim may send a duplicate Telegram message (at-least-once).
    const result = await this.telegram.sendMessage(text);

    if (!(await this.outbox.renewLease(event.id, workerId, this.config.leaseSeconds))) {
      this.logger.warn(`Lost lease after Telegram HTTP for outbox ${event.id}`);
      return 'retry';
    }

    if (result.ok) {
      const applied = await this.prisma.client.$transaction(async (tx) => {
        const marked = await markDeliveredOwned(tx, event.id, workerId, result.messageId);
        if (!marked) return false;
        await tx.order.update({
          where: { id: orderId },
          data: { telegramNotifyStatus: 'SENT' },
        });
        return true;
      });
      if (applied) {
        await this.attempts.record({
          channel: 'TELEGRAM',
          orderId,
          outboxEventId: event.id,
          attemptNumber: event.attemptCount,
          outcome: 'SUCCESS',
          remoteReference: result.messageId,
          meta: { kind: payload.kind },
        });
      }
      return applied ? 'delivered' : 'retry';
    }

    if (result.skipped) {
      const applied = await this.prisma.client.$transaction(async (tx) => {
        const marked = await markDeliveredOwned(tx, event.id, workerId, 'telegram-skipped');
        if (!marked) return false;
        await tx.order.update({
          where: { id: orderId },
          data: {
            telegramNotifyStatus: this.telegram.configured ? 'SKIPPED' : 'DISABLED',
          },
        });
        return true;
      });
      if (applied) {
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
      }
      return applied ? 'delivered' : 'retry';
    }

    if (shouldMarkFailed(result.category, event.attemptCount, this.config.maxAttempts)) {
      const applied = await this.prisma.client.$transaction(async (tx) => {
        const marked = await markFailedOwned(
          tx,
          event.id,
          workerId,
          result.category,
          result.message,
        );
        if (!marked) return false;
        await tx.order.update({
          where: { id: orderId },
          data: { telegramNotifyStatus: 'FAILED' },
        });
        return true;
      });
      if (applied) {
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
      }
      return applied ? 'failed' : 'retry';
    }

    const nextAttemptAt = computeNextAttemptAt(event.attemptCount);
    const applied = await this.prisma.client.$transaction(async (tx) => {
      const marked = await markRetryOwned(
        tx,
        event.id,
        workerId,
        result.category,
        result.message,
        nextAttemptAt,
      );
      if (!marked) return false;
      await tx.order.update({
        where: { id: orderId },
        data: { telegramNotifyStatus: 'RETRYING' },
      });
      return true;
    });
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
    return applied ? 'retry' : 'retry';
  }

  /**
   * Enqueue at most one pending/retry telegram for the same order+kind.
   * Successful history is preserved; new kinds (e.g. ERP_RECOVERED) create a new event.
   * Must run in the same TX as ERP terminalization (SF-02).
   */
  private async enqueueTelegramAfterErpTx(
    tx: Prisma.TransactionClient,
    orderId: string,
    kind: TelegramNotifyKind,
    erp: {
      erpSyncStatus: string;
      erpRemoteReference: string | null;
      erpErrorSanitized: string | null;
      hadPriorErpFailure: boolean;
    },
  ): Promise<void> {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!order) return;

    let notifyKind = kind;
    if (
      kind === 'AFTER_ERP_SUCCESS' &&
      order.paymentMethod === 'CASH_ON_DELIVERY' &&
      !erp.hadPriorErpFailure
    ) {
      notifyKind = 'CASH_ON_DELIVERY';
    }

    const existing = await tx.outboxEvent.findFirst({
      where: {
        aggregateId: orderId,
        eventType: TG_EVENT,
        status: { in: ['PENDING', 'PROCESSING', 'RETRY'] },
      },
    });
    if (existing) return;

    if (notifyKind !== 'ERP_RECOVERED') {
      const deliveredSame = await tx.outboxEvent.findFirst({
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

    await tx.outboxEvent.create({
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
      await tx.order.update({
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

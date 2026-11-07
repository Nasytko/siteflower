/**
 * Historical recovery: ERP DELIVERED orders that never got a Telegram outbox row.
 * Dedupes against any PENDING/PROCESSING/RETRY/DELIVERED TELEGRAM_NOTIFY for the order.
 */
import { randomUUID } from 'node:crypto';
import type { TelegramNotifyKind, TelegramNotifyPayloadV1 } from '@bouquet-one/contracts';
import type { PrismaClient } from '@bouquet-one/database';
import { maskPhoneE164 } from '../orders/phone.util';

const ERP_EVENT = 'ORDER_CREATED';
const TG_EVENT = 'TELEGRAM_NOTIFY';

export type TelegramRecoveryReport = {
  dryRun: boolean;
  scanned: number;
  created: number;
  skipped: number;
  items: Array<{ orderId: string; orderNumber: string; action: 'created' | 'skipped'; reason: string }>;
};

export async function recoverMissingTelegramEvents(
  prisma: PrismaClient,
  options: { dryRun: boolean; orderId?: string; limit: number },
): Promise<TelegramRecoveryReport> {
  const deliveredErp = await prisma.outboxEvent.findMany({
    where: {
      eventType: ERP_EVENT,
      status: 'DELIVERED',
      ...(options.orderId ? { aggregateId: options.orderId } : {}),
    },
    orderBy: { deliveredAt: 'asc' },
    take: options.limit,
    select: { aggregateId: true },
  });

  const report: TelegramRecoveryReport = {
    dryRun: options.dryRun,
    scanned: deliveredErp.length,
    created: 0,
    skipped: 0,
    items: [],
  };

  const seenOrders = new Set<string>();
  for (const row of deliveredErp) {
    const orderId = row.aggregateId;
    if (seenOrders.has(orderId)) continue;
    seenOrders.add(orderId);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!order) {
      report.skipped += 1;
      report.items.push({
        orderId,
        orderNumber: '?',
        action: 'skipped',
        reason: 'order-missing',
      });
      continue;
    }

    const existingTg = await prisma.outboxEvent.findFirst({
      where: {
        aggregateId: orderId,
        eventType: TG_EVENT,
        status: { in: ['PENDING', 'PROCESSING', 'RETRY', 'DELIVERED'] },
      },
    });
    if (existingTg) {
      report.skipped += 1;
      report.items.push({
        orderId,
        orderNumber: order.orderNumber,
        action: 'skipped',
        reason: `telegram-exists:${existingTg.status}`,
      });
      continue;
    }

    const kind: TelegramNotifyKind =
      order.erpSyncStatus === 'SYNCED' || order.erpSyncStatus === 'DISABLED'
        ? order.erpSyncStatus === 'SYNCED' && order.paymentMethod === 'CASH_ON_DELIVERY'
          ? 'CASH_ON_DELIVERY'
          : order.erpSyncStatus === 'SYNCED'
            ? 'AFTER_ERP_SUCCESS'
            : 'AFTER_ERP_FAILURE'
        : 'AFTER_ERP_FAILURE';

    if (options.dryRun) {
      report.created += 1;
      report.items.push({
        orderId,
        orderNumber: order.orderNumber,
        action: 'created',
        reason: `dry-run:${kind}`,
      });
      continue;
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
      kind,
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
        erpSyncStatus: order.erpSyncStatus,
        erpRemoteReference: order.erpRemoteReference,
        erpErrorSanitized: null,
      },
    };

    await prisma.outboxEvent.create({
      data: {
        id: eventId,
        eventType: TG_EVENT,
        aggregateType: 'Order',
        aggregateId: orderId,
        schemaVersion: 1,
        payload: payload as object,
        status: 'PENDING',
        availableAt: new Date(),
      },
    });

    report.created += 1;
    report.items.push({
      orderId,
      orderNumber: order.orderNumber,
      action: 'created',
      reason: kind,
    });
  }

  return report;
}

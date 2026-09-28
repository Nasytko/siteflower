import type { StorefrontOrderCreatedV1 } from '@bouquet-one/contracts';

export type StorefrontOrderCreatedSource = {
  id: string;
  orderNumber: string;
  createdAt: Date;
  status: string;
  fulfillmentType: 'DELIVERY' | 'PICKUP';
  fulfillmentDate: string;
  timeWindowId: string;
  timeWindowLabel: string;
  timeWindowStartMinutes: number;
  timeWindowEndMinutes: number;
  purchaserName: string;
  purchaserPhoneE164: string;
  recipientName: string | null;
  recipientPhoneE164: string | null;
  surprise: boolean;
  addressKnown: boolean;
  deliveryAddress: string | null;
  addressDetails: string | null;
  cardMessage: string | null;
  anonymousCard: boolean;
  customerComment: string | null;
  currency: string;
  subtotalMinor: bigint | string | number;
  deliveryFeeMinor: bigint | string | number;
  totalMinor: bigint | string | number;
};

export type StorefrontOrderCreatedItemSource = {
  productId: string | null;
  variantId: string | null;
  productName: string;
  productSlug: string;
  variantName: string;
  quantity: number;
  unitPriceMinor: bigint | string | number;
  originalUnitPriceMinor: bigint | string | number | null;
  promotionType: string | null;
  lineTotalMinor: bigint | string | number;
  currency: string;
};

function minorToString(value: bigint | string | number): string {
  return typeof value === 'bigint' ? value.toString() : String(value);
}

/**
 * Build immutable StorefrontOrderCreatedV1 for outbox enqueue.
 * No tracking token, no password hashes — money as decimal string minor units.
 */
export function buildStorefrontOrderCreatedV1(input: {
  eventId: string;
  order: StorefrontOrderCreatedSource;
  items: StorefrontOrderCreatedItemSource[];
  occurredAt?: Date;
}): StorefrontOrderCreatedV1 {
  const { order, items, eventId } = input;
  const occurredAt = (input.occurredAt ?? order.createdAt).toISOString();

  return {
    eventId,
    eventType: 'ORDER_CREATED',
    schemaVersion: 1,
    occurredAt,
    source: 'STOREFRONT',
    order: {
      externalOrderId: order.id,
      orderNumber: order.orderNumber,
      createdAt: order.createdAt.toISOString(),
      websiteStatus: order.status,
      fulfillmentType: order.fulfillmentType,
      fulfillmentDate: order.fulfillmentDate,
      timeWindow: {
        id: order.timeWindowId,
        label: order.timeWindowLabel,
        startMinutes: order.timeWindowStartMinutes,
        endMinutes: order.timeWindowEndMinutes,
      },
      timezone: 'Europe/Minsk',
      purchaser: {
        name: order.purchaserName,
        phoneE164: order.purchaserPhoneE164,
      },
      recipient: {
        name: order.recipientName,
        phoneE164: order.recipientPhoneE164,
        surprise: order.surprise,
      },
      delivery: {
        addressKnown: order.addressKnown,
        address: order.deliveryAddress,
        addressDetails: order.addressDetails,
      },
      card: {
        message: order.cardMessage,
        anonymous: order.anonymousCard,
      },
      customerComment: order.customerComment,
      items: items.map((item) => ({
        productId: item.productId ?? '',
        variantId: item.variantId ?? '',
        productName: item.productName,
        productSlug: item.productSlug,
        variantName: item.variantName,
        quantity: item.quantity,
        unitPriceMinor: minorToString(item.unitPriceMinor),
        originalUnitPriceMinor:
          item.originalUnitPriceMinor === null || item.originalUnitPriceMinor === undefined
            ? null
            : minorToString(item.originalUnitPriceMinor),
        promotionType: item.promotionType,
        lineTotalMinor: minorToString(item.lineTotalMinor),
        currency: item.currency,
      })),
      money: {
        currency: 'BYN',
        subtotalMinor: minorToString(order.subtotalMinor),
        deliveryFeeMinor: minorToString(order.deliveryFeeMinor),
        totalMinor: minorToString(order.totalMinor),
      },
    },
  };
}

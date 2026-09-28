/**
 * Checkout & Orders contracts (Phase 4).
 * Prices are always server-authoritative minor-unit strings.
 */

import type { CommercialAvailability } from './catalog';

export const FULFILLMENT_TYPES = ['DELIVERY', 'PICKUP'] as const;
export type FulfillmentType = (typeof FULFILLMENT_TYPES)[number];

export const ORDER_STATUSES = [
  'RECEIVED',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'DELIVERING',
  'COMPLETED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_EVENT_TYPES = [
  'ORDER_CREATED',
  'ORDER_CONFIRMED',
  'ORDER_PREPARING',
  'ORDER_READY',
  'ORDER_OUT_FOR_DELIVERY',
  'ORDER_COMPLETED',
  'ORDER_CANCELLED',
] as const;
export type OrderEventType = (typeof ORDER_EVENT_TYPES)[number];

export const TIME_WINDOW_APPLIES_TO = ['DELIVERY', 'PICKUP', 'BOTH'] as const;
export type TimeWindowAppliesTo = (typeof TIME_WINDOW_APPLIES_TO)[number];

export type TimeWindowDto = {
  id: string;
  label: string;
  /** Minutes from midnight Europe/Minsk (inclusive start). */
  startMinutes: number;
  /** Minutes from midnight Europe/Minsk (exclusive end). */
  endMinutes: number;
  active: boolean;
  sortOrder: number;
  appliesTo: TimeWindowAppliesTo;
};

export type FulfillmentSettingsPublicDto = {
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  deliveryFeeMinor: string;
  currency: 'BYN';
  minLeadTimeMinutes: number;
  maxAdvanceDays: number;
  timeWindows: TimeWindowDto[];
  pickupInstructions: string | null;
  /** Business timezone for fulfillment dates (IANA). */
  businessTimezone: string;
  /** Today's calendar date in business timezone (YYYY-MM-DD). */
  todayBusinessDate: string;
};

export type FulfillmentSettingsAdminDto = FulfillmentSettingsPublicDto & {
  version: number;
  updatedAt: string;
};

export type UpdateFulfillmentSettingsDto = {
  expectedVersion: number;
  deliveryEnabled?: boolean;
  pickupEnabled?: boolean;
  deliveryFeeMinor?: string;
  minLeadTimeMinutes?: number;
  maxAdvanceDays?: number;
  timeWindows?: TimeWindowDto[];
  pickupInstructions?: string | null;
};

/** Client cart line — no prices. */
export type CheckoutCartLineInput = {
  productId: string;
  variantId: string;
  quantity: number;
};

export type CheckoutValidateIssueCode =
  | 'PRODUCT_UNAVAILABLE'
  | 'VARIANT_UNAVAILABLE'
  | 'QUANTITY_INVALID'
  | 'PRICE_CHANGED'
  | 'NOT_FOUND';

export type CheckoutValidateIssueDto = {
  code: CheckoutValidateIssueCode;
  productId: string;
  variantId: string;
  message: string;
  /** Previous display minor if PRICE_CHANGED (optional UX hint from client). */
  previousUnitPriceMinor?: string;
  currentUnitPriceMinor?: string;
};

export type CheckoutValidatedLineDto = {
  productId: string;
  variantId: string;
  quantity: number;
  productName: string;
  productSlug: string;
  variantName: string;
  primaryImageUrl: string | null;
  availability: CommercialAvailability;
  unitPriceMinor: string;
  lineTotalMinor: string;
  currency: 'BYN';
};

export type CheckoutValidateRequest = {
  items: CheckoutCartLineInput[];
  /** Optional prior display prices for PRICE_CHANGED messaging. */
  priorUnitPrices?: Array<{ variantId: string; unitPriceMinor: string }>;
};

export type CheckoutValidateResponse = {
  ok: boolean;
  currency: 'BYN';
  items: CheckoutValidatedLineDto[];
  issues: CheckoutValidateIssueDto[];
  subtotalMinor: string;
  deliveryFeeMinor: string;
  totalMinor: string;
};

export type CreateOrderRequest = {
  idempotencyKey: string;
  items: CheckoutCartLineInput[];
  fulfillmentType: FulfillmentType;
  purchaserName: string;
  purchaserPhone: string;
  recipientName?: string | null;
  recipientPhone?: string | null;
  surprise?: boolean;
  addressKnown?: boolean;
  deliveryAddress?: string | null;
  addressDetails?: string | null;
  fulfillmentDate: string;
  timeWindowId: string;
  cardMessage?: string | null;
  anonymousCard?: boolean;
  customerComment?: string | null;
};

export type OrderItemPublicDto = {
  id: string;
  productName: string;
  productSlug: string;
  variantName: string;
  primaryImageUrl: string | null;
  quantity: number;
  unitPriceMinor: string;
  lineTotalMinor: string;
  currency: 'BYN';
};

export type OrderCreatedResponse = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  /**
   * Raw tracking token — returned only on the first successful create.
   * Idempotent replays set this to null (token is never stored).
   */
  trackingToken: string | null;
  trackingPath: string | null;
  /** True when this response is an idempotent replay of a prior create. */
  replayed: boolean;
  totalMinor: string;
  currency: 'BYN';
  fulfillmentType: FulfillmentType;
  fulfillmentDate: string;
  timeWindowLabel: string;
};

export type OrderTrackingDto = {
  orderNumber: string;
  status: OrderStatus;
  /** Customer-facing status label in Russian. */
  statusLabel: string;
  fulfillmentType: FulfillmentType;
  fulfillmentDate: string;
  timeWindowLabel: string;
  items: OrderItemPublicDto[];
  subtotalMinor: string;
  deliveryFeeMinor: string;
  totalMinor: string;
  currency: 'BYN';
  /** Privacy-aware summaries (phones masked). */
  recipientSummary: string | null;
  deliverySummary: string | null;
  pickupSummary: string | null;
  hasCardMessage: boolean;
  anonymousCard: boolean;
  createdAt: string;
};

export type OrderEventDto = {
  id: string;
  type: OrderEventType;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  message: string | null;
  createdAt: string;
};

export type OrderAdminListItemDto = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  fulfillmentDate: string;
  timeWindowLabel: string;
  timeWindowStartMinutes: number;
  purchaserName: string;
  purchaserPhoneE164: string;
  recipientName: string | null;
  totalMinor: string;
  currency: 'BYN';
  createdAt: string;
};

export type OrderAdminDetailDto = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  purchaserName: string;
  purchaserPhoneE164: string;
  recipientName: string | null;
  recipientPhoneE164: string | null;
  surprise: boolean;
  addressKnown: boolean;
  deliveryAddress: string | null;
  addressDetails: string | null;
  fulfillmentDate: string;
  timeWindowId: string;
  timeWindowLabel: string;
  timeWindowStartMinutes: number;
  timeWindowEndMinutes: number;
  cardMessage: string | null;
  anonymousCard: boolean;
  customerComment: string | null;
  currency: 'BYN';
  subtotalMinor: string;
  deliveryFeeMinor: string;
  totalMinor: string;
  cancellationReason: string | null;
  cancelledAt: string | null;
  confirmedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItemPublicDto[];
  events: OrderEventDto[];
  /** Valid next statuses for UI (server remains authoritative). */
  allowedTransitions: OrderStatus[];
};

export type AdminOrderListQuery = {
  status?: OrderStatus;
  fulfillmentType?: FulfillmentType;
  /** YYYY-MM-DD or presets handled by API: today | tomorrow | all */
  date?: string;
  q?: string;
  page?: number;
  pageSize?: number;
};

export type TransitionOrderRequest = {
  toStatus: OrderStatus;
};

export type CancelOrderRequest = {
  reason: string;
};

/** Default time windows used by seed / fresh DB. */
export function defaultTimeWindows(): TimeWindowDto[] {
  return [
    {
      id: 'tw-10-12',
      label: '10:00–12:00',
      startMinutes: 600,
      endMinutes: 720,
      active: true,
      sortOrder: 10,
      appliesTo: 'BOTH',
    },
    {
      id: 'tw-12-14',
      label: '12:00–14:00',
      startMinutes: 720,
      endMinutes: 840,
      active: true,
      sortOrder: 20,
      appliesTo: 'BOTH',
    },
    {
      id: 'tw-14-16',
      label: '14:00–16:00',
      startMinutes: 840,
      endMinutes: 960,
      active: true,
      sortOrder: 30,
      appliesTo: 'BOTH',
    },
    {
      id: 'tw-16-18',
      label: '16:00–18:00',
      startMinutes: 960,
      endMinutes: 1080,
      active: true,
      sortOrder: 40,
      appliesTo: 'BOTH',
    },
    {
      id: 'tw-18-20',
      label: '18:00–20:00',
      startMinutes: 1080,
      endMinutes: 1200,
      active: true,
      sortOrder: 50,
      appliesTo: 'BOTH',
    },
  ];
}

/** Customer-facing Russian labels for order status. */
export function orderStatusLabel(status: OrderStatus): string {
  switch (status) {
    case 'RECEIVED':
      return 'Заказ получен';
    case 'CONFIRMED':
      return 'Заказ подтверждён';
    case 'PREPARING':
      return 'Собираем букет';
    case 'READY':
      return 'Готов';
    case 'DELIVERING':
      return 'В доставке';
    case 'COMPLETED':
      return 'Выполнен';
    case 'CANCELLED':
      return 'Отменён';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/**
 * Allowed status transitions.
 * CANCELLED is reachable from any non-terminal except COMPLETED.
 */
export function allowedOrderTransitions(
  status: OrderStatus,
  fulfillmentType: FulfillmentType,
): OrderStatus[] {
  if (status === 'COMPLETED' || status === 'CANCELLED') return [];

  const next: OrderStatus[] = [];
  switch (status) {
    case 'RECEIVED':
      next.push('CONFIRMED');
      break;
    case 'CONFIRMED':
      next.push('PREPARING');
      break;
    case 'PREPARING':
      next.push('READY');
      break;
    case 'READY':
      if (fulfillmentType === 'DELIVERY') next.push('DELIVERING');
      else next.push('COMPLETED');
      break;
    case 'DELIVERING':
      next.push('COMPLETED');
      break;
    default:
      break;
  }
  next.push('CANCELLED');
  return next;
}

export function isOrderTransitionAllowed(
  from: OrderStatus,
  to: OrderStatus,
  fulfillmentType: FulfillmentType,
): boolean {
  return allowedOrderTransitions(from, fulfillmentType).includes(to);
}

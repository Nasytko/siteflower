/**
 * SiteFlower → NewERP integration contracts (outbound).
 * At-least-once delivery; receivers MUST be idempotent on eventId.
 */

export const INTEGRATION_EVENT_TYPES = ['ORDER_CREATED', 'TELEGRAM_NOTIFY'] as const;
export type IntegrationEventType = (typeof INTEGRATION_EVENT_TYPES)[number];

export const TELEGRAM_NOTIFY_KINDS = [
  'AFTER_ERP_SUCCESS',
  'AFTER_ERP_FAILURE',
  'ERP_RECOVERED',
  'PAYMENT_PAID',
  'PAYMENT_FAILED',
  'CASH_ON_DELIVERY',
] as const;
export type TelegramNotifyKind = (typeof TELEGRAM_NOTIFY_KINDS)[number];

export const INTEGRATION_MODES = ['DISABLED', 'SIMULATOR', 'ERP'] as const;
export type IntegrationMode = (typeof INTEGRATION_MODES)[number];

export const OUTBOX_DELIVERY_STATUSES = [
  'PENDING',
  'PROCESSING',
  'RETRY',
  'DELIVERED',
  'FAILED',
] as const;
export type OutboxDeliveryStatus = (typeof OUTBOX_DELIVERY_STATUSES)[number];

export const INTEGRATION_FAILURE_CATEGORIES = [
  'NETWORK_ERROR',
  'TIMEOUT',
  'AUTH_FAILED',
  'REMOTE_4XX',
  'REMOTE_5XX',
  'INVALID_RESPONSE',
  'CONFIGURATION_ERROR',
  'RATE_LIMITED',
] as const;
export type IntegrationFailureCategory = (typeof INTEGRATION_FAILURE_CATEGORIES)[number];

/** HMAC protocol version sent in X-Bouquet-Integration-Version */
export const INTEGRATION_HMAC_VERSION = '1' as const;

export const INTEGRATION_HEADERS = {
  key: 'X-Bouquet-Integration-Key',
  timestamp: 'X-Bouquet-Integration-Timestamp',
  nonce: 'X-Bouquet-Integration-Nonce',
  signature: 'X-Bouquet-Integration-Signature',
  version: 'X-Bouquet-Integration-Version',
} as const;

/** Clock skew window receivers should enforce (seconds). */
export const INTEGRATION_TIMESTAMP_SKEW_SECONDS = 300;

export type StorefrontOrderCreatedItemV1 = {
  productId: string;
  variantId: string;
  productName: string;
  productSlug: string;
  /** ERP article at order time; null when unset / legacy payloads. */
  productErpSku?: string | null;
  variantName: string;
  quantity: number;
  /** Variant unit after promo, excluding options (do not recompute line as unit×qty alone when options present). */
  unitPriceMinor: string;
  originalUnitPriceMinor: string | null;
  promotionType: string | null;
  /** Pre-option variant unit; null on legacy. */
  baseUnitPriceMinor?: string | null;
  /** Line option surcharges; 0 when none. lineTotal = unit×qty + optionsTotal. */
  optionsTotalMinor?: string;
  /** Selected options with optional erpSku; omit/empty on legacy. */
  optionsSnapshot?: Array<{
    groupId: string;
    groupName: string;
    valueId: string;
    valueName: string;
    surchargeMinor: string;
    chargeMode: 'PER_LINE' | 'PER_UNIT';
    erpSku?: string | null;
  }>;
  /** Authoritative charged line total. */
  lineTotalMinor: string;
  currency: string;
};

export type StorefrontOrderCreatedV1 = {
  eventId: string;
  eventType: 'ORDER_CREATED';
  schemaVersion: 1;
  occurredAt: string;
  source: 'STOREFRONT';
  order: {
    externalOrderId: string;
    orderNumber: string;
    createdAt: string;
    websiteStatus: string;
    fulfillmentType: 'DELIVERY' | 'PICKUP';
    fulfillmentDate: string;
    timeWindow: {
      id: string;
      label: string;
      startMinutes: number;
      endMinutes: number;
    };
    timezone: 'Europe/Minsk';
    purchaser: {
      name: string;
      phoneE164: string;
    };
    recipient: {
      name: string | null;
      phoneE164: string | null;
      surprise: boolean;
    };
    delivery: {
      addressKnown: boolean;
      address: string | null;
      addressDetails: string | null;
    };
    card: {
      message: string | null;
      anonymous: boolean;
    };
    customerComment: string | null;
    /** Additive payment snapshot (safe defaults for legacy payloads without these fields). */
    payment: {
      method: 'CASH_ON_DELIVERY' | 'CARD_ONLINE';
      status: 'NOT_REQUIRED' | 'AWAITING_PAYMENT' | 'PAID' | 'FAILED' | 'CANCELLED';
      provider: string | null;
      externalId: string | null;
      paidAt: string | null;
    };
    items: StorefrontOrderCreatedItemV1[];
    money: {
      currency: 'BYN';
      subtotalMinor: string;
      deliveryFeeMinor: string;
      totalMinor: string;
    };
  };
};

/** Outbox payload for Telegram Bot API delivery (no bot token in payload). */
export type TelegramNotifyPayloadV1 = {
  eventId: string;
  eventType: 'TELEGRAM_NOTIFY';
  schemaVersion: 1;
  kind: TelegramNotifyKind;
  occurredAt: string;
  orderId: string;
  orderNumber: string;
  /** Preformatted MarkdownV2-safe text is built at send time from this snapshot. */
  snapshot: {
    fulfillmentType: 'DELIVERY' | 'PICKUP';
    fulfillmentDate: string;
    timeWindowLabel: string;
    purchaserName: string;
    purchaserPhoneMasked: string;
    deliverySummary: string | null;
    paymentMethod: 'CASH_ON_DELIVERY' | 'CARD_ONLINE';
    paymentStatus: string;
    totalMinor: string;
    currency: 'BYN';
    itemLines: Array<{ name: string; quantity: number; lineTotalMinor: string }>;
    erpSyncStatus: string;
    erpRemoteReference: string | null;
    erpErrorSanitized: string | null;
  };
};

export type IntegrationAcceptResponseV1 = {
  status: 'ACCEPTED';
  eventId: string;
  externalOrderId: string;
  remoteReference: string;
  receivedAt: string;
};

export type IntegrationHealthPingResponseV1 = {
  status: 'OK';
  service: string;
  timestamp: string;
  latencyHintMs?: number;
};

export type OutboxEventAdminListItem = {
  id: string;
  eventType: string;
  schemaVersion: number;
  aggregateId: string;
  orderNumber: string | null;
  status: OutboxDeliveryStatus;
  attemptCount: number;
  createdAt: string;
  availableAt: string;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  failureCategory: string | null;
  lastErrorSanitized: string | null;
  remoteReference: string | null;
};

export type OutboxEventAdminDetail = OutboxEventAdminListItem & {
  /** Masked operational payload for SUPER_ADMIN troubleshooting */
  payloadPreview: Record<string, unknown> | null;
};

export type IntegrationStatusDto = {
  mode: IntegrationMode;
  enabled: boolean;
  configurationReady: boolean;
  configurationIssues: string[];
  endpointConfigured: boolean;
  keyIdConfigured: boolean;
  secretConfigured: boolean;
  worker: {
    state: 'RUNNING' | 'STALE' | 'UNKNOWN' | 'DISABLED';
    lastSeenAt: string | null;
    instanceId: string | null;
  };
  queue: {
    pending: number;
    processing: number;
    retry: number;
    failed: number;
    deliveredLast24h: number;
    oldestPendingAgeSeconds: number | null;
  };
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  alerts: string[];
};

export type IntegrationTestConnectionResult = {
  ok: boolean;
  latencyMs: number | null;
  checkedAt: string;
  message: string;
  failureCategory: IntegrationFailureCategory | null;
};

export function outboxStatusLabel(status: OutboxDeliveryStatus): string {
  switch (status) {
    case 'PENDING':
      return 'Ожидает отправки';
    case 'PROCESSING':
      return 'Отправляется';
    case 'RETRY':
      return 'Повторная попытка';
    case 'DELIVERED':
      return 'Передано';
    case 'FAILED':
      return 'Ошибка';
    default: {
      const _e: never = status;
      return _e;
    }
  }
}

export function isIntegrationMode(value: string): value is IntegrationMode {
  return (INTEGRATION_MODES as readonly string[]).includes(value);
}

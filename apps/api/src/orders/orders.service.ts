import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  allowedOrderTransitions,
  isOrderTransitionAllowed,
  orderStatusLabel,
  type CheckoutCartLineInput,
  type CheckoutValidateRequest,
  type CheckoutValidateResponse,
  type CreateOrderRequest,
  type FulfillmentType,
  type OrderAdminDetailDto,
  type OrderAdminListItemDto,
  type OrderCreatedResponse,
  type OrderEventDto,
  type OrderItemPublicDto,
  type OrderStatus,
  type OrderTrackingDto,
  type TimeWindowDto,
} from '@bouquet-one/contracts';
import type { OrderEventType, Prisma } from '@bouquet-one/database';
import { createHash } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { ProductsRepository } from '../catalog/products.repository';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../database/prisma.service';
import { MediaService } from '../media/media.service';
import {
  businessDateString,
  formatOrderNumber,
  isTimeWindowSelectable,
} from './business-time.util';
import { validateCartLines, type VariantPriceSource } from './cart-validation';
import { FulfillmentSettingsService } from './fulfillment-settings.service';
import { maskPhoneE164, normalizeByPhone } from './phone.util';
import { generateTrackingToken, hashTrackingToken } from './tracking-token.util';

const OUTBOX_ORDER_CREATED = 'ORDER_CREATED';
const OUTBOX_SCHEMA_VERSION = 1;

function statusToEventType(to: OrderStatus): OrderEventType {
  switch (to) {
    case 'CONFIRMED':
      return 'ORDER_CONFIRMED';
    case 'PREPARING':
      return 'ORDER_PREPARING';
    case 'READY':
      return 'ORDER_READY';
    case 'DELIVERING':
      return 'ORDER_OUT_FOR_DELIVERY';
    case 'COMPLETED':
      return 'ORDER_COMPLETED';
    case 'CANCELLED':
      return 'ORDER_CANCELLED';
    default:
      return 'ORDER_CREATED';
  }
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsRepository,
    private readonly media: MediaService,
    private readonly fulfillment: FulfillmentSettingsService,
    private readonly audit: AuditService,
    private readonly appConfig: AppConfigService,
  ) {}

  private primaryImageUrl(product: {
    media: Array<{
      isPrimary: boolean;
      sortOrder: number;
      mediaAsset: { storageKey: string };
    }>;
  }): string | null {
    const primary =
      product.media.find((m) => m.isPrimary) ??
      [...product.media].sort((a, b) => a.sortOrder - b.sortOrder)[0];
    return primary ? this.media.getPublicUrl(primary.mediaAsset.storageKey) : null;
  }

  private async buildResolver(lines: CheckoutCartLineInput[]) {
    const productIds = [...new Set(lines.map((l) => l.productId))];
    const loaded = await Promise.all(productIds.map((id) => this.products.findById(id)));
    const byId = new Map(loaded.filter(Boolean).map((p) => [p!.id, p!]));

    return (productId: string, variantId: string): VariantPriceSource | null => {
      const product = byId.get(productId);
      if (!product) return null;
      const variant = product.variants.find((v) => v.id === variantId) ?? null;
      return {
        product: {
          id: product.id,
          name: product.name,
          slug: product.slug,
          lifecycle: product.lifecycle,
          availability: product.availability,
          currency: product.currency,
          publishAt: product.publishAt,
          publishedAt: product.publishedAt,
          unpublishAt: product.unpublishAt,
          primaryImageUrl: this.primaryImageUrl(product),
        },
        variant: variant
          ? {
              id: variant.id,
              name: variant.name,
              status: variant.status,
              priceMinor: variant.priceMinor,
            }
          : null,
      };
    };
  }

  async validateCart(dto: CheckoutValidateRequest): Promise<CheckoutValidateResponse> {
    const settings = await this.fulfillment.getOrCreate();
    const resolve = await this.buildResolver(dto.items);
    const prior = new Map<string, bigint>();
    for (const p of dto.priorUnitPrices ?? []) {
      try {
        prior.set(p.variantId, BigInt(p.unitPriceMinor));
      } catch {
        /* ignore bad prior */
      }
    }
    const result = validateCartLines({
      lines: dto.items,
      resolve,
      priorUnitPrices: prior,
    });
    const deliveryFee =
      result.ok && result.items.length > 0 ? settings.deliveryFeeMinor : 0n;
    // Delivery fee applied only when validating with intent — keep fee in response for UX;
    // actual fee decided at create based on fulfillment type.
    return {
      ok: result.ok,
      currency: 'BYN',
      items: result.items,
      issues: result.issues,
      subtotalMinor: result.subtotalMinor.toString(),
      deliveryFeeMinor: deliveryFee.toString(),
      totalMinor: (result.subtotalMinor + deliveryFee).toString(),
    };
  }

  async createOrder(
    dto: CreateOrderRequest,
    meta?: { requestId?: string },
  ): Promise<OrderCreatedResponse> {
    const idempotencyKey = dto.idempotencyKey?.trim();
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
      throw new BadRequestException('idempotencyKey is required (8–128 chars)');
    }

    const requestHash = hashCreateOrderPayload(dto);

    const existing = await this.prisma.client.order.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      return this.replayOrConflict(existing, requestHash);
    }

    const purchaserPhone = normalizeByPhone(dto.purchaserPhone);
    if (!purchaserPhone) {
      throw new BadRequestException('Некорректный телефон заказчика');
    }
    const purchaserName = dto.purchaserName?.trim();
    if (!purchaserName || purchaserName.length < 2) {
      throw new BadRequestException('Укажите имя заказчика');
    }

    if (dto.fulfillmentType !== 'DELIVERY' && dto.fulfillmentType !== 'PICKUP') {
      throw new BadRequestException('Invalid fulfillmentType');
    }

    const settings = await this.fulfillment.getOrCreate();
    if (dto.fulfillmentType === 'DELIVERY' && !settings.deliveryEnabled) {
      throw new BadRequestException('Доставка сейчас недоступна');
    }
    if (dto.fulfillmentType === 'PICKUP' && !settings.pickupEnabled) {
      throw new BadRequestException('Самовывоз сейчас недоступен');
    }

    const windows = (settings.timeWindows as unknown as TimeWindowDto[]) ?? [];
    const window = windows.find((w) => w.id === dto.timeWindowId && w.active);
    if (!window) {
      throw new BadRequestException('Выберите доступный интервал времени');
    }
    const applies =
      window.appliesTo === 'BOTH' ||
      window.appliesTo === dto.fulfillmentType ||
      (window.appliesTo === 'DELIVERY' && dto.fulfillmentType === 'DELIVERY') ||
      (window.appliesTo === 'PICKUP' && dto.fulfillmentType === 'PICKUP');
    if (!applies) {
      throw new BadRequestException('Интервал недоступен для выбранного способа получения');
    }

    const tz = this.appConfig.businessTimezone;
    const now = new Date();
    if (
      !isTimeWindowSelectable({
        fulfillmentDate: dto.fulfillmentDate,
        windowStartMinutes: window.startMinutes,
        now,
        minLeadTimeMinutes: settings.minLeadTimeMinutes,
        maxAdvanceDays: settings.maxAdvanceDays,
        timeZone: tz,
      })
    ) {
      throw new BadRequestException('Выбранные дата или время недоступны');
    }

    let recipientName: string | null = null;
    let recipientPhone: string | null = null;
    let addressKnown = true;
    let deliveryAddress: string | null = null;
    let addressDetails: string | null = null;
    const surprise = Boolean(dto.surprise);

    if (dto.fulfillmentType === 'DELIVERY') {
      recipientName = (dto.recipientName ?? '').trim() || null;
      recipientPhone = dto.recipientPhone ? normalizeByPhone(dto.recipientPhone) : null;
      if (!recipientName || recipientName.length < 2) {
        throw new BadRequestException('Укажите имя получателя');
      }
      if (!recipientPhone) {
        throw new BadRequestException('Некорректный телефон получателя');
      }
      addressKnown = dto.addressKnown !== false;
      if (addressKnown) {
        deliveryAddress = (dto.deliveryAddress ?? '').trim() || null;
        if (!deliveryAddress || deliveryAddress.length < 5) {
          throw new BadRequestException('Укажите адрес доставки');
        }
      } else {
        deliveryAddress = null;
      }
      addressDetails = (dto.addressDetails ?? '').trim() || null;
    }

    const cardMessage = (dto.cardMessage ?? '').trim() || null;
    if (cardMessage && cardMessage.length > 500) {
      throw new BadRequestException('Текст открытки слишком длинный');
    }
    const customerComment = (dto.customerComment ?? '').trim() || null;
    if (customerComment && customerComment.length > 1000) {
      throw new BadRequestException('Комментарий слишком длинный');
    }
    const anonymousCard = Boolean(dto.anonymousCard);

    const resolve = await this.buildResolver(dto.items);
    const priced = validateCartLines({ lines: dto.items, resolve, now });
    if (!priced.ok) {
      throw new BadRequestException({
        message: 'Корзина содержит недоступные товары',
        error: 'CartValidationFailed',
        issues: priced.issues.filter((i) => i.code !== 'PRICE_CHANGED'),
      });
    }

    const deliveryFee =
      dto.fulfillmentType === 'DELIVERY' ? settings.deliveryFeeMinor : 0n;
    const total = priced.subtotalMinor + deliveryFee;
    const trackingToken = generateTrackingToken();
    const trackingTokenHash = hashTrackingToken(trackingToken);
    const businessDate = businessDateString(now, tz);

    try {
      const order = await this.prisma.client.$transaction(async (tx) => {
        // Re-check idempotency inside transaction (concurrent submissions)
        const raced = await tx.order.findUnique({ where: { idempotencyKey } });
        if (raced) {
          return { kind: 'replay' as const, order: raced };
        }

        // Allocate order number — row lock via upsert + update
        await tx.orderNumberSequence.upsert({
          where: { businessDate },
          create: { businessDate, lastValue: 0 },
          update: {},
        });
        const seqRows = await tx.$queryRaw<Array<{ last_value: number }>>`
          UPDATE order_number_sequences
          SET last_value = last_value + 1
          WHERE business_date = ${businessDate}
          RETURNING last_value
        `;
        const seq = seqRows[0]?.last_value;
        if (!seq) throw new Error('Failed to allocate order number');
        const orderNumber = formatOrderNumber(businessDate, seq);

        const created = await tx.order.create({
          data: {
            orderNumber,
            trackingTokenHash,
            idempotencyKey,
            status: 'RECEIVED',
            fulfillmentType: dto.fulfillmentType,
            purchaserName,
            purchaserPhoneE164: purchaserPhone,
            recipientName,
            recipientPhoneE164: recipientPhone,
            surprise,
            addressKnown,
            deliveryAddress,
            addressDetails,
            fulfillmentDate: dto.fulfillmentDate,
            timeWindowId: window.id,
            timeWindowLabel: window.label,
            timeWindowStartMinutes: window.startMinutes,
            timeWindowEndMinutes: window.endMinutes,
            cardMessage,
            anonymousCard,
            customerComment,
            currency: 'BYN',
            subtotalMinor: priced.subtotalMinor,
            deliveryFeeMinor: deliveryFee,
            totalMinor: total,
            items: {
              create: priced.items.map((item, index) => ({
                sortOrder: index,
                productId: item.productId,
                variantId: item.variantId,
                productName: item.productName,
                productSlug: item.productSlug,
                variantName: item.variantName,
                primaryImageUrl: item.primaryImageUrl,
                unitPriceMinor: BigInt(item.unitPriceMinor),
                quantity: item.quantity,
                lineTotalMinor: BigInt(item.lineTotalMinor),
                currency: 'BYN',
              })),
            },
            events: {
              create: {
                type: 'ORDER_CREATED',
                fromStatus: null,
                toStatus: 'RECEIVED',
                message: 'Заказ создан',
                requestId: meta?.requestId ?? null,
              },
            },
          },
        });

        await tx.outboxEvent.create({
          data: {
            eventType: OUTBOX_ORDER_CREATED,
            aggregateType: 'Order',
            aggregateId: created.id,
            schemaVersion: OUTBOX_SCHEMA_VERSION,
            payload: {
              schemaVersion: OUTBOX_SCHEMA_VERSION,
              orderId: created.id,
              orderNumber: created.orderNumber,
              status: created.status,
              fulfillmentType: created.fulfillmentType,
              fulfillmentDate: created.fulfillmentDate,
              totalMinor: created.totalMinor.toString(),
              currency: created.currency,
              itemCount: priced.items.length,
              requestHash,
              createdAt: created.createdAt.toISOString(),
            } as Prisma.InputJsonValue,
          },
        });

        return { kind: 'created' as const, order: created };
      });

      if (order.kind === 'replay') {
        return this.replayOrConflict(order.order, requestHash);
      }

      return {
        id: order.order.id,
        orderNumber: order.order.orderNumber,
        status: order.order.status,
        trackingToken,
        trackingPath: `/order/${trackingToken}`,
        replayed: false,
        totalMinor: order.order.totalMinor.toString(),
        currency: 'BYN',
        fulfillmentType: order.order.fulfillmentType,
        fulfillmentDate: order.order.fulfillmentDate,
        timeWindowLabel: order.order.timeWindowLabel,
      };
    } catch (error) {
      // Unique violation on idempotency_key / tracking / order_number
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        const again = await this.prisma.client.order.findUnique({
          where: { idempotencyKey },
        });
        if (again) return this.replayOrConflict(again, requestHash);
      }
      throw error;
    }
  }

  private async replayOrConflict(
    existing: {
      id: string;
      orderNumber: string;
      status: OrderStatus;
      fulfillmentType: FulfillmentType;
      fulfillmentDate: string;
      timeWindowLabel: string;
      totalMinor: bigint;
    },
    requestHash: string,
  ): Promise<OrderCreatedResponse> {
    const outbox = await this.prisma.client.outboxEvent.findFirst({
      where: {
        aggregateType: 'Order',
        aggregateId: existing.id,
        eventType: OUTBOX_ORDER_CREATED,
      },
      orderBy: { createdAt: 'asc' },
    });
    const prevHash =
      outbox && typeof outbox.payload === 'object' && outbox.payload !== null
        ? (outbox.payload as { requestHash?: string }).requestHash
        : undefined;
    if (prevHash && prevHash !== requestHash) {
      throw new ConflictException('Idempotency key reused with a different payload');
    }
    return {
      id: existing.id,
      orderNumber: existing.orderNumber,
      status: existing.status,
      trackingToken: null,
      trackingPath: null,
      replayed: true,
      totalMinor: existing.totalMinor.toString(),
      currency: 'BYN',
      fulfillmentType: existing.fulfillmentType,
      fulfillmentDate: existing.fulfillmentDate,
      timeWindowLabel: existing.timeWindowLabel,
    };
  }

  async trackByToken(rawToken: string): Promise<OrderTrackingDto> {
    if (!rawToken || rawToken.length < 20) throw new NotFoundException();
    const hash = hashTrackingToken(rawToken);
    const order = await this.prisma.client.order.findUnique({
      where: { trackingTokenHash: hash },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!order) throw new NotFoundException();

    const store = await this.prisma.client.storefrontSettings.findUnique({
      where: { id: 1 },
    });

    let recipientSummary: string | null = null;
    let deliverySummary: string | null = null;
    let pickupSummary: string | null = null;

    if (order.fulfillmentType === 'DELIVERY') {
      recipientSummary = order.recipientName
        ? `${order.recipientName}, ${maskPhoneE164(order.recipientPhoneE164 ?? '')}`
        : null;
      if (order.addressKnown && order.deliveryAddress) {
        deliverySummary = order.deliveryAddress;
      } else if (!order.addressKnown) {
        deliverySummary = 'Адрес уточняется';
      }
    } else {
      pickupSummary = store?.address ?? 'Самовывоз — адрес магазина';
    }

    return {
      orderNumber: order.orderNumber,
      status: order.status,
      statusLabel: orderStatusLabel(order.status),
      fulfillmentType: order.fulfillmentType,
      fulfillmentDate: order.fulfillmentDate,
      timeWindowLabel: order.timeWindowLabel,
      items: order.items.map(mapItem),
      subtotalMinor: order.subtotalMinor.toString(),
      deliveryFeeMinor: order.deliveryFeeMinor.toString(),
      totalMinor: order.totalMinor.toString(),
      currency: 'BYN',
      recipientSummary,
      deliverySummary,
      pickupSummary,
      hasCardMessage: Boolean(order.cardMessage),
      anonymousCard: order.anonymousCard,
      createdAt: order.createdAt.toISOString(),
    };
  }

  async listAdmin(query: {
    status?: OrderStatus;
    fulfillmentType?: FulfillmentType;
    date?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: OrderAdminListItemDto[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, query.pageSize ?? 20));
    const where: Prisma.OrderWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.fulfillmentType) where.fulfillmentType = query.fulfillmentType;

    const tz = this.appConfig.businessTimezone;
    const today = businessDateString(new Date(), tz);
    if (query.date === 'today' || query.date === undefined) {
      where.fulfillmentDate = today;
    } else if (query.date === 'tomorrow') {
      const [y, m, d] = today.split('-').map(Number);
      const t = new Date(Date.UTC(y!, m! - 1, d! + 1));
      where.fulfillmentDate = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
    } else if (query.date && query.date !== 'all') {
      where.fulfillmentDate = query.date;
    }

    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { orderNumber: { contains: q, mode: 'insensitive' } },
        { purchaserName: { contains: q, mode: 'insensitive' } },
        { purchaserPhoneE164: { contains: q.replace(/\D/g, '') } },
        { recipientName: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.client.order.findMany({
        where,
        orderBy: [
          { fulfillmentDate: 'asc' },
          { timeWindowStartMinutes: 'asc' },
          { createdAt: 'asc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.client.order.count({ where }),
    ]);

    return {
      items: rows.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        fulfillmentType: o.fulfillmentType,
        fulfillmentDate: o.fulfillmentDate,
        timeWindowLabel: o.timeWindowLabel,
        timeWindowStartMinutes: o.timeWindowStartMinutes,
        purchaserName: o.purchaserName,
        purchaserPhoneE164: o.purchaserPhoneE164,
        recipientName: o.recipientName,
        totalMinor: o.totalMinor.toString(),
        currency: 'BYN',
        createdAt: o.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  async getAdmin(id: string): Promise<OrderAdminDetailDto> {
    const order = await this.prisma.client.order.findUnique({
      where: { id },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) throw new NotFoundException();
    return mapAdminDetail(order);
  }

  async transition(
    id: string,
    toStatus: OrderStatus,
    actor: { id: string; requestId?: string },
  ): Promise<OrderAdminDetailDto> {
    return this.prisma.client.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException();

      if (!isOrderTransitionAllowed(order.status, toStatus, order.fulfillmentType)) {
        throw new ConflictException(
          `Переход ${order.status} → ${toStatus} недопустим для ${order.fulfillmentType}`,
        );
      }

      // Optimistic: only update if status unchanged (concurrent transition)
      const data: Prisma.OrderUpdateManyMutationInput = { status: toStatus };
      if (toStatus === 'CONFIRMED') data.confirmedAt = new Date();
      if (toStatus === 'COMPLETED') data.completedAt = new Date();

      const updated = await tx.order.updateMany({
        where: { id, status: order.status },
        data,
      });
      if (updated.count !== 1) {
        throw new ConflictException('Статус заказа уже изменён. Обновите страницу.');
      }

      await tx.orderEvent.create({
        data: {
          orderId: id,
          type: statusToEventType(toStatus),
          fromStatus: order.status,
          toStatus,
          actorAdminUserId: actor.id,
          requestId: actor.requestId ?? null,
        },
      });

      await this.audit.record(
        {
          actorAdminUserId: actor.id,
          action: 'ORDER_STATUS_CHANGED',
          entityType: 'Order',
          entityId: id,
          requestId: actor.requestId ?? null,
          metadata: {
            orderNumber: order.orderNumber,
            fromStatus: order.status,
            toStatus,
          },
        },
        tx,
      );

      const full = await tx.order.findUniqueOrThrow({
        where: { id },
        include: {
          items: { orderBy: { sortOrder: 'asc' } },
          events: { orderBy: { createdAt: 'asc' } },
        },
      });
      return mapAdminDetail(full);
    });
  }

  async cancel(
    id: string,
    reason: string,
    actor: { id: string; requestId?: string },
  ): Promise<OrderAdminDetailDto> {
    const trimmed = reason.trim();
    if (trimmed.length < 3 || trimmed.length > 500) {
      throw new BadRequestException('Укажите причину отмены (3–500 символов)');
    }
    return this.prisma.client.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException();
      if (!isOrderTransitionAllowed(order.status, 'CANCELLED', order.fulfillmentType)) {
        throw new ConflictException('Заказ нельзя отменить');
      }

      const updated = await tx.order.updateMany({
        where: { id, status: order.status },
        data: {
          status: 'CANCELLED',
          cancellationReason: trimmed,
          cancelledAt: new Date(),
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Статус заказа уже изменён. Обновите страницу.');
      }

      await tx.orderEvent.create({
        data: {
          orderId: id,
          type: 'ORDER_CANCELLED',
          fromStatus: order.status,
          toStatus: 'CANCELLED',
          message: trimmed,
          actorAdminUserId: actor.id,
          requestId: actor.requestId ?? null,
        },
      });

      await this.audit.record(
        {
          actorAdminUserId: actor.id,
          action: 'ORDER_CANCELLED',
          entityType: 'Order',
          entityId: id,
          requestId: actor.requestId ?? null,
          metadata: {
            orderNumber: order.orderNumber,
            fromStatus: order.status,
            // Do not store full free-text reason in audit if sensitive — keep short flag
            hasReason: true,
          },
        },
        tx,
      );

      const full = await tx.order.findUniqueOrThrow({
        where: { id },
        include: {
          items: { orderBy: { sortOrder: 'asc' } },
          events: { orderBy: { createdAt: 'asc' } },
        },
      });
      return mapAdminDetail(full);
    });
  }
}

function mapItem(item: {
  id: string;
  productName: string;
  productSlug: string;
  variantName: string;
  primaryImageUrl: string | null;
  quantity: number;
  unitPriceMinor: bigint;
  lineTotalMinor: bigint;
}): OrderItemPublicDto {
  return {
    id: item.id,
    productName: item.productName,
    productSlug: item.productSlug,
    variantName: item.variantName,
    primaryImageUrl: item.primaryImageUrl,
    quantity: item.quantity,
    unitPriceMinor: item.unitPriceMinor.toString(),
    lineTotalMinor: item.lineTotalMinor.toString(),
    currency: 'BYN',
  };
}

function mapEvent(e: {
  id: string;
  type: OrderEventType;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  message: string | null;
  createdAt: Date;
}): OrderEventDto {
  return {
    id: e.id,
    type: e.type,
    fromStatus: e.fromStatus,
    toStatus: e.toStatus,
    message: e.message,
    createdAt: e.createdAt.toISOString(),
  };
}

function mapAdminDetail(order: {
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
  subtotalMinor: bigint;
  deliveryFeeMinor: bigint;
  totalMinor: bigint;
  cancellationReason: string | null;
  cancelledAt: Date | null;
  confirmedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    productName: string;
    productSlug: string;
    variantName: string;
    primaryImageUrl: string | null;
    quantity: number;
    unitPriceMinor: bigint;
    lineTotalMinor: bigint;
  }>;
  events: Array<{
    id: string;
    type: OrderEventType;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus | null;
    message: string | null;
    createdAt: Date;
  }>;
}): OrderAdminDetailDto {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    fulfillmentType: order.fulfillmentType,
    purchaserName: order.purchaserName,
    purchaserPhoneE164: order.purchaserPhoneE164,
    recipientName: order.recipientName,
    recipientPhoneE164: order.recipientPhoneE164,
    surprise: order.surprise,
    addressKnown: order.addressKnown,
    deliveryAddress: order.deliveryAddress,
    addressDetails: order.addressDetails,
    fulfillmentDate: order.fulfillmentDate,
    timeWindowId: order.timeWindowId,
    timeWindowLabel: order.timeWindowLabel,
    timeWindowStartMinutes: order.timeWindowStartMinutes,
    timeWindowEndMinutes: order.timeWindowEndMinutes,
    cardMessage: order.cardMessage,
    anonymousCard: order.anonymousCard,
    customerComment: order.customerComment,
    currency: 'BYN',
    subtotalMinor: order.subtotalMinor.toString(),
    deliveryFeeMinor: order.deliveryFeeMinor.toString(),
    totalMinor: order.totalMinor.toString(),
    cancellationReason: order.cancellationReason,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    confirmedAt: order.confirmedAt?.toISOString() ?? null,
    completedAt: order.completedAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    items: order.items.map(mapItem),
    events: order.events.map(mapEvent),
    allowedTransitions: allowedOrderTransitions(order.status, order.fulfillmentType),
  };
}

/** Stable hash of commercially relevant create payload for idempotency conflict detection. */
export function hashCreateOrderPayload(dto: CreateOrderRequest): string {
  const canonical = {
    items: [...dto.items]
      .map((i) => ({
        productId: i.productId,
        variantId: i.variantId,
        quantity: i.quantity,
      }))
      .sort((a, b) => a.variantId.localeCompare(b.variantId)),
    fulfillmentType: dto.fulfillmentType,
    purchaserName: dto.purchaserName.trim(),
    purchaserPhone: dto.purchaserPhone.replace(/\D/g, ''),
    recipientName: dto.recipientName?.trim() ?? null,
    recipientPhone: dto.recipientPhone?.replace(/\D/g, '') ?? null,
    surprise: Boolean(dto.surprise),
    addressKnown: dto.addressKnown !== false,
    deliveryAddress: dto.deliveryAddress?.trim() ?? null,
    addressDetails: dto.addressDetails?.trim() ?? null,
    fulfillmentDate: dto.fulfillmentDate,
    timeWindowId: dto.timeWindowId,
    cardMessage: dto.cardMessage?.trim() ?? null,
    anonymousCard: Boolean(dto.anonymousCard),
    customerComment: dto.customerComment?.trim() ?? null,
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

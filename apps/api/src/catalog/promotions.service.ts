import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  PaginatedResponse,
  PriceRangeDto,
  ProductAdminDto,
  ProductLifecycle,
  ProductListItemDto,
  ProductPromotionAdminDto,
  PromotionType,
} from '@bouquet-one/contracts';
import type { Prisma } from '@bouquet-one/database';
import { AuditService } from '../audit/audit.service';
import { hashIp } from '../auth/crypto.util';
import type { ActorContext } from '../common/actor.util';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../database/prisma.service';
import { MediaService } from '../media/media.service';
import { activeVariantPrices, OCC_CONFLICT_MESSAGE } from './catalog.logic';
import {
  PRODUCT_INCLUDE,
  toPromotionAdminDto,
  toProductAdminDto,
  toProductListItemDto,
  type ProductWithRelations,
} from './catalog.mapper';
import { ProductsRepository } from './products.repository';
import { validatePromotionInput, type PromotionValidationIssue } from './promotion.util';

export const PROMOTION_STATUSES = ['all', 'active', 'scheduled', 'ended', 'disabled'] as const;
export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];

/** Admin «Акции» row — product identity plus the full promotion record. */
export type AdminPromotionListItemDto = {
  productId: string;
  slug: string;
  name: string;
  lifecycle: ProductLifecycle;
  primaryImageUrl: string | null;
  price: PriceRangeDto | null;
  promotion: ProductPromotionAdminDto;
  status: Exclude<PromotionStatus, 'all'>;
};

export type UpsertPromotionInput = {
  expectedVersion: number;
  enabled: boolean;
  type: PromotionType;
  percentOff?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  variantSalePrices?: Array<{ variantId: string; salePriceMinor: string }>;
};

function promotionValidationException(issues: PromotionValidationIssue[]): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    error: 'PromotionValidationError',
    message: 'Акцию нельзя сохранить: проверьте параметры',
    issues,
  });
}

function statusOf(promotion: ProductPromotionAdminDto, now: Date): AdminPromotionListItemDto['status'] {
  if (!promotion.enabled) return 'disabled';
  if (promotion.currentlyEffective) return 'active';
  if (promotion.startsAt && new Date(promotion.startsAt).getTime() > now.getTime()) {
    return 'scheduled';
  }
  if (promotion.endsAt && new Date(promotion.endsAt).getTime() <= now.getTime()) {
    return 'ended';
  }
  // Enabled but not effective for another reason (e.g. FIXED prices no longer below regular).
  return 'disabled';
}

/**
 * Promotion pricing is server-authoritative: the admin stores intent here, and
 * every read path (catalog, checkout, orders) recomputes the effective price.
 */
@Injectable()
export class PromotionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsRepository,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    private readonly appConfig: AppConfigService,
  ) {}

  private readonly urlFor = (storageKey: string) => this.media.getPublicUrl(storageKey);

  async listAdmin(query: {
    page?: number;
    pageSize?: number;
    status?: PromotionStatus;
    search?: string;
  }): Promise<PaginatedResponse<AdminPromotionListItemDto>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const status = query.status ?? 'all';
    const now = new Date();

    const rows = await this.prisma.client.product.findMany({
      where: {
        promotion: { isNot: null },
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { slug: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: PRODUCT_INCLUDE,
      orderBy: [{ updatedAt: 'desc' }],
    });

    const items = rows
      .map((row) => this.toPromotionListItem(row, now))
      .filter((item): item is AdminPromotionListItemDto => item !== null)
      .filter((item) => status === 'all' || item.status === status);

    return {
      items: items.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize),
      total: items.length,
      page,
      pageSize,
    };
  }

  /** Storefront «Акции» feed — only effectively published, actually discounted products. */
  async listPublicPromotionalProducts(limit = 24): Promise<ProductListItemDto[]> {
    const now = new Date();
    const { items } = await this.products.list({
      filters: { publishedAt: now, promotionalOnly: true },
      skip: 0,
      take: limit,
      sort: 'recommended',
      now,
    });
    return items.map((item) => toProductListItemDto(item, this.urlFor, now));
  }

  async getForProduct(productId: string): Promise<ProductPromotionAdminDto | null> {
    const product = await this.products.findById(productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return toPromotionAdminDto(product, new Date());
  }

  async upsertForProduct(
    productId: string,
    input: UpsertPromotionInput,
    actor: ActorContext,
  ): Promise<ProductAdminDto> {
    const product = await this.products.findById(productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const variantSalePrices = (input.variantSalePrices ?? []).map((row) => ({
      variantId: row.variantId,
      salePriceMinor: BigInt(row.salePriceMinor),
    }));
    const activeVariants = product.variants.filter((variant) => variant.status === 'ACTIVE');
    const startsAt = input.startsAt ? new Date(input.startsAt) : null;
    const endsAt = input.endsAt ? new Date(input.endsAt) : null;

    const issues = validatePromotionInput({
      enabled: input.enabled,
      type: input.type,
      percentOff: input.percentOff ?? null,
      startsAt,
      endsAt,
      variantSalePrices,
      activeVariantIds: activeVariants.map((variant) => variant.id),
      variantRegularPrices: new Map(
        activeVariants.map((variant) => [variant.id, variant.priceMinor] as const),
      ),
    });
    if (issues.length > 0) {
      throw promotionValidationException(issues);
    }
    if (input.enabled && activeVariants.length === 0) {
      throw new BadRequestException('Для акции нужен хотя бы один активный вариант');
    }

    await this.prisma.client.$transaction(async (tx) => {
      await this.guardProductVersion(tx, productId, input.expectedVersion);

      const promotion = await tx.productPromotion.upsert({
        where: { productId },
        create: {
          productId,
          enabled: input.enabled,
          type: input.type,
          percentOff: input.type === 'PERCENT' ? (input.percentOff ?? null) : null,
          startsAt,
          endsAt,
        },
        update: {
          enabled: input.enabled,
          type: input.type,
          percentOff: input.type === 'PERCENT' ? (input.percentOff ?? null) : null,
          startsAt,
          endsAt,
          version: { increment: 1 },
        },
        select: { id: true },
      });

      await tx.productPromotionVariantPrice.deleteMany({
        where: { promotionId: promotion.id },
      });
      if (input.type === 'FIXED' && variantSalePrices.length > 0) {
        await tx.productPromotionVariantPrice.createMany({
          data: variantSalePrices.map((row) => ({
            promotionId: promotion.id,
            variantId: row.variantId,
            salePriceMinor: row.salePriceMinor,
          })),
        });
      }

      await this.recordAudit(tx, actor, productId, {
        enabled: input.enabled,
        type: input.type,
        percentOff: input.percentOff ?? null,
        startsAt: startsAt?.toISOString() ?? null,
        endsAt: endsAt?.toISOString() ?? null,
        fixedVariants: variantSalePrices.length,
      });
    });

    const updated = await this.products.findById(productId);
    return toProductAdminDto(updated!, this.urlFor);
  }

  async removeForProduct(
    productId: string,
    expectedVersion: number,
    actor: ActorContext,
  ): Promise<ProductAdminDto> {
    await this.prisma.client.$transaction(async (tx) => {
      await this.guardProductVersion(tx, productId, expectedVersion);
      const deleted = await tx.productPromotion.deleteMany({ where: { productId } });
      if (deleted.count === 0) {
        throw new NotFoundException('Promotion not found');
      }
      await this.recordAudit(tx, actor, productId, { removed: true });
    });

    const updated = await this.products.findById(productId);
    if (!updated) {
      throw new NotFoundException('Product not found');
    }
    return toProductAdminDto(updated, this.urlFor);
  }

  private toPromotionListItem(
    product: ProductWithRelations,
    now: Date,
  ): AdminPromotionListItemDto | null {
    const promotion = toPromotionAdminDto(product, now);
    if (!promotion) return null;
    const primary = product.media.find((item) => item.isPrimary) ?? product.media[0] ?? null;
    return {
      productId: product.id,
      slug: product.slug,
      name: product.name,
      lifecycle: product.lifecycle,
      primaryImageUrl: primary ? this.urlFor(primary.mediaAsset.storageKey) : null,
      price: activeVariantPrices(product.currency, product.variants),
      promotion,
      status: statusOf(promotion, now),
    };
  }

  /** Promotion edits are part of the product aggregate, so they share its version. */
  private async guardProductVersion(
    tx: Prisma.TransactionClient,
    productId: string,
    expectedVersion: number,
  ): Promise<void> {
    const changed = await this.products.updateWithVersion(productId, expectedVersion, {}, tx);
    if (changed > 0) return;
    if (await this.products.exists(productId, tx)) {
      throw new ConflictException(OCC_CONFLICT_MESSAGE);
    }
    throw new NotFoundException('Product not found');
  }

  private recordAudit(
    tx: Prisma.TransactionClient,
    actor: ActorContext,
    entityId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.record(
      {
        actorAdminUserId: actor.actorId,
        action: 'PROMOTION_UPDATED',
        entityType: 'Product',
        entityId,
        metadata,
        requestId: actor.requestId,
        ipHash: hashIp(actor.ip, this.appConfig.sessionHmacSecret),
        userAgent: actor.userAgent,
      },
      tx,
    );
  }
}
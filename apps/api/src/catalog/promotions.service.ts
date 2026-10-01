import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  AdminPromotionListItemDto,
  PaginatedResponse,
  ProductAdminDto,
  ProductPromotionAdminDto,
  ProductListItemDto,
  PromotionType,
  PromotionValidationIssue,
} from '@bouquet-one/contracts';
import { Prisma } from '@bouquet-one/database';
import { AuditService } from '../audit/audit.service';
import { hashIp } from '../auth/crypto.util';
import type { ActorContext } from '../common/actor.util';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../database/prisma.service';
import { MediaService } from '../media/media.service';
import { StorefrontRevalidateService } from '../storefront/storefront-revalidate.service';
import { OCC_CONFLICT_MESSAGE } from './catalog.logic';
import {
  PRODUCT_INCLUDE,
  toPromotionAdminDto,
  toProductAdminDto,
  toProductListItemDto,
  type ProductWithRelations,
} from './catalog.mapper';
import { ProductsRepository } from './products.repository';
import { adminPromotionListStatus, validatePromotionInput } from './promotion.util';

export const PROMOTION_STATUSES = ['all', 'active', 'scheduled', 'ended', 'disabled'] as const;
export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];

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

function mapPromotionPrismaError(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = err.meta as { constraint?: string; field_name?: string } | undefined;
    const constraint = String(meta?.constraint ?? meta?.field_name ?? err.message);
    if (
      constraint.includes('product_promotions_type_fields') ||
      constraint.includes('product_promotions_percent_off_range')
    ) {
      throw promotionValidationException([
        {
          code: 'INVALID_PERCENT',
          message: 'Процент скидки должен быть от 1 до 99',
          field: 'percentOff',
        },
      ]);
    }
  }
  throw err;
}

/**
 * Promotion pricing is server-authoritative: the admin stores intent here, and
 * every read path (catalog, checkout, orders) recomputes the effective price.
 */
@Injectable()
export class PromotionsService {
  private readonly logger = new Logger(PromotionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsRepository,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    private readonly appConfig: AppConfigService,
    private readonly revalidate: StorefrontRevalidateService,
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
    }).catch(mapPromotionPrismaError);

    const updated = await this.products.findById(productId);
    const dto = toProductAdminDto(updated!, this.urlFor);
    await this.revalidate.ping({
      tags: ['catalog', 'storefront'],
      paths: ['/', '/bukety', '/akcii', ...(dto.slug ? [`/bukety/${dto.slug}`] : [])],
    });
    return dto;
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
    const dto = toProductAdminDto(updated, this.urlFor);
    await this.revalidate.ping({
      tags: ['catalog', 'storefront'],
      paths: ['/', '/bukety', '/akcii', ...(dto.slug ? [`/bukety/${dto.slug}`] : [])],
    });
    return dto;
  }

  private toPromotionListItem(
    product: ProductWithRelations,
    now: Date,
  ): AdminPromotionListItemDto | null {
    try {
      const promotionAdmin = toPromotionAdminDto(product, now);
      if (!promotionAdmin) return null;
      const listItem = toProductListItemDto(product, this.urlFor, now);
      return {
        ...listItem,
        promotionAdmin,
        status: adminPromotionListStatus(promotionAdmin, now),
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.warn(`promotion_list_row_skipped productId=${product.id} err=${detail}`);
      return null;
    }
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
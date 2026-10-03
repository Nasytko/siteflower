import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  normalizeSlug,
  type PaginatedResponse,
  type ProductAdminDto,
  type ProductListItemDto,
  type ProductPublicDto,
  type PublishValidationIssue,
} from '@bouquet-one/contracts';
import type { AuditAction, Prisma } from '@bouquet-one/database';
import { AuditService } from '../audit/audit.service';
import { hashIp } from '../auth/crypto.util';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../database/prisma.service';
import { MediaService } from '../media/media.service';
import { PRODUCT_MEDIA_MAX } from '../media/media.constants';
import type { ActorContext } from '../common/actor.util';
import { trimmedOrNull } from '../common/string.util';
import { StorefrontRevalidateService } from '../storefront/storefront-revalidate.service';
import { BestsellersService } from './bestsellers.service';
import { BudgetRangesService } from './budget-ranges.service';
import { OCC_CONFLICT_MESSAGE, validatePublishRequirements } from './catalog.logic';
import { toProductAdminDto, toProductListItemDto, toProductPublicDto } from './catalog.mapper';
import {
  collectFixedSalePricesFromCreatedVariants,
  resolveEditorPromotionType,
} from './product-editor.util';
import {
  allocateDuplicateSlug,
  buildDuplicateProductName,
} from './product-duplicate.util';
import type {
  CreateProductDto,
  ProductListQueryDto,
  PublishProductDto,
  ReorderProductMediaDto,
  SaveProductEditorDto,
  SetProductBestsellerGroupsDto,
  SetProductComponentsDto,
  SetProductTaxonomiesDto,
  SetProductVariantsDto,
  UpdateProductDto,
  UpdateProductMediaDto,
  UploadProductMediaDto,
} from './products.dto';
import { ProductsRepository } from './products.repository';
import { mapPromotionPrismaError, PromotionsService } from './promotions.service';
import { SlugRedirectsService } from './slug-redirects.service';

type CatalogReference =
  | 'occasion'
  | 'recipient'
  | 'color'
  | 'flower'
  | 'bouquetSize'
  | 'productLine';

export type UploadedImage = {
  buffer: Buffer;
  originalname?: string;
};

/** Options for single-item mutations when orchestrated by bulk. */
export type ProductMutationOptions = {
  /** Skip per-product storefront revalidation (bulk issues one deferred ping). */
  deferStorefrontRevalidate?: boolean;
  /** Marks audit metadata when invoked from bulk orchestration. */
  bulk?: boolean;
};

function publishValidationException(issues: PublishValidationIssue[]): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    error: 'PublishValidationError',
    message: `Cannot publish — ${issues.length} ${issues.length === 1 ? 'issue' : 'issues'}`,
    issues,
  });
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly products: ProductsRepository,
    private readonly slugRedirects: SlugRedirectsService,
    private readonly bestsellers: BestsellersService,
    private readonly budgetRanges: BudgetRangesService,
    private readonly promotions: PromotionsService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
    private readonly revalidate: StorefrontRevalidateService,
  ) {}

  private async bumpStorefrontCache(productSlug?: string): Promise<void> {
    await this.revalidate.ping({
      tags: ['catalog', 'storefront', ...(productSlug ? [`product:${productSlug}`] : [])],
      paths: ['/', '/bukety', ...(productSlug ? [`/bukety/${productSlug}`] : [])],
    });
  }

  private async finishAdminMutation(
    id: string,
    options?: ProductMutationOptions,
  ): Promise<ProductAdminDto> {
    const dto = await this.getById(id);
    if (!options?.deferStorefrontRevalidate) {
      await this.bumpStorefrontCache(dto.slug);
    }
    return dto;
  }

  private readonly urlFor = (storageKey: string) => this.media.getPublicUrl(storageKey);

  async list(query: ProductListQueryDto): Promise<PaginatedResponse<ProductListItemDto>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const now = new Date();
    const budgetRanges = query.budgetRangeIds?.length
      ? await this.budgetRanges.resolveBounds(query.budgetRangeIds)
      : [];
    const { items, total } = await this.products.list({
      filters: {
        search: query.search,
        lifecycle: query.lifecycle,
        availability: query.availability,
        occasionIds: query.occasionIds,
        occasionSlugs: query.occasionSlugs,
        recipientIds: query.recipientIds,
        recipientSlugs: query.recipientSlugs,
        colorIds: query.colorIds,
        colorSlugs: query.colorSlugs,
        flowerIds: query.flowerIds,
        flowerSlugs: query.flowerSlugs,
        bouquetSizeIds: query.bouquetSizeIds,
        bouquetSizeSlugs: query.bouquetSizeSlugs,
        bestsellerGroupIds: query.bestsellerGroupIds,
        promotionalOnly: query.promotionalOnly,
        budgetRanges,
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      sort: query.sort ?? 'recommended',
      now,
    });
    return {
      items: items.map((product) => toProductListItemDto(product, this.urlFor, now)),
      total,
      page,
      pageSize,
    };
  }

  async getById(id: string): Promise<ProductAdminDto> {
    const product = await this.products.findById(id);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return toProductAdminDto(product, this.urlFor);
  }

  async preview(id: string): Promise<ProductPublicDto> {
    const product = await this.products.findById(id);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return toProductPublicDto(product, this.urlFor);
  }

  async create(input: CreateProductDto, actor: ActorContext): Promise<ProductAdminDto> {
    const name = input.name.trim();
    const slug = normalizeSlug(input.slug ?? name);
    if (!slug) {
      throw new BadRequestException('Slug could not be derived from the name');
    }
    const taken = await this.products.findIdBySlug(slug);
    if (taken) {
      throw new ConflictException('Slug already in use');
    }

    const created = await this.prisma.client.$transaction(async (tx) => {
      if (input.bouquetSizeId) {
        await this.assertReferencesExist(tx, 'bouquetSize', [input.bouquetSizeId]);
      }
      await this.assertReferencesExist(tx, 'occasion', input.occasionIds ?? []);
      await this.assertReferencesExist(tx, 'recipient', input.recipientIds ?? []);
      await this.assertReferencesExist(tx, 'color', input.colorIds ?? []);
      await this.assertReferencesExist(tx, 'productLine', input.productLineIds ?? []);

      const product = await this.products.create(
        {
          name,
          slug,
          shortDescription: input.shortDescription
            ? trimmedOrNull(input.shortDescription)
            : null,
          description: input.description ? trimmedOrNull(input.description) : null,
          lifecycle: 'DRAFT',
          ...(input.availability ? { availability: input.availability } : {}),
          ...(input.heightCm === undefined ? {} : { heightCm: input.heightCm }),
          ...(input.bouquetSizeId
            ? { bouquetSize: { connect: { id: input.bouquetSizeId } } }
            : {}),
          ...(input.currency ? { currency: input.currency } : {}),
          seoTitle: input.seoTitle ? trimmedOrNull(input.seoTitle) : null,
          seoDescription: input.seoDescription ? trimmedOrNull(input.seoDescription) : null,
          ...(input.noIndex === undefined ? {} : { noIndex: input.noIndex }),
        },
        tx,
      );

      if (input.variants?.length) {
        await this.products.replaceVariants(
          product.id,
          input.variants.map((variant, index) => ({
            name: variant.name.trim(),
            priceMinor: BigInt(variant.priceMinor),
            sortOrder: variant.sortOrder ?? index,
            status: variant.status ?? 'ACTIVE',
          })),
          tx,
        );
      }
      if (input.occasionIds?.length) {
        await this.products.replaceOccasions(product.id, input.occasionIds, tx);
      }
      if (input.recipientIds?.length) {
        await this.products.replaceRecipients(product.id, input.recipientIds, tx);
      }
      if (input.colorIds?.length) {
        await this.products.replaceColors(product.id, input.colorIds, tx);
      }
      if (input.productLineIds?.length) {
        await this.products.replaceProductLines(product.id, input.productLineIds, tx);
      }

      await this.recordAudit(tx, actor, 'PRODUCT_CREATED', product.id, { slug, name });
      return product;
    });

    return this.getById(created.id);
  }

  /**
   * Clone a product into a new DRAFT. Reuses MediaAsset rows (no S3 copy).
   * Does not copy promotions, bestsellers, or publication schedule.
   * ARCHIVED sources are allowed — the copy is always a fresh DRAFT template.
   * Indexability: DRAFT never enters the public sitemap / catalog (lifecycle gate).
   */
  async duplicate(id: string, actor: ActorContext): Promise<ProductAdminDto> {
    const source = await this.products.findById(id);
    if (!source) {
      throw new NotFoundException('Product not found');
    }

    const name = buildDuplicateProductName(source.name);

    const createdId = await this.prisma.client.$transaction(async (tx) => {
      const slug = await allocateDuplicateSlug(source.slug, async (candidate) => {
        const owner = await this.products.findIdBySlug(candidate, tx);
        return owner != null;
      }).catch((err) => {
        throw new ConflictException(
          err instanceof Error ? err.message : 'Could not allocate a unique slug',
        );
      });

      const product = await this.products.create(
        {
          name,
          slug,
          shortDescription: source.shortDescription,
          description: source.description,
          heightCm: source.heightCm,
          lifecycle: 'DRAFT',
          availability: source.availability,
          currency: source.currency,
          seoTitle: source.seoTitle,
          seoDescription: source.seoDescription,
          noIndex: source.noIndex,
          ...(source.bouquetSizeId
            ? { bouquetSize: { connect: { id: source.bouquetSizeId } } }
            : {}),
        },
        tx,
      );

      if (source.variants.length > 0) {
        await this.products.replaceVariants(
          product.id,
          source.variants.map((variant) => ({
            name: variant.name,
            priceMinor: variant.priceMinor,
            sortOrder: variant.sortOrder,
            status: variant.status,
          })),
          tx,
        );
      }

      if (source.components.length > 0) {
        await this.products.replaceComponents(
          product.id,
          source.components.map((component) => ({
            flowerId: component.flowerId,
            displayName: component.displayName,
            quantity: component.quantity,
            unit: component.unit,
            sortOrder: component.sortOrder,
          })),
          tx,
        );
      }

      await this.products.replaceOccasions(
        product.id,
        source.occasions.map((row) => row.occasionId),
        tx,
      );
      await this.products.replaceRecipients(
        product.id,
        source.recipients.map((row) => row.recipientId),
        tx,
      );
      await this.products.replaceColors(
        product.id,
        source.colors.map((row) => row.colorId),
        tx,
      );
      await this.products.replaceProductLines(
        product.id,
        source.productLines.map((row) => row.productLineId),
        tx,
      );

      // Shared MediaAsset references — new ProductMedia rows only (Restrict FK).
      if (source.media.length > 0) {
        await tx.productMedia.createMany({
          data: source.media.map((item) => ({
            productId: product.id,
            mediaAssetId: item.mediaAssetId,
            sortOrder: item.sortOrder,
            isPrimary: item.isPrimary,
            alt: item.alt,
            caption: item.caption,
          })),
        });
        const sharedAssetIds = [...new Set(source.media.map((item) => item.mediaAssetId))];
        await tx.mediaAsset.updateMany({
          where: { id: { in: sharedAssetIds } },
          data: { orphanedAt: null },
        });
      }

      await this.recordAudit(tx, actor, 'PRODUCT_DUPLICATED', product.id, {
        sourceProductId: source.id,
        sourceSlug: source.slug,
        slug,
      });

      return product.id;
    });

    return this.finishAdminMutation(createdId);
  }

  async update(
    id: string,
    input: UpdateProductDto,
    actor: ActorContext,
    options?: ProductMutationOptions,
  ): Promise<ProductAdminDto> {
    const product = await this.products.findById(id);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const nextSlug = input.slug === undefined ? product.slug : normalizeSlug(input.slug);
    if (!nextSlug) {
      throw new BadRequestException('Slug cannot be empty');
    }
    const slugChanged = nextSlug !== product.slug;

    await this.prisma.client.$transaction(async (tx) => {
      if (slugChanged) {
        const owner = await this.products.findIdBySlug(nextSlug, tx);
        if (owner && owner.id !== product.id) {
          throw new ConflictException('Slug already in use');
        }
        await this.slugRedirects.record(tx, 'PRODUCT', product.slug, nextSlug);
      }
      if (input.bouquetSizeId) {
        await this.assertReferencesExist(tx, 'bouquetSize', [input.bouquetSizeId]);
      }

      const data: Prisma.ProductUncheckedUpdateManyInput = {
        ...(input.name === undefined ? {} : { name: input.name.trim() }),
        ...(slugChanged ? { slug: nextSlug } : {}),
        ...(input.shortDescription === undefined
          ? {}
          : { shortDescription: trimmedOrNull(input.shortDescription) }),
        ...(input.description === undefined
          ? {}
          : { description: trimmedOrNull(input.description) }),
        ...(input.availability === undefined ? {} : { availability: input.availability }),
        ...(input.heightCm === undefined ? {} : { heightCm: input.heightCm }),
        ...(input.bouquetSizeId === undefined ? {} : { bouquetSizeId: input.bouquetSizeId }),
        ...(input.currency === undefined ? {} : { currency: input.currency }),
        ...(input.seoTitle === undefined ? {} : { seoTitle: trimmedOrNull(input.seoTitle) }),
        ...(input.seoDescription === undefined
          ? {}
          : { seoDescription: trimmedOrNull(input.seoDescription) }),
        ...(input.noIndex === undefined ? {} : { noIndex: input.noIndex }),
        ...(input.publishAt === undefined
          ? {}
          : { publishAt: input.publishAt ? new Date(input.publishAt) : null }),
        ...(input.unpublishAt === undefined
          ? {}
          : { unpublishAt: input.unpublishAt ? new Date(input.unpublishAt) : null }),
      };

      await this.guardVersion(tx, id, input.expectedVersion, data);
      const availabilityChanged =
        input.availability !== undefined && input.availability !== product.availability;
      await this.recordAudit(tx, actor, 'PRODUCT_UPDATED', id, {
        fields: Object.keys(data),
        ...(slugChanged ? { previousSlug: product.slug, slug: nextSlug } : {}),
        ...(availabilityChanged
          ? {
              previousAvailability: product.availability,
              newAvailability: input.availability,
            }
          : {}),
        ...(options?.bulk ? { bulk: true } : {}),
      });
    });

    return this.finishAdminMutation(id, options);
  }

  /**
   * Atomic product-editor save: one OCC check, one transaction, one version bump.
   * FIXED promotion sale prices bind to each variant input object as it is created
   * (no cross-request positional remapping).
   */
  async saveEditor(
    id: string,
    input: SaveProductEditorDto,
    actor: ActorContext,
  ): Promise<ProductAdminDto> {
    const product = await this.products.findById(id);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const nextSlug = normalizeSlug(input.slug);
    if (!nextSlug) {
      throw new BadRequestException('Slug could not be derived');
    }
    if (nextSlug !== product.slug) {
      const taken = await this.products.findIdBySlug(nextSlug);
      if (taken && taken.id !== id) {
        throw new ConflictException('Slug already in use');
      }
    }

    const promotionType = resolveEditorPromotionType({
      enabled: input.promotion.enabled,
      type: input.promotion.type,
      percentOff: input.promotion.percentOff ?? null,
    });
    const startsAt = input.promotion.startsAt ? new Date(input.promotion.startsAt) : null;
    const endsAt = input.promotion.endsAt ? new Date(input.promotion.endsAt) : null;

    const flowerIds = input.components
      .map((component) => component.flowerId)
      .filter((flowerId): flowerId is string => Boolean(flowerId));

    await this.prisma.client.$transaction(async (tx) => {
      const data: Prisma.ProductUncheckedUpdateManyInput = {
        name: input.name.trim(),
        slug: nextSlug,
        shortDescription: trimmedOrNull(input.shortDescription ?? null),
        description: trimmedOrNull(input.description ?? null),
        availability: input.availability,
        heightCm: input.heightCm === undefined ? product.heightCm : input.heightCm,
        seoTitle: trimmedOrNull(input.seoTitle ?? null),
        seoDescription: trimmedOrNull(input.seoDescription ?? null),
        noIndex: input.noIndex,
        publishAt:
          input.publishAt === undefined
            ? product.publishAt
            : input.publishAt
              ? new Date(input.publishAt)
              : null,
        unpublishAt:
          input.unpublishAt === undefined
            ? product.unpublishAt
            : input.unpublishAt
              ? new Date(input.unpublishAt)
              : null,
        bouquetSizeId: input.bouquetSizeId === undefined ? undefined : input.bouquetSizeId,
      };

      if (input.bouquetSizeId) {
        await this.assertReferencesExist(tx, 'bouquetSize', [input.bouquetSizeId]);
      }
      await this.assertReferencesExist(tx, 'flower', flowerIds);
      await this.assertReferencesExist(tx, 'occasion', input.occasionIds);
      await this.assertReferencesExist(tx, 'recipient', input.recipientIds);
      await this.assertReferencesExist(tx, 'color', input.colorIds);
      await this.assertReferencesExist(tx, 'productLine', input.productLineIds);

      if (nextSlug !== product.slug) {
        await this.slugRedirects.record(tx, 'PRODUCT', product.slug, nextSlug);
      }

      // Single OCC bump for the whole editor snapshot.
      await this.guardVersion(tx, id, input.expectedVersion, data);

      const createdVariants = await this.products.replaceVariantsReturning(
        id,
        input.variants.map((variant, index) => ({
          name: variant.name.trim(),
          priceMinor: BigInt(variant.priceMinor),
          sortOrder: variant.sortOrder ?? index,
          status: variant.status ?? 'ACTIVE',
          salePriceMinor: variant.salePriceMinor,
        })),
        tx,
      );

      // salePriceMinor traveled with each create input → returned on the same object.
      const variantSalePrices =
        promotionType === 'FIXED'
          ? collectFixedSalePricesFromCreatedVariants(
              createdVariants.map((created) => ({
                createdId: created.id,
                status: created.status,
                salePriceMinor: created.salePriceMinor,
              })),
            )
          : [];

      this.promotions.assertPromotionValid({
        enabled: input.promotion.enabled,
        type: promotionType,
        percentOff: promotionType === 'PERCENT' ? (input.promotion.percentOff ?? null) : null,
        startsAt,
        endsAt,
        variantSalePrices,
        activeVariants: createdVariants
          .filter((variant) => variant.status === 'ACTIVE')
          .map((variant) => ({ id: variant.id, priceMinor: variant.priceMinor })),
      });

      await this.products.replaceComponents(
        id,
        input.components.map((component, index) => ({
          flowerId: component.flowerId ?? null,
          displayName: component.displayName.trim(),
          quantity: component.quantity ?? null,
          unit: component.unit ?? 'UNSPECIFIED',
          sortOrder: component.sortOrder ?? index,
        })),
        tx,
      );

      await this.products.replaceOccasions(id, input.occasionIds, tx);
      await this.products.replaceRecipients(id, input.recipientIds, tx);
      await this.products.replaceColors(id, input.colorIds, tx);
      await this.products.replaceProductLines(id, input.productLineIds, tx);

      await this.promotions.applyPromotionUpsertInTx(tx, id, {
        enabled: input.promotion.enabled,
        type: promotionType,
        percentOff: promotionType === 'PERCENT' ? (input.promotion.percentOff ?? null) : null,
        startsAt,
        endsAt,
        variantSalePrices,
      });

      await this.bestsellers.setGroupsForProduct(id, input.groupIds, tx);

      await this.recordAudit(tx, actor, 'PRODUCT_UPDATED', id, {
        editor: true,
        fields: Object.keys(data),
        variants: input.variants.length,
        components: input.components.length,
        promotionType,
        groups: input.groupIds.length,
        ...(nextSlug !== product.slug ? { previousSlug: product.slug, slug: nextSlug } : {}),
      });
    }).catch(mapPromotionPrismaError);

    return this.finishAdminMutation(id);
  }

  async setVariants(
    id: string,
    input: SetProductVariantsDto,
    actor: ActorContext,
  ): Promise<ProductAdminDto> {
    await this.prisma.client.$transaction(async (tx) => {
      await this.guardVersion(tx, id, input.expectedVersion);
      await this.products.replaceVariants(
        id,
        input.variants.map((variant, index) => ({
          name: variant.name.trim(),
          priceMinor: BigInt(variant.priceMinor),
          sortOrder: variant.sortOrder ?? index,
          status: variant.status ?? 'ACTIVE',
        })),
        tx,
      );
      await this.recordAudit(tx, actor, 'PRODUCT_VARIANT_CHANGED', id, {
        count: input.variants.length,
      });
    });

    return this.finishAdminMutation(id);
  }

  /**
   * Composition is also the flower facet: filters read `ProductComponent.flowerId`,
   * so there is no separate product↔flower link to keep in sync.
   */
  async setComponents(
    id: string,
    input: SetProductComponentsDto,
    actor: ActorContext,
  ): Promise<ProductAdminDto> {
    const flowerIds = input.components
      .map((component) => component.flowerId)
      .filter((flowerId): flowerId is string => Boolean(flowerId));

    await this.prisma.client.$transaction(async (tx) => {
      await this.guardVersion(tx, id, input.expectedVersion);
      await this.assertReferencesExist(tx, 'flower', flowerIds);
      await this.products.replaceComponents(
        id,
        input.components.map((component, index) => ({
          flowerId: component.flowerId ?? null,
          displayName: component.displayName.trim(),
          quantity: component.quantity ?? null,
          unit: component.unit ?? 'UNSPECIFIED',
          sortOrder: component.sortOrder ?? index,
        })),
        tx,
      );
      await this.recordAudit(tx, actor, 'PRODUCT_UPDATED', id, {
        components: input.components.length,
      });
    });

    return this.finishAdminMutation(id);
  }

  async setTaxonomies(
    id: string,
    input: SetProductTaxonomiesDto,
    actor: ActorContext,
  ): Promise<ProductAdminDto> {
    await this.prisma.client.$transaction(async (tx) => {
      const data: Prisma.ProductUncheckedUpdateManyInput =
        input.bouquetSizeId === undefined ? {} : { bouquetSizeId: input.bouquetSizeId };
      if (input.bouquetSizeId) {
        await this.assertReferencesExist(tx, 'bouquetSize', [input.bouquetSizeId]);
      }
      await this.guardVersion(tx, id, input.expectedVersion, data);

      if (input.occasionIds) {
        await this.assertReferencesExist(tx, 'occasion', input.occasionIds);
        await this.products.replaceOccasions(id, input.occasionIds, tx);
      }
      if (input.recipientIds) {
        await this.assertReferencesExist(tx, 'recipient', input.recipientIds);
        await this.products.replaceRecipients(id, input.recipientIds, tx);
      }
      if (input.colorIds) {
        await this.assertReferencesExist(tx, 'color', input.colorIds);
        await this.products.replaceColors(id, input.colorIds, tx);
      }
      if (input.productLineIds) {
        await this.assertReferencesExist(tx, 'productLine', input.productLineIds);
        await this.products.replaceProductLines(id, input.productLineIds, tx);
      }

      await this.recordAudit(tx, actor, 'PRODUCT_UPDATED', id, { taxonomies: true });
    });

    return this.finishAdminMutation(id);
  }

  async setBestsellerGroups(
    id: string,
    input: SetProductBestsellerGroupsDto,
    actor: ActorContext,
  ): Promise<ProductAdminDto> {
    await this.prisma.client.$transaction(async (tx) => {
      await this.guardVersion(tx, id, input.expectedVersion);
      await this.bestsellers.setGroupsForProduct(id, input.groupIds, tx);
      await this.recordAudit(tx, actor, 'BESTSELLER_UPDATED', id, {
        groups: input.groupIds.length,
      });
    });

    return this.finishAdminMutation(id);
  }

  async publish(
    id: string,
    input: PublishProductDto,
    actor: ActorContext,
    options?: ProductMutationOptions,
  ): Promise<ProductAdminDto> {
    const product = await this.products.findById(id);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const issues = validatePublishRequirements({
      name: product.name,
      slug: product.slug,
      shortDescription: product.shortDescription,
      description: product.description,
      variants: product.variants,
      hasPrimaryImage: product.media.some((media) => media.isPrimary),
    });
    if (issues.length > 0) {
      throw publishValidationException(issues);
    }

    const now = new Date();
    const publishAt = input.publishAt ? new Date(input.publishAt) : null;
    const unpublishAt = input.unpublishAt ? new Date(input.unpublishAt) : null;
    if (unpublishAt && (publishAt ?? now).getTime() >= unpublishAt.getTime()) {
      throw new BadRequestException('unpublishAt must be later than publishAt');
    }

    await this.prisma.client.$transaction(async (tx) => {
      await this.guardVersion(tx, id, input.expectedVersion, {
        lifecycle: 'PUBLISHED',
        publishedAt: product.publishedAt ?? now,
        publishAt,
        unpublishAt,
      });
      await this.recordAudit(tx, actor, 'PRODUCT_PUBLISHED', id, {
        publishAt: publishAt?.toISOString() ?? null,
        unpublishAt: unpublishAt?.toISOString() ?? null,
        ...(options?.bulk ? { bulk: true } : {}),
      });
    });

    return this.finishAdminMutation(id, options);
  }

  async unpublish(
    id: string,
    expectedVersion: number,
    actor: ActorContext,
    options?: ProductMutationOptions,
  ): Promise<ProductAdminDto> {
    await this.prisma.client.$transaction(async (tx) => {
      await this.guardVersion(tx, id, expectedVersion, {
        lifecycle: 'DRAFT',
        publishAt: null,
        unpublishAt: null,
      });
      await this.recordAudit(tx, actor, 'PRODUCT_UNPUBLISHED', id, {
        ...(options?.bulk ? { bulk: true } : {}),
      });
    });

    return this.finishAdminMutation(id, options);
  }

  async archive(
    id: string,
    expectedVersion: number,
    actor: ActorContext,
  ): Promise<ProductAdminDto> {
    await this.prisma.client.$transaction(async (tx) => {
      await this.guardVersion(tx, id, expectedVersion, {
        lifecycle: 'ARCHIVED',
        publishAt: null,
        unpublishAt: null,
      });
      await this.recordAudit(tx, actor, 'PRODUCT_ARCHIVED', id);
    });

    return this.finishAdminMutation(id);
  }

  async addMedia(
    id: string,
    file: UploadedImage,
    input: UploadProductMediaDto,
    actor: ActorContext,
  ): Promise<ProductAdminDto> {
    const product = await this.products.findById(id);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    if (product.media.length >= PRODUCT_MEDIA_MAX) {
      throw new BadRequestException(
        `Нельзя добавить больше ${PRODUCT_MEDIA_MAX} фотографий к одному товару`,
      );
    }

    const asset = await this.media.uploadImage(file.buffer, file.originalname);
    if (!asset) {
      throw new BadRequestException('Не удалось сохранить изображение. Попробуйте ещё раз.');
    }
    const isPrimary = input.isPrimary ?? product.media.length === 0;
    const nextSort =
      product.media.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1;

    try {
      await this.prisma.client.$transaction(async (tx) => {
        // Re-check gallery limit inside the transaction to reduce races.
        const count = await tx.productMedia.count({ where: { productId: id } });
        if (count >= PRODUCT_MEDIA_MAX) {
          throw new BadRequestException(
            `Нельзя добавить больше ${PRODUCT_MEDIA_MAX} фотографий к одному товару`,
          );
        }
        if (isPrimary) {
          await tx.productMedia.updateMany({
            where: { productId: id },
            data: { isPrimary: false },
          });
        }
        await tx.productMedia.create({
          data: {
            productId: id,
            mediaAssetId: asset.id,
            sortOrder: nextSort,
            isPrimary,
            alt: input.alt ? trimmedOrNull(input.alt) : null,
            caption: input.caption ? trimmedOrNull(input.caption) : null,
          },
        });
        await tx.mediaAsset.update({
          where: { id: asset.id },
          data: { orphanedAt: null },
        });
        await this.products.bumpVersion(id, tx);
        await this.recordAudit(tx, actor, 'PRODUCT_MEDIA_ADDED', id, {
          mediaAssetId: asset.id,
          isPrimary,
        });
      });
    } catch (err) {
      // Asset is already persisted; orphan cleanup will reclaim if never linked.
      if (err instanceof BadRequestException) throw err;
      throw err;
    }

    return this.finishAdminMutation(id);
  }

  async updateMedia(
    id: string,
    mediaId: string,
    input: UpdateProductMediaDto,
    actor: ActorContext,
  ): Promise<ProductAdminDto> {
    const product = await this.products.findById(id);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    const media = product.media.find((item) => item.id === mediaId);
    if (!media) {
      throw new NotFoundException('Product image not found');
    }

    await this.prisma.client.$transaction(async (tx) => {
      if (input.isPrimary) {
        await tx.productMedia.updateMany({
          where: { productId: id },
          data: { isPrimary: false },
        });
      }
      await tx.productMedia.update({
        where: { id: mediaId },
        data: {
          ...(input.alt === undefined ? {} : { alt: trimmedOrNull(input.alt) }),
          ...(input.caption === undefined ? {} : { caption: trimmedOrNull(input.caption) }),
          ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
          ...(input.isPrimary === undefined ? {} : { isPrimary: input.isPrimary }),
        },
      });
      await this.products.bumpVersion(id, tx);
      await this.recordAudit(tx, actor, 'PRODUCT_UPDATED', id, { mediaId });
    });

    return this.finishAdminMutation(id);
  }

  async removeMedia(id: string, mediaId: string, actor: ActorContext): Promise<ProductAdminDto> {
    const product = await this.products.findById(id);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    const media = product.media.find((item) => item.id === mediaId);
    if (!media) {
      throw new NotFoundException('Product image not found');
    }

    await this.prisma.client.$transaction(async (tx) => {
      // Detach association only — MediaAsset / S3 stay until orphan grace cleanup.
      await tx.productMedia.delete({ where: { id: mediaId } });
      if (media.isPrimary) {
        const remaining = await tx.productMedia.findMany({
          where: { productId: id },
          orderBy: { sortOrder: 'asc' },
          take: 1,
        });
        if (remaining[0]) {
          await tx.productMedia.update({
            where: { id: remaining[0].id },
            data: { isPrimary: true },
          });
        }
      }
      const refs = await tx.productMedia.count({
        where: { mediaAssetId: media.mediaAssetId },
      });
      await tx.mediaAsset.update({
        where: { id: media.mediaAssetId },
        data: { orphanedAt: refs === 0 ? new Date() : null },
      });
      await this.products.bumpVersion(id, tx);
      await this.recordAudit(tx, actor, 'PRODUCT_MEDIA_REMOVED', id, {
        mediaId,
        mediaAssetId: media.mediaAssetId,
      });
    });

    return this.finishAdminMutation(id);
  }

  async reorderMedia(
    id: string,
    input: ReorderProductMediaDto,
    actor: ActorContext,
  ): Promise<ProductAdminDto> {
    const product = await this.products.findById(id);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    const owned = new Set(product.media.map((media) => media.id));
    if (
      input.mediaIds.length !== owned.size ||
      input.mediaIds.some((mediaId) => !owned.has(mediaId))
    ) {
      throw new BadRequestException('mediaIds must list every image of this product exactly once');
    }

    await this.prisma.client.$transaction(async (tx) => {
      for (const [index, mediaId] of input.mediaIds.entries()) {
        await tx.productMedia.update({ where: { id: mediaId }, data: { sortOrder: index } });
      }
      await this.products.bumpVersion(id, tx);
      await this.recordAudit(tx, actor, 'PRODUCT_MEDIA_REORDERED', id, {
        order: input.mediaIds,
      });
    });

    return this.finishAdminMutation(id);
  }

  private async guardVersion(
    tx: Prisma.TransactionClient,
    id: string,
    expectedVersion: number,
    data: Prisma.ProductUncheckedUpdateManyInput = {},
  ): Promise<void> {
    const changed = await this.products.updateWithVersion(id, expectedVersion, data, tx);
    if (changed > 0) {
      return;
    }
    if (await this.products.exists(id, tx)) {
      throw new ConflictException(OCC_CONFLICT_MESSAGE);
    }
    throw new NotFoundException('Product not found');
  }

  private async assertReferencesExist(
    tx: Prisma.TransactionClient,
    kind: CatalogReference,
    ids: string[],
  ): Promise<void> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) {
      return;
    }
    const where = { id: { in: unique } };
    const counters: Record<CatalogReference, () => Promise<number>> = {
      occasion: () => tx.occasion.count({ where }),
      recipient: () => tx.recipient.count({ where }),
      color: () => tx.color.count({ where }),
      flower: () => tx.flower.count({ where }),
      bouquetSize: () => tx.bouquetSize.count({ where }),
      productLine: () => tx.productLine.count({ where }),
    };
    if ((await counters[kind]()) !== unique.length) {
      throw new BadRequestException(`Unknown ${kind} reference`);
    }
  }

  private recordAudit(
    tx: Prisma.TransactionClient,
    actor: ActorContext,
    action: AuditAction,
    entityId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.record(
      {
        actorAdminUserId: actor.actorId,
        action,
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

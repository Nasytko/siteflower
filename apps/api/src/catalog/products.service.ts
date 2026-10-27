import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  assertComponentFlowerRefXor,
  deriveCompositionKind,
  heightBandWhere,
  isHeightBandId,
  normalizeSlug,
  productKindNeedsComposition,
  productKindNeedsGiftSubtype,
  CANONICAL_LISTING_HUB_SLUGS,
  canonicalCatalogSlug,
  isCanonicalListingHub,
  isCatalogListingKind,
  resolveCatalogCategoryIdForProductKind,
  resolveStoredCompositionKind,
  suggestedListingKindForProductKind,
  type CatalogListingKind,
  type CompositionPrecision,
  type PaginatedResponse,
  type ProductAdminDto,
  type ProductKind,
  type ProductListItemDto,
  categoryPublicHref,
  evaluateProductDeleteImpact,
  resolveRelatedProductLink,
  type ProductDeleteImpactDto,
  type ProductPlacementDto,
  type ProductPlacementEntryDto,
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
import { CatalogCategoriesService } from './catalog-categories.service';
import { OCC_CONFLICT_MESSAGE, validatePublishRequirements } from './catalog.logic';
import { toProductAdminDto, toProductListItemDto, toProductPublicDto } from './catalog.mapper';
import { FlowerRefsService } from './flower-refs.service';
import { ProductFamiliesService } from './product-families.service';
import { lockProductRows } from './product-lock.util';
import {
  planVariantSync,
  VariantSyncError,
  type VariantSyncIncoming,
} from './product-editor.util';
import {
  allocateDuplicateSlug,
  buildDuplicateProductName,
} from './product-duplicate.util';
import type {
  CreateProductDto,
  DeleteProductDto,
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
import { mapPromotionPrismaError } from './promotions.service';
import {
  describeSeoLandingRules,
  flowerTypeSlugsFromRules,
} from './placement-match.util';
import { CatalogMatchService } from './catalog-match.service';
import {
  mergeListingIntoFilters,
  resolveCategoryListingFilters,
} from './catalog-listing.util';
import { SlugRedirectsService } from './slug-redirects.service';

type CatalogReference = 'occasion' | 'recipient' | 'color';

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
    private readonly categories: CatalogCategoriesService,
    private readonly flowerRefs: FlowerRefsService,
    private readonly families: ProductFamiliesService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
    private readonly revalidate: StorefrontRevalidateService,
    private readonly catalogMatch: CatalogMatchService,
  ) {}

  private async bumpStorefrontCache(productSlug?: string): Promise<void> {
    await this.revalidate.ping({
      tags: ['catalog', 'storefront', ...(productSlug ? [`product:${productSlug}`] : [])],
      paths: ['/', '/catalog/bouquets', ...(productSlug ? [`/products/${productSlug}`] : [])],
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

  /**
   * Same category-scope engine as the public storefront (hubs = ProductKind,
   * thematic = rules, flower leaves = ID resolve — never category-tree for hubs).
   */
  private async resolveCatalogFilters(query: {
    catalogCategoryId?: string;
    categorySlug?: string;
    flowerTypeId?: string[];
    flowerTypeSlug?: string[];
    flowerVarietyId?: string[];
    flowerVarietySlug?: string[];
    flowerOriginId?: string[];
    flowerOriginSlug?: string[];
    heightBand?: string;
    familyId?: string;
  }) {
    const heightCm =
      query.heightBand && isHeightBandId(query.heightBand)
        ? heightBandWhere(query.heightBand) ?? undefined
        : undefined;
    const base = {
      flowerTypeIds: query.flowerTypeId,
      flowerTypeSlugs: query.flowerTypeSlug,
      flowerVarietyIds: query.flowerVarietyId,
      flowerVarietySlugs: query.flowerVarietySlug,
      flowerOriginIds: query.flowerOriginId,
      flowerOriginSlugs: query.flowerOriginSlug,
      heightCm: heightCm ?? undefined,
      familyId: query.familyId,
    };

    if (query.catalogCategoryId) {
      const catalogCategoryIds = await this.categories.expandCategoryIds(
        query.catalogCategoryId,
      );
      return { ...base, catalogCategoryIds };
    }

    if (!query.categorySlug) {
      return base;
    }

    const requestedSlug = query.categorySlug;
    const resolvedSlug = canonicalCatalogSlug(requestedSlug);
    let row = await this.prisma.client.catalogCategory.findUnique({
      where: { slug: resolvedSlug },
    });
    if (!row && resolvedSlug !== requestedSlug) {
      row = await this.prisma.client.catalogCategory.findUnique({
        where: { slug: requestedSlug },
      });
    }
    if (!row) {
      // Fall back through SlugRedirect chain (post-rename aliases).
      const redirectTarget = await this.slugRedirects.resolveChain(
        'CATALOG_CATEGORY',
        requestedSlug,
      );
      for (const candidate of redirectTarget) {
        row = await this.prisma.client.catalogCategory.findUnique({ where: { slug: candidate } });
        if (row) break;
      }
    }
    if (!row) {
      return {
        ...base,
        catalogCategoryIds: ['00000000-0000-0000-0000-000000000000'],
      };
    }

    const listingKind =
      row.listingKind && isCatalogListingKind(row.listingKind) ? row.listingKind : null;
    const rules =
      row.rules && typeof row.rules === 'object' && !Array.isArray(row.rules)
        ? (row.rules as Record<string, unknown>)
        : null;

    const listing = await resolveCategoryListingFilters({
      category: {
        id: row.id,
        slug: row.slug,
        parentId: row.parentId,
        listingKind,
        pageKind: row.pageKind,
        rules,
      },
      catalogMatch: this.catalogMatch,
      expandCategoryIds: (id) => this.categories.expandCategoryIds(id),
      loadExcludeProductIds: async (pageId) => {
        const excludes = await this.prisma.client.catalogPageExclude.findMany({
          where: { pageId },
          select: { productId: true },
        });
        return excludes.map((e) => e.productId);
      },
    });

    return mergeListingIntoFilters(listing, base);
  }

  async list(query: ProductListQueryDto): Promise<PaginatedResponse<ProductListItemDto>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const now = new Date();
    const budgetRanges = query.budgetRangeIds?.length
      ? await this.budgetRanges.resolveBounds(query.budgetRangeIds)
      : [];
    const catalogFilters = await this.resolveCatalogFilters(query);
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
        componentColorIds: query.componentColorIds,
        componentColorSlugs: query.componentColorSlugs,
        compositionKinds: query.compositionKind,
        minFlowerTypeQuantity: query.minFlowerTypeQuantity,
        flowerTypeQuantitySlug: query.flowerTypeQuantitySlug,
        flowerSlugs: query.flowerSlugs,
        bestsellerGroupIds: query.bestsellerGroupIds,
        promotionalOnly: query.promotionalOnly,
        budgetRanges,
        productKinds: query.productKind ? [query.productKind] : undefined,
        ...catalogFilters,
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
    const familyId = product.familyMember?.family.id;
    const family = familyId
      ? await this.families.getDto(familyId, this.urlFor, product.id)
      : null;
    return toProductAdminDto(product, this.urlFor, new Date(), family);
  }

  async preview(id: string): Promise<ProductPublicDto> {
    const product = await this.products.findById(id);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    const familyId = product.familyMember?.family.id;
    const family = familyId
      ? await this.families.getDto(familyId, this.urlFor, product.id)
      : null;
    return toProductPublicDto(product, this.urlFor, new Date(), family);
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
      await this.assertReferencesExist(tx, 'occasion', input.occasionIds ?? []);
      await this.assertReferencesExist(tx, 'recipient', input.recipientIds ?? []);
      await this.assertReferencesExist(tx, 'color', input.colorIds ?? []);

      const kind: ProductKind = input.productKind ?? 'BOUQUET';
      const hubCategoryId = await this.resolveEditorCatalogCategoryId(tx, kind, null);

      const product = await this.products.create(
        {
          name,
          slug,
          shortDescription: input.shortDescription
            ? trimmedOrNull(input.shortDescription)
            : null,
          description: input.description ? trimmedOrNull(input.description) : null,
          lifecycle: 'DRAFT',
          productKind: kind,
          ...(hubCategoryId
            ? { catalogCategory: { connect: { id: hubCategoryId } } }
            : {}),
          ...(input.availability ? { availability: input.availability } : {}),
          ...(input.heightCm === undefined ? {} : { bouquetHeightCm: input.heightCm }),
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
      } else {
        await this.products.replaceVariants(
          product.id,
          [
            {
              name: 'Стандарт',
              priceMinor: 0n,
              sortOrder: 0,
              status: 'ACTIVE',
            },
          ],
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
          badgeLabel: source.badgeLabel,
          bouquetHeightCm: source.bouquetHeightCm,
          lifecycle: 'DRAFT',
          availability: source.availability,
          currency: source.currency,
          seoTitle: source.seoTitle,
          seoDescription: source.seoDescription,
          noIndex: source.noIndex,
          // Copy structured catalog attrs; never auto-join ProductFamily (explicit manager action).
          ...(source.catalogCategoryId
            ? { catalogCategory: { connect: { id: source.catalogCategoryId } } }
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
        const flowerItemIds = source.components.map((component) => component.flowerItemId);
        // Duplicate = new assignment. Archived FlowerItems cannot be copied onto the new draft.
        // Existing source product keeps its archived composition (policy: archive does not break live products).
        try {
          await this.flowerRefs.assertFlowerItemsAssignable(flowerItemIds);
        } catch (err) {
          if (err instanceof BadRequestException) {
            throw new ConflictException(
              'Нельзя дублировать товар: в составе есть архивный цветок. Восстановите цветок или замените его в составе, затем повторите.',
            );
          }
          throw err;
        }
        await this.products.replaceComponents(
          product.id,
          source.components.map((component) => ({
            flowerItemId: component.flowerItemId,
            colorId: component.colorId,
            role: component.role,
            displayName: component.displayName,
            quantity: component.quantity,
            unit: component.unit,
            sortOrder: component.sortOrder,
          })),
          tx,
        );
      }

      await tx.product.update({
        where: { id: product.id },
        data: {
          productKind: source.productKind,
          compositionKind: resolveStoredCompositionKind(
            source.productKind,
            source.compositionKind,
          ),
          compositionPrecision: productKindNeedsComposition(source.productKind)
            ? source.compositionPrecision
            : 'UNKNOWN',
          // diameterCm: copy for data continuity until column drop migration.
          diameterCm: source.diameterCm,
        },
      });

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
      const data: Prisma.ProductUncheckedUpdateManyInput = {
        ...(input.name === undefined ? {} : { name: input.name.trim() }),
        ...(slugChanged ? { slug: nextSlug } : {}),
        ...(input.shortDescription === undefined
          ? {}
          : { shortDescription: trimmedOrNull(input.shortDescription) }),
        ...(input.badgeLabel === undefined
          ? {}
          : { badgeLabel: trimmedOrNull(input.badgeLabel) }),
        ...(input.description === undefined
          ? {}
          : { description: trimmedOrNull(input.description) }),
        ...(input.availability === undefined ? {} : { availability: input.availability }),
        ...(input.heightCm === undefined ? {} : { bouquetHeightCm: input.heightCm }),
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

  private async syncProductVariants(
    tx: Prisma.TransactionClient,
    productId: string,
    incoming: VariantSyncIncoming[],
    mode: 'keep-unmentioned' | 'replace',
  ): Promise<void> {
    const existing = await tx.productVariant.findMany({
      where: { productId },
      select: { id: true, sortOrder: true },
    });
    try {
      const plan = planVariantSync(existing, incoming, mode);
      await this.products.applyVariantPlan(productId, plan, tx);
    } catch (err) {
      if (err instanceof VariantSyncError) {
        throw new BadRequestException(
          err.code === 'FOREIGN_VARIANT'
            ? 'Вариант не принадлежит этому товару'
            : 'Повторяющийся идентификатор варианта',
        );
      }
      throw err;
    }
  }

  /**
   * Atomic product-editor save: one OCC check, one transaction, one version bump.
   * Variants are updated by id. Promotion and bestseller fields on the DTO are
   * ignored so a stale card cannot overwrite those modules.
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

    const previousFlowerItemIds = new Set(
      product.components.map((component) => component.flowerItemId),
    );
    const nextKind: ProductKind = input.productKind ?? product.productKind;
    const needsComposition = productKindNeedsComposition(nextKind);
    const componentsForSave = needsComposition ? input.components : [];
    const normalizedComposition = await this.normalizeCompositionComponents(componentsForSave, {
      previouslyAssignedFlowerItemIds: previousFlowerItemIds,
      compositionPrecision: needsComposition
        ? (input.compositionPrecision ??
          (componentsForSave.length === 0 ? 'UNKNOWN' : product.compositionPrecision))
        : 'UNKNOWN',
    });

    await this.prisma.client.$transaction(async (tx) => {
      const resolvedCategoryId = await this.resolveEditorCatalogCategoryId(
        tx,
        nextKind,
        input.catalogCategoryId === undefined
          ? product.catalogCategoryId
          : input.catalogCategoryId,
      );

      const data: Prisma.ProductUncheckedUpdateManyInput = {
        name: input.name.trim(),
        slug: nextSlug,
        shortDescription: trimmedOrNull(input.shortDescription ?? null),
        description: trimmedOrNull(input.description ?? null),
        ...(input.badgeLabel === undefined
          ? {}
          : { badgeLabel: trimmedOrNull(input.badgeLabel) }),
        availability: input.availability,
        bouquetHeightCm: input.heightCm === undefined ? product.bouquetHeightCm : input.heightCm,
        productKind: nextKind,
        // diameterCm intentionally not updated from editor (deprecated UI field).
        compositionKind: resolveStoredCompositionKind(
          nextKind,
          needsComposition ? normalizedComposition.compositionKind : 'UNKNOWN',
        ),
        compositionPrecision: needsComposition
          ? normalizedComposition.compositionPrecision
          : 'UNKNOWN',
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
        catalogCategoryId: resolvedCategoryId,
      };
      await this.assertReferencesExist(tx, 'occasion', input.occasionIds);
      await this.assertReferencesExist(tx, 'recipient', input.recipientIds);
      await this.assertReferencesExist(tx, 'color', input.colorIds);

      if (nextSlug !== product.slug) {
        await this.slugRedirects.record(tx, 'PRODUCT', product.slug, nextSlug);
      }

      // Single OCC bump for the whole editor snapshot. The update locks the product
      // row before variants are read, so a concurrent delete waits.
      await this.guardVersion(tx, id, input.expectedVersion, data);

      await this.syncProductVariants(
        tx,
        id,
        input.variants.map((variant, index) => ({
          id: variant.id,
          name: variant.name.trim(),
          priceMinor: BigInt(variant.priceMinor),
          sortOrder: variant.sortOrder ?? index,
          status: variant.status ?? 'ACTIVE',
        })),
        'keep-unmentioned',
      );

      await this.products.replaceComponents(id, normalizedComposition.rows, tx);

      await this.products.replaceOccasions(id, input.occasionIds, tx);
      await this.products.replaceRecipients(id, input.recipientIds, tx);
      await this.products.replaceColors(id, input.colorIds, tx);
      if (input.traitKeys !== undefined) {
        await this.replaceTraitsByKeys(tx, id, input.traitKeys);
      }

      if (input.familyId !== undefined) {
        await this.families.setProductFamilyInTx(
          tx,
          id,
          input.familyId,
          input.familyMemberSortOrder,
        );
      }

      await this.recordAudit(tx, actor, 'PRODUCT_UPDATED', id, {
        editor: true,
        fields: Object.keys(data),
        variants: input.variants.length,
        components: input.components.length,
        merchandising: 'unchanged',
        familyId: input.familyId === undefined ? undefined : input.familyId,
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
      await this.syncProductVariants(
        tx,
        id,
        input.variants.map((variant, index) => ({
          id: variant.id,
          name: variant.name.trim(),
          priceMinor: BigInt(variant.priceMinor),
          sortOrder: variant.sortOrder ?? index,
          status: variant.status ?? 'ACTIVE',
        })),
        'replace',
      );
      await this.recordAudit(tx, actor, 'PRODUCT_VARIANT_CHANGED', id, {
        count: input.variants.length,
      });
    });

    return this.finishAdminMutation(id);
  }

  /**
   * Composition source of truth: ProductComponent → FlowerItem (+ quantity/unit).
   */
  async setComponents(
    id: string,
    input: SetProductComponentsDto,
    actor: ActorContext,
  ): Promise<ProductAdminDto> {
    const product = await this.products.findById(id);
    if (!product) throw new NotFoundException('Product not found');
    const previousFlowerItemIds = new Set(
      product.components.map((component) => component.flowerItemId),
    );
    const normalizedComposition = await this.normalizeCompositionComponents(input.components, {
      previouslyAssignedFlowerItemIds: previousFlowerItemIds,
    });
    const compositionKind = resolveStoredCompositionKind(
      product.productKind,
      normalizedComposition.compositionKind,
    );

    await this.prisma.client.$transaction(async (tx) => {
      await this.guardVersion(tx, id, input.expectedVersion, {
        compositionKind,
        compositionPrecision: normalizedComposition.compositionPrecision,
      });
      await this.products.replaceComponents(id, normalizedComposition.rows, tx);
      await this.recordAudit(tx, actor, 'PRODUCT_UPDATED', id, {
        components: normalizedComposition.rows.length,
        flowerItems: normalizedComposition.rows.length,
        compositionKind,
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
      await this.guardVersion(tx, id, input.expectedVersion);

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
      requiresComposition: productKindNeedsComposition(product.productKind),
      hasCompositionFlowerItem: product.components.some((row) => Boolean(row.flowerItemId)),
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

  async restore(
    id: string,
    expectedVersion: number,
    actor: ActorContext,
  ): Promise<ProductAdminDto> {
    const product = await this.products.findById(id);
    if (!product) throw new NotFoundException('Product not found');
    if (product.lifecycle !== 'ARCHIVED') {
      throw new BadRequestException('Восстановить можно только архивный товар');
    }
    await this.prisma.client.$transaction(async (tx) => {
      await this.guardVersion(tx, id, expectedVersion, {
        lifecycle: 'DRAFT',
        publishAt: null,
        unpublishAt: null,
      });
      await this.recordAudit(tx, actor, 'PRODUCT_RESTORED', id, { previousLifecycle: 'ARCHIVED' });
    });
    return this.finishAdminMutation(id);
  }

  async getDeleteImpact(id: string): Promise<ProductDeleteImpactDto> {
    const product = await this.products.findById(id);
    if (!product) throw new NotFoundException('Product not found');
    return this.buildDeleteImpact(id, product.name, product.slug);
  }

  async removePermanently(
    id: string,
    input: DeleteProductDto,
    actor: ActorContext,
  ): Promise<{ deleted: true; id: string; slug: string }> {
    const product = await this.products.findById(id);
    if (!product) throw new NotFoundException('Product not found');
    if (product.version !== input.expectedVersion) {
      throw new ConflictException('Товар изменён в другом окне');
    }
    if (input.confirmName.trim() !== product.name.trim()) {
      throw new BadRequestException('Введите точное название товара для подтверждения удаления');
    }

    const impact = await this.buildDeleteImpact(id, product.name, product.slug);
    if (!impact.canDelete) {
      throw new BadRequestException({
        message: impact.blockers[0]?.message ?? 'Удаление запрещено',
        error: 'CatalogDeleteBlocked',
        code: 'HAS_ORDERS',
        ordersCount: impact.blockers[0]?.count,
        blockers: impact.blockers,
        detachable: impact.detachable,
      });
    }
    if (impact.detachable.length > 0 && !input.detach) {
      throw new BadRequestException({
        message: 'Сначала подтвердите отвязку связанных записей',
        error: 'CatalogDeleteNeedsDetach',
        code: 'NEEDS_DETACH',
        blockers: impact.blockers,
        detachable: impact.detachable,
      });
    }

    let slug = product.slug;

    await this.prisma.client.$transaction(
      async (tx) => {
        const locked = await lockProductRows(tx, [id]);
        if (!locked.includes(id)) {
          throw new NotFoundException('Product not found');
        }
        const current = await tx.product.findUnique({
          where: { id },
          include: { media: { select: { mediaAssetId: true } } },
        });
        if (!current) {
          throw new NotFoundException('Product not found');
        }
        if (current.version !== input.expectedVersion) {
          throw new ConflictException('Товар изменён в другом окне');
        }
        if (input.confirmName.trim() !== current.name.trim()) {
          throw new BadRequestException('Введите точное название товара для подтверждения удаления');
        }
        const orderItemsCount = await tx.orderItem.count({ where: { productId: id } });
        if (orderItemsCount > 0) {
          throw new BadRequestException({
            message: 'У товара есть заказы. Удаление запрещено, история заказов сохраняется.',
            error: 'CatalogDeleteBlocked',
            code: 'HAS_ORDERS',
            ordersCount: orderItemsCount,
          });
        }

        slug = current.slug;
        const mediaAssetIds = [...new Set(current.media.map((row) => row.mediaAssetId))];
        await tx.product.delete({ where: { id } });
        for (const mediaAssetId of mediaAssetIds) {
          const productRefs = await tx.productMedia.count({ where: { mediaAssetId } });
          const navRefs = await tx.navigationMenuItem.count({ where: { mediaAssetId } });
          await tx.mediaAsset.update({
            where: { id: mediaAssetId },
            data: { orphanedAt: productRefs + navRefs === 0 ? new Date() : null },
          });
        }
        await this.recordAudit(tx, actor, 'PRODUCT_DELETED', id, {
          name: current.name,
          slug,
          detached: impact.detachable.map((row) => row.code),
        });
      },
      { timeout: 15_000 },
    );

    await this.bumpStorefrontCache(slug);
    return { deleted: true, id, slug };
  }

  async suggestRelatedProducts(id: string): Promise<
    Array<{
      id: string;
      name: string;
      slug: string;
      heightCm: number | null;
      priceMinor: string | null;
      alreadyLinked: boolean;
    }>
  > {
    const product = await this.products.findById(id);
    if (!product) throw new NotFoundException('Product not found');
    const seed =
      product.components.find((row) => row.role === 'PRIMARY')?.flowerItem ??
      product.components[0]?.flowerItem;
    if (!seed) return [];

    const familyId = product.familyMember?.familyId ?? null;
    const rows = await this.prisma.client.product.findMany({
      where: {
        id: { not: id },
        lifecycle: { not: 'ARCHIVED' },
        components: {
          some: {
            flowerItem: {
              flowerTypeId: seed.flowerTypeId,
              flowerFormId: seed.flowerFormId,
              flowerVarietyId: seed.flowerVarietyId,
            },
          },
        },
      },
      take: 8,
      orderBy: { updatedAt: 'desc' },
      include: {
        variants: { where: { status: 'ACTIVE' }, orderBy: { sortOrder: 'asc' }, take: 1 },
        familyMember: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      heightCm: row.bouquetHeightCm,
      priceMinor: row.variants[0] ? row.variants[0].priceMinor.toString() : null,
      alreadyLinked: Boolean(familyId && row.familyMember?.familyId === familyId),
    }));
  }

  async linkRelatedProduct(
    id: string,
    relatedProductId: string,
    actor: ActorContext,
  ): Promise<ProductAdminDto> {
    if (id === relatedProductId) {
      throw new BadRequestException('Нельзя связать товар с самим собой');
    }
    const [left, right] = await Promise.all([
      this.products.findById(id),
      this.products.findById(relatedProductId),
    ]);
    if (!left || !right) throw new NotFoundException('Product not found');

    const decision = resolveRelatedProductLink(
      left.familyMember?.familyId,
      right.familyMember?.familyId,
    );
    if (decision.type === 'conflict') {
      throw new ConflictException(
        'Товары уже входят в разные линейки. Снимите одну из связей, затем свяжите заново.',
      );
    }

    await this.prisma.client.$transaction(async (tx) => {
      let familyId = decision.type === 'create' ? '' : decision.familyId;
      if (decision.type === 'create') {
        const created = await tx.productFamily.create({
          data: { name: `${left.name} / ${right.name}`.slice(0, 200) },
        });
        familyId = created.id;
      }
      await this.families.setProductFamilyInTx(tx, id, familyId);
      await this.families.setProductFamilyInTx(tx, relatedProductId, familyId);
      await this.recordAudit(tx, actor, 'PRODUCT_UPDATED', id, {
        relatedProductId,
        familyId,
        related: 'link',
      });
    });

    return this.finishAdminMutation(id);
  }

  async unlinkRelatedProduct(
    id: string,
    relatedProductId: string,
    actor: ActorContext,
  ): Promise<ProductAdminDto> {
    const product = await this.products.findById(id);
    if (!product) throw new NotFoundException('Product not found');
    const familyId = product.familyMember?.familyId;
    if (!familyId) {
      throw new BadRequestException('У товара нет связанных карточек');
    }

    await this.prisma.client.$transaction(async (tx) => {
      await this.families.setProductFamilyInTx(tx, relatedProductId, null);
      const remaining = await tx.productFamilyMember.count({ where: { familyId } });
      if (remaining <= 1) {
        await tx.productFamilyMember.deleteMany({ where: { familyId } });
        await tx.productFamily.delete({ where: { id: familyId } });
      }
      await this.recordAudit(tx, actor, 'PRODUCT_UPDATED', id, {
        relatedProductId,
        related: 'unlink',
      });
    });

    return this.finishAdminMutation(id);
  }

  private async buildDeleteImpact(
    id: string,
    name: string,
    slug: string,
  ): Promise<ProductDeleteImpactDto> {
    const [
      orderItemsCount,
      familyMembersCount,
      promotionCount,
      bestsellerLinksCount,
      catalogPinsCount,
      catalogExcludeCount,
      seoPinsCount,
      seoExcludeCount,
      mediaCount,
    ] = await Promise.all([
      this.prisma.client.orderItem.count({ where: { productId: id } }),
      this.countOtherFamilyMembers(id),
      this.prisma.client.productPromotion.count({ where: { productId: id } }),
      this.prisma.client.bestsellerGroupProduct.count({ where: { productId: id } }),
      this.prisma.client.catalogPageProduct.count({ where: { productId: id } }),
      this.prisma.client.catalogPageExclude.count({ where: { productId: id } }),
      this.prisma.client.seoLandingPageProduct.count({ where: { productId: id } }),
      this.prisma.client.seoLandingPageExclude.count({ where: { productId: id } }),
      this.prisma.client.productMedia.count({ where: { productId: id } }),
    ]);

    return evaluateProductDeleteImpact({
      productId: id,
      name,
      slug,
      orderItemsCount,
      familyMembersCount,
      hasPromotion: promotionCount > 0,
      bestsellerLinksCount,
      catalogPinsCount: catalogPinsCount + catalogExcludeCount + seoPinsCount + seoExcludeCount,
      mediaCount,
    });
  }

  private async familyIdsFor(productId: string): Promise<string[]> {
    const member = await this.prisma.client.productFamilyMember.findUnique({
      where: { productId },
      select: { familyId: true },
    });
    return member ? [member.familyId] : [];
  }

  private async countOtherFamilyMembers(productId: string): Promise<number> {
    const familyIds = await this.familyIdsFor(productId);
    if (familyIds.length === 0) return 0;
    return this.prisma.client.productFamilyMember.count({
      where: { familyId: { in: familyIds }, productId: { not: productId } },
    });
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
      const productRefs = await tx.productMedia.count({
        where: { mediaAssetId: media.mediaAssetId },
      });
      const navRefs = await tx.navigationMenuItem.count({
        where: { mediaAssetId: media.mediaAssetId },
      });
      await tx.mediaAsset.update({
        where: { id: media.mediaAssetId },
        data: { orphanedAt: productRefs + navRefs === 0 ? new Date() : null },
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

  /**
   * Normalize composition rows: require FlowerItem; block newly assigned HIDDEN items.
   */
  private async normalizeCompositionComponents(
    components: Array<{
      flowerItemId: string;
      colorId?: string | null;
      role?: 'PRIMARY' | 'GREENERY' | 'FILLER' | 'OTHER';
      displayName: string;
      quantity?: number | null;
      unit?: 'PIECE' | 'STEM' | 'BUNCH' | 'UNSPECIFIED';
      sortOrder?: number;
    }>,
    options?: {
      previouslyAssignedFlowerItemIds?: ReadonlySet<string>;
      compositionPrecision?: CompositionPrecision;
    },
  ): Promise<{
    rows: Array<{
      flowerItemId: string;
      colorId: string | null;
      role: 'PRIMARY' | 'GREENERY' | 'FILLER' | 'OTHER';
      displayName: string;
      quantity: number | null;
      unit: 'PIECE' | 'STEM' | 'BUNCH' | 'UNSPECIFIED';
      sortOrder: number;
    }>;
    compositionKind: 'MONO' | 'MIXED' | 'UNKNOWN';
    compositionPrecision: CompositionPrecision;
  }> {
    const previous = options?.previouslyAssignedFlowerItemIds ?? new Set<string>();
    const precision: CompositionPrecision =
      options?.compositionPrecision ??
      (components.length === 0 ? 'UNKNOWN' : 'EXACT');

    const normalized = components.map((component, index) => {
      let flowerItemId: string;
      try {
        flowerItemId = assertComponentFlowerRefXor({
          flowerItemId: component.flowerItemId,
        }).flowerItemId;
      } catch {
        throw new BadRequestException(
          'Строка состава должна ссылаться на позицию справочника (FlowerItem)',
        );
      }
      const displayName = component.displayName.trim();
      if (!displayName) {
        throw new BadRequestException('Укажите название строки состава');
      }
      const role = component.role ?? 'PRIMARY';
      const quantity = component.quantity ?? null;
      if (precision === 'EXACT' && role === 'PRIMARY' && (quantity == null || quantity < 1)) {
        throw new BadRequestException(
          'При точном составе укажите количество для каждого основного цветка',
        );
      }
      return {
        flowerItemId,
        colorId: component.colorId ?? null,
        role,
        displayName,
        quantity,
        unit: component.unit ?? 'UNSPECIFIED',
        sortOrder: component.sortOrder ?? index,
      };
    });

    const flowerItemIds = normalized.map((row) => row.flowerItemId);
    if (flowerItemIds.length > 0) {
      await this.flowerRefs.assertFlowerItemsAssignable(flowerItemIds, previous);
    }

    const items =
      flowerItemIds.length > 0
        ? await this.prisma.client.flowerItem.findMany({
            where: { id: { in: flowerItemIds } },
            select: { id: true, flowerTypeId: true, colorId: true },
          })
        : [];
    const typeByItem = new Map(items.map((item) => [item.id, item.flowerTypeId]));
    const colorByItem = new Map(items.map((item) => [item.id, item.colorId]));

    // Snapshot dictionary color onto the component when the client omits it
    // (historical rows / incomplete drafts). Does not rewrite order line items.
    const rowsWithColor = normalized.map((row) => ({
      ...row,
      colorId: row.colorId ?? colorByItem.get(row.flowerItemId) ?? null,
    }));

    const colorIds = [
      ...new Set(rowsWithColor.map((row) => row.colorId).filter((id): id is string => Boolean(id))),
    ];
    if (colorIds.length > 0) {
      const colorCount = await this.prisma.client.color.count({
        where: { id: { in: colorIds } },
      });
      if (colorCount !== colorIds.length) {
        throw new BadRequestException('Unknown color reference in composition');
      }
    }

    const compositionKind = deriveCompositionKind(
      rowsWithColor.map((row) => ({
        role: row.role,
        typeId: typeByItem.get(row.flowerItemId) ?? null,
      })),
    );

    return { rows: rowsWithColor, compositionKind, compositionPrecision: precision };
  }

  /**
   * ProductKind is SSoT for commercial type. catalogCategoryId is compatibility glue:
   * - Non-gifts: always canonical hub (never a merchandising leaf from the editor).
   * - Gifts: keep subtype under GIFTS tree when provided; else canonical hub.
   * Public hub PLPs ignore category and filter by productKind alone.
   */
  private async resolveEditorCatalogCategoryId(
    tx: Prisma.TransactionClient,
    productKind: ProductKind,
    requestedId: string | null | undefined,
  ): Promise<string | null> {
    const suggested = suggestedListingKindForProductKind(productKind);
    const hubId = await this.categories.findCanonicalHubId(suggested, tx);

    if (!requestedId) {
      return resolveCatalogCategoryIdForProductKind({
        productKind,
        requestedId: null,
        hubId,
        requestedListingKind: null,
      });
    }

    const category = await tx.catalogCategory.findUnique({ where: { id: requestedId } });
    if (!category) throw new BadRequestException('Catalog category not found');

    const listingKind =
      category.listingKind && isCatalogListingKind(category.listingKind)
        ? category.listingKind
        : null;

    return resolveCatalogCategoryIdForProductKind({
      productKind,
      requestedId: category.id,
      hubId,
      requestedListingKind: listingKind,
    });
  }

  /**
   * Storefront placements for the admin editor («Где отображается товар»).
   * Hub + gift subtype + thematic catalog pages (same filter engine as public listing).
   */
  async getPlacement(id: string): Promise<ProductPlacementDto> {
    const product = await this.products.findById(id);
    if (!product) throw new NotFoundException('Product not found');

    const entries: ProductPlacementEntryDto[] = [];
    const listingKind = suggestedListingKindForProductKind(product.productKind);
    const hubSlug = CANONICAL_LISTING_HUB_SLUGS[listingKind];
    const productLive = product.lifecycle === 'PUBLISHED';

    if (hubSlug) {
      const hub = await this.prisma.client.catalogCategory.findFirst({
        where: { slug: hubSlug, listingKind },
      });
      if (hub) {
        const hubHidden = hub.visibility === 'HIDDEN';
        entries.push({
          kind: 'HUB',
          section: 'main',
          title: hub.name,
          path: categoryPublicHref(hub.slug),
          status: hubHidden ? 'HIDDEN' : productLive ? 'LIVE' : 'DRAFT_PRODUCT',
          matchReason: `Тип товара → раздел «${hub.name}»`,
          note: hubHidden
            ? 'Раздел скрыт'
            : productLive
              ? 'На сайте'
              : 'Товар ещё не опубликован',
        });
      }
    }

    if (
      productKindNeedsGiftSubtype(product.productKind) &&
      product.catalogCategoryId &&
      product.catalogCategory
    ) {
      const cat = product.catalogCategory;
      const isHub = isCanonicalListingHub({
        slug: cat.slug,
        listingKind: (cat.listingKind as CatalogListingKind | null) ?? null,
      });
      if (!isHub && cat.listingKind === 'GIFTS') {
        entries.push({
          kind: 'GIFT_SUBTYPE',
          section: 'main',
          title: cat.name,
          path: categoryPublicHref(cat.slug),
          status:
            cat.visibility === 'HIDDEN'
              ? 'HIDDEN'
              : productLive
                ? 'LIVE'
                : 'DRAFT_PRODUCT',
          matchReason: 'Подтип подарка',
          note:
            cat.visibility === 'HIDDEN'
              ? 'Подтип скрыт'
              : productLive
                ? 'На сайте'
                : 'Товар ещё не опубликован',
        });
      }
    }

    const needsComposition = productKindNeedsComposition(product.productKind);
    const primaryComponents = product.components.filter(
      (c) => c.role === 'PRIMARY' && (c.quantity == null || c.quantity > 0),
    );
    if (needsComposition && primaryComponents.length === 0) {
      entries.push({
        kind: 'INSUFFICIENT_DATA',
        section: 'insufficient',
        title: 'Недостаточно данных для тематических страниц',
        path: null,
        status: 'MISSING',
        matchReason: 'Добавьте основные цветы в состав',
        note: 'Без состава нельзя определить «с розами» / «из роз» / моно',
      });
    }

    const pages = await this.prisma.client.catalogCategory.findMany({
      where: {
        pageKind: 'THEMATIC',
        visibility: 'VISIBLE',
        OR: [{ pageStatus: 'PUBLISHED' }, { pageStatus: 'DRAFT' }, { pageStatus: null }],
      },
      include: {
        pinnedProducts: { select: { productId: true } },
        excludedProducts: { select: { productId: true } },
      },
      orderBy: { name: 'asc' },
    });

    const now = new Date();
    const coveredTypeSlugs = new Set<string>();
    const pageEntries = await Promise.all(
      pages.map(async (page): Promise<ProductPlacementEntryDto | null> => {
        const path = categoryPublicHref(page.slug);
        const rules = (page.rules ?? {}) as Prisma.JsonValue;
        const matchReason = describeSeoLandingRules(rules);
        const ruleTypeSlugs = flowerTypeSlugsFromRules(rules);
        const excluded = page.excludedProducts.some((row) => row.productId === id);
        if (excluded) {
          return {
            kind: 'CATALOG_PAGE',
            section: 'draft',
            title: page.name,
            path,
            status: 'EXCLUDED',
            matchReason,
            landingId: page.id,
            note: 'Товар исключён из этой страницы',
          };
        }

        const pinned = page.pinnedProducts.some((row) => row.productId === id);
        let matches = pinned;
        if (!matches) {
          const { filters, blocking } = await this.catalogMatch.resolveRulesToFilters(rules);
          if ((Object.keys(filters).length === 0 || blocking) && !pinned) return null;
          if (blocking) return null;
          const { total } = await this.products.list({
            filters: {
              ...filters,
              includeProductIds: [id],
            },
            skip: 0,
            take: 1,
            sort: 'recommended',
            now,
          });
          matches = total > 0;
        }
        if (!matches) return null;

        for (const slug of ruleTypeSlugs) coveredTypeSlugs.add(slug);

        const pagePublished = page.pageStatus === 'PUBLISHED';
        if (!pagePublished) {
          return {
            kind: 'CATALOG_PAGE',
            section: 'draft',
            title: page.name,
            path,
            status: 'DRAFT_LANDING',
            matchReason: pinned ? `${matchReason} · закреплён` : matchReason,
            landingId: page.id,
            note: 'Не опубликовано',
          };
        }
        if (!productLive) {
          return {
            kind: 'CATALOG_PAGE',
            section: 'draft',
            title: page.name,
            path,
            status: 'DRAFT_PRODUCT',
            matchReason: pinned ? `${matchReason} · закреплён` : matchReason,
            landingId: page.id,
            note: 'Товар ещё не опубликован',
          };
        }
        return {
          kind: 'CATALOG_PAGE',
          section: 'published',
          title: page.name,
          path,
          status: 'LIVE',
          matchReason: pinned ? `${matchReason} · закреплён` : matchReason,
          landingId: page.id,
          note: 'На сайте',
        };
      }),
    );
    for (const entry of pageEntries) {
      if (entry) entries.push(entry);
    }

    // Reliable recommendations: PRIMARY flower types with no thematic page covering that slug.
    if (
      (product.productKind === 'BOUQUET' || product.productKind === 'COMPOSITION') &&
      primaryComponents.length > 0
    ) {
      const primaryTypes = new Map<string, string>();
      for (const component of primaryComponents) {
        const type = component.flowerItem?.flowerType;
        if (type?.slug && type.name) primaryTypes.set(type.slug, type.name);
      }
      for (const [slug, name] of primaryTypes) {
        if (coveredTypeSlugs.has(slug)) continue;
        const genitive = name.toLowerCase();
        entries.push({
          kind: 'RECOMMENDED',
          section: 'recommended',
          title: `Страница «с ${genitive}»`,
          path: null,
          status: 'MISSING',
          matchReason: `В составе есть «${name}», но опубликованной страницы с этим видом ещё нет`,
          note: 'Страница не создана',
        });
      }
    }

    return {
      productId: id,
      productKind: product.productKind,
      entries,
    };
  }

  private async replaceTraitsByKeys(
    tx: Prisma.TransactionClient,
    productId: string,
    traitKeys: string[],
  ): Promise<void> {
    const unique = [...new Set(traitKeys.map((k) => k.trim()).filter(Boolean))];
    if (unique.length === 0) {
      await this.products.replaceTraits(productId, [], tx);
      return;
    }
    const defs = await tx.productTraitDefinition.findMany({
      where: { key: { in: unique }, visibility: 'VISIBLE' },
      select: { id: true, key: true },
    });
    if (defs.length !== unique.length) {
      const found = new Set(defs.map((d) => d.key));
      const missing = unique.filter((k) => !found.has(k));
      throw new BadRequestException(`Неизвестный признак: ${missing.join(', ')}`);
    }
    await this.products.replaceTraits(
      productId,
      defs.map((d) => d.id),
      tx,
    );
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

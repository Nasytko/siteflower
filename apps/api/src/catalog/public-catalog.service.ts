import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  gateListingFiltersByEnabledKeys,
  heightBandWhere,
  isHeightBandId,
  type BestsellerGroupPublicDto,
  type BouquetSizePublicDto,
  type BudgetRangePublicDto,
  type PaginatedResponse,
  type ProductListItemDto,
  type ProductResolveDto,
  type SitemapEntryDto,
  type TaxonomyPublicDto,
  type TaxonomyRefDto,
} from '@bouquet-one/contracts';
import type { Prisma } from '@bouquet-one/database';
import { PrismaService } from '../database/prisma.service';
import { MediaService } from '../media/media.service';
import { BestsellersService } from './bestsellers.service';
import { BudgetRangesService } from './budget-ranges.service';
import { CatalogCategoriesService } from './catalog-categories.service';
import { CatalogFiltersService } from './catalog-filters.service';
import { isEffectivelyPublished } from './catalog.logic';
import {
  PRODUCT_INCLUDE,
  toBouquetSizePublicDto,
  toProductListItemDto,
  toProductPublicDto,
  toTaxonomyPublicDto,
  toTaxonomyRef,
  type TaxonomyRecord,
} from './catalog.mapper';
import { FlowerRefsService } from './flower-refs.service';
import { ProductFamiliesService } from './product-families.service';
import type { PublicProductListQueryDto } from './products.dto';
import { effectivelyPublishedWhere, ProductsRepository } from './products.repository';
import { PromotionsService } from './promotions.service';
import { SlugRedirectsService } from './slug-redirects.service';

/** Landing-page taxonomies (bouquet size resolves for filter labels, not SEO pages). */
const PUBLIC_TAXONOMY_KINDS = [
  'flower',
  'occasion',
  'recipient',
  'color',
  'bouquet_size',
] as const;

type PublicTaxonomyKind = (typeof PUBLIC_TAXONOMY_KINDS)[number];

function isPublicTaxonomyKind(value: string): value is PublicTaxonomyKind {
  return (PUBLIC_TAXONOMY_KINDS as readonly string[]).includes(value);
}

type ColorPublicDto = TaxonomyRefDto & { swatch: string | null };

@Injectable()
export class PublicCatalogService {
  constructor(
    private readonly products: ProductsRepository,
    private readonly bestsellers: BestsellersService,
    private readonly budgetRanges: BudgetRangesService,
    private readonly categories: CatalogCategoriesService,
    private readonly catalogFilters: CatalogFiltersService,
    private readonly flowerRefs: FlowerRefsService,
    private readonly families: ProductFamiliesService,
    private readonly promotions: PromotionsService,
    private readonly slugRedirects: SlugRedirectsService,
    private readonly media: MediaService,
    private readonly prisma: PrismaService,
  ) {}

  private readonly urlFor = (storageKey: string) => this.media.getPublicUrl(storageKey);

  private async resolveCatalogFilters(query: PublicProductListQueryDto) {
    let catalogCategoryIds: string[] | undefined;
    if (query.catalogCategoryId) {
      catalogCategoryIds = await this.categories.expandCategoryIds(query.catalogCategoryId, {
        visibleOnly: true,
      });
    } else if (query.categorySlug) {
      try {
        const category = await this.categories.getBySlug(query.categorySlug);
        catalogCategoryIds = await this.categories.expandCategoryIds(category.id, {
          visibleOnly: true,
        });
      } catch {
        catalogCategoryIds = ['00000000-0000-0000-0000-000000000000'];
      }
    }
    const heightCm =
      query.heightBand && isHeightBandId(query.heightBand)
        ? heightBandWhere(query.heightBand) ?? undefined
        : undefined;
    return {
      catalogCategoryIds,
      flowerTypeIds: query.flowerTypeId,
      flowerTypeSlugs: query.flowerTypeSlug,
      flowerVarietyIds: query.flowerVarietyId,
      flowerVarietySlugs: query.flowerVarietySlug,
      flowerOriginIds: query.flowerOriginId,
      flowerOriginSlugs: query.flowerOriginSlug,
      heightCm: heightCm ?? undefined,
      familyId: query.familyId,
    };
  }

  async listProducts(
    query: PublicProductListQueryDto,
  ): Promise<PaginatedResponse<ProductListItemDto>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 24;
    const now = new Date();
    const budgetRanges = query.budgetRangeIds?.length
      ? await this.budgetRanges.resolveBounds(query.budgetRangeIds)
      : [];
    const catalogFilters = await this.resolveCatalogFilters(query);

    // /katalog/[slug]: only Filter Pool–enabled facets may affect Prisma WHERE.
    let gatedFacet = {
      occasionIds: query.occasionIds,
      occasionSlugs: query.occasionSlugs,
      recipientIds: query.recipientIds,
      recipientSlugs: query.recipientSlugs,
      colorIds: query.colorIds,
      colorSlugs: query.colorSlugs,
      bouquetSizeIds: query.bouquetSizeIds,
      bouquetSizeSlugs: query.bouquetSizeSlugs,
      promotionalOnly: query.promotionalOnly,
      minPriceMinor: query.minPriceMinor,
      maxPriceMinor: query.maxPriceMinor,
      flowerTypeIds: catalogFilters.flowerTypeIds,
      flowerTypeSlugs: catalogFilters.flowerTypeSlugs,
      flowerVarietyIds: catalogFilters.flowerVarietyIds,
      flowerVarietySlugs: catalogFilters.flowerVarietySlugs,
      flowerOriginIds: catalogFilters.flowerOriginIds,
      flowerOriginSlugs: catalogFilters.flowerOriginSlugs,
      heightCm: catalogFilters.heightCm,
    };
    if (query.categorySlug) {
      try {
        const enabledKeys = await this.catalogFilters.getEnabledPublicFilterKeys(
          query.categorySlug,
        );
        gatedFacet = gateListingFiltersByEnabledKeys(gatedFacet, enabledKeys);
      } catch {
        // Unknown/hidden category: resolveCatalogFilters already scopes to empty id.
      }
    }

    const { items, total } = await this.products.list({
      filters: {
        publishedAt: now,
        search: query.search,
        availability: query.availability,
        flowerIds: query.flowerIds,
        flowerSlugs: query.flowerSlugs,
        budgetRanges,
        catalogCategoryIds: catalogFilters.catalogCategoryIds,
        familyId: catalogFilters.familyId,
        ...gatedFacet,
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

  /** Storefront slug lookup; retired slugs resolve through `SlugRedirect`. */
  async getProductBySlug(slug: string): Promise<ProductResolveDto> {
    const candidates = await this.slugRedirects.resolveChain('PRODUCT', slug);
    for (const candidate of candidates) {
      const product = await this.products.findBySlug(candidate);
      if (product && isEffectivelyPublished(product)) {
        const familyId = product.familyMember?.family.id;
        const now = new Date();
        const family = familyId
          ? await this.families.getDto(familyId, this.urlFor, product.id, {
              publishedOnly: true,
              now,
            })
          : null;
        return {
          product: toProductPublicDto(product, this.urlFor, now, family),
          redirectedFrom: slug !== product.slug ? slug : null,
          canonicalSlug: product.slug,
        };
      }
    }
    throw new NotFoundException('Product not found');
  }

  listCategoryTree() {
    return this.categories.tree(true);
  }

  async getCategoryBySlug(slug: string): Promise<
    Awaited<ReturnType<CatalogCategoriesService['getBySlug']>> & {
      redirectedFrom: string | null;
      canonicalSlug: string;
    }
  > {
    const candidates = await this.slugRedirects.resolveChain('CATALOG_CATEGORY', slug);
    for (const candidate of candidates) {
      try {
        const category = await this.categories.getBySlug(candidate);
        return {
          ...category,
          redirectedFrom: slug !== category.slug ? slug : null,
          canonicalSlug: category.slug,
        };
      } catch {
        // try next redirect hop
      }
    }
    throw new NotFoundException('Category not found');
  }

  listFlowerTypes() {
    return this.flowerRefs.listTypes(true);
  }

  listFlowerVarieties(flowerTypeId?: string) {
    return this.flowerRefs.listVarieties(flowerTypeId, true);
  }

  listFlowerOrigins() {
    return this.flowerRefs.listOrigins(true);
  }

  async listRelatedProducts(slug: string, limit = 8): Promise<ProductListItemDto[]> {
    const product = await this.products.findBySlug(slug);
    if (!product || !isEffectivelyPublished(product)) {
      throw new NotFoundException('Product not found');
    }

    const occasionIds = product.occasions.map((link) => link.occasionId);
    const recipientIds = product.recipients.map((link) => link.recipientId);
    const colorIds = product.colors.map((link) => link.colorId);
    const flowerIds = product.components
      .map((component) => component.flowerId)
      .filter((id): id is string => Boolean(id));
    const flowerTypeIds = product.components
      .map((component) => component.flowerItem?.flowerTypeId)
      .filter((id): id is string => Boolean(id));
    const flowerItemIds = product.components
      .map((component) => component.flowerItemId)
      .filter((id): id is string => Boolean(id));

    const overlap: Prisma.ProductWhereInput[] = [];
    if (product.bouquetSizeId) {
      overlap.push({ bouquetSizeId: product.bouquetSizeId });
    }
    if (product.catalogCategoryId) {
      overlap.push({ catalogCategoryId: product.catalogCategoryId });
    }
    if (occasionIds.length > 0) {
      overlap.push({ occasions: { some: { occasionId: { in: occasionIds } } } });
    }
    if (recipientIds.length > 0) {
      overlap.push({ recipients: { some: { recipientId: { in: recipientIds } } } });
    }
    if (colorIds.length > 0) {
      overlap.push({ colors: { some: { colorId: { in: colorIds } } } });
    }
    if (flowerIds.length > 0) {
      overlap.push({ components: { some: { flowerId: { in: flowerIds } } } });
    }
    if (flowerItemIds.length > 0) {
      overlap.push({ components: { some: { flowerItemId: { in: flowerItemIds } } } });
    } else if (flowerTypeIds.length > 0) {
      overlap.push({
        components: { some: { flowerItem: { flowerTypeId: { in: flowerTypeIds } } } },
      });
    }
    if (overlap.length === 0) {
      return [];
    }

    const now = new Date();
    const items = await this.prisma.client.product.findMany({
      where: {
        AND: [effectivelyPublishedWhere(now), { id: { not: product.id }, OR: overlap }],
      },
      include: PRODUCT_INCLUDE,
      orderBy: [{ bestsellerLinks: { _count: 'desc' } }, { updatedAt: 'desc' }],
      take: limit,
    });

    return items.map((item) => toProductListItemDto(item, this.urlFor, now));
  }

  listOccasions(): Promise<TaxonomyRefDto[]> {
    return this.listVisibleTaxonomyRefs('occasion');
  }

  listRecipients(): Promise<TaxonomyRefDto[]> {
    return this.listVisibleTaxonomyRefs('recipient');
  }

  listFlowers(): Promise<TaxonomyRefDto[]> {
    return this.listVisibleTaxonomyRefs('flower');
  }

  async listProductLines(): Promise<TaxonomyRefDto[]> {
    const rows = await this.prisma.client.productLine.findMany({
      where: { visibility: 'VISIBLE' },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, slug: true, name: true },
    });
    return rows.map(toTaxonomyRef);
  }

  /** Colors carry an optional swatch so filter chips can render a dot. */
  async listColors(): Promise<ColorPublicDto[]> {
    const rows = await this.prisma.client.color.findMany({
      where: { visibility: 'VISIBLE' },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, slug: true, name: true, swatch: true },
    });
    return rows.map((row) => ({ ...toTaxonomyRef(row), swatch: row.swatch }));
  }

  async listBouquetSizes(): Promise<BouquetSizePublicDto[]> {
    const rows = await this.prisma.client.bouquetSize.findMany({
      where: { visibility: 'VISIBLE' },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, slug: true, name: true, description: true },
    });
    return rows.map(toBouquetSizePublicDto);
  }

  listBudgetRanges(): Promise<BudgetRangePublicDto[]> {
    return this.budgetRanges.listPublic();
  }

  listBestsellers(): Promise<BestsellerGroupPublicDto[]> {
    return this.bestsellers.listPublic();
  }

  getBestsellerGroup(slug: string): Promise<BestsellerGroupPublicDto> {
    return this.bestsellers.getPublicBySlug(slug);
  }

  listPromotionalProducts(limit = 24): Promise<ProductListItemDto[]> {
    return this.promotions.listPublicPromotionalProducts(limit);
  }

  async getTaxonomyPublic(kind: string, slug: string): Promise<TaxonomyPublicDto> {
    if (!isPublicTaxonomyKind(kind)) {
      throw new BadRequestException('Unknown taxonomy kind');
    }
    const row = await this.taxonomyDelegate(kind).findUnique({ where: { slug } });
    if (!row || row.visibility !== 'VISIBLE') {
      throw new NotFoundException('Taxonomy entry not found');
    }
    return toTaxonomyPublicDto(
      {
        ...row,
        seoTitle: row.seoTitle ?? null,
        seoDescription: row.seoDescription ?? null,
        noIndex: row.noIndex ?? false,
      },
      kind,
    );
  }

  async getSitemap(): Promise<SitemapEntryDto[]> {
    const now = new Date();
    const [products, flowers, occasions, recipients, categories] = await Promise.all([
      this.prisma.client.product.findMany({
        where: { ...effectivelyPublishedWhere(now), noIndex: false },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.client.flower.findMany({
        where: { visibility: 'VISIBLE', noIndex: false },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.client.occasion.findMany({
        where: { visibility: 'VISIBLE', noIndex: false },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.client.recipient.findMany({
        where: { visibility: 'VISIBLE', noIndex: false },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.client.catalogCategory.findMany({
        where: { visibility: 'VISIBLE', noIndex: false },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    const newestProductUpdate = products[0]?.updatedAt.toISOString() ?? null;
    // Keep legacy hubs for cvety/bukety; other visible categories land on /katalog/[slug].
    const legacyNavSlugs = new Set(['cvety', 'bukety']);

    return [
      { path: '/bukety', updatedAt: newestProductUpdate },
      { path: '/akcii', updatedAt: newestProductUpdate },
      ...products.map((product) => ({
        path: `/bukety/${product.slug}`,
        updatedAt: product.updatedAt.toISOString(),
      })),
      ...categories
        .filter((category) => !legacyNavSlugs.has(category.slug))
        .map((category) => ({
          path: `/katalog/${category.slug}`,
          updatedAt: category.updatedAt.toISOString(),
        })),
      ...flowers.map((flower) => ({
        path: `/cvety/${flower.slug}`,
        updatedAt: flower.updatedAt.toISOString(),
      })),
      ...occasions.map((occasion) => ({
        path: `/povod/${occasion.slug}`,
        updatedAt: occasion.updatedAt.toISOString(),
      })),
      ...recipients.map((recipient) => ({
        path: `/komu/${recipient.slug}`,
        updatedAt: recipient.updatedAt.toISOString(),
      })),
    ];
  }

  private async listVisibleTaxonomyRefs(kind: PublicTaxonomyKind): Promise<TaxonomyRefDto[]> {
    const rows = await this.taxonomyDelegate(kind).findMany({
      where: { visibility: 'VISIBLE' },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, slug: true, name: true },
    });
    return rows.map(toTaxonomyRef);
  }

  private taxonomyDelegate(kind: PublicTaxonomyKind): PublicTaxonomyDelegate {
    const db = this.prisma.client;
    const delegates = {
      flower: db.flower,
      occasion: db.occasion,
      recipient: db.recipient,
      color: db.color,
      bouquet_size: db.bouquetSize,
    };
    return delegates[kind] as unknown as PublicTaxonomyDelegate;
  }
}

/** Columns present on every public taxonomy row (SEO columns are optional). */
type PublicTaxonomyRow = Omit<TaxonomyRecord, 'seoTitle' | 'seoDescription' | 'noIndex'> & {
  seoTitle?: string | null;
  seoDescription?: string | null;
  noIndex?: boolean;
};

type PublicTaxonomyDelegate = {
  findUnique(args: { where: { slug: string } }): Promise<PublicTaxonomyRow | null>;
  findMany(args: {
    where?: { visibility?: 'VISIBLE' | 'HIDDEN' };
    orderBy?: Array<{ sortOrder?: 'asc' | 'desc'; name?: 'asc' | 'desc' }>;
    select?: { id: true; slug: true; name: true };
  }): Promise<Array<{ id: string; slug: string; name: string }>>;
};

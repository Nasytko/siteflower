import { Injectable } from '@nestjs/common';
import type { CommercialAvailability, Prisma, ProductLifecycle } from '@bouquet-one/database';
import {
  budgetRangeMatchesPrice,
  isDominantFlowerType,
  type ProductSort,
} from '@bouquet-one/contracts';
import { PrismaService } from '../database/prisma.service';
import { PRODUCT_INCLUDE, type ProductWithRelations } from './catalog.mapper';
import {
  buildPublicPromotionDto,
  effectiveVariantPriceMinor,
  type PromotionRow,
} from './promotion.util';

/** Inclusive budget bounds resolved from `BudgetRange` rows (null = open bound). */
export type BudgetBound = { minMinor: bigint | null; maxMinor: bigint | null };

export type ProductListFilters = {
  search?: string;
  lifecycle?: ProductLifecycle;
  availability?: CommercialAvailability;
  /** Discovery facets — OR within a facet, AND across facets. */
  occasionIds?: string[];
  occasionSlugs?: string[];
  recipientIds?: string[];
  recipientSlugs?: string[];
  /** Product-level visual palette (ProductColor). */
  colorIds?: string[];
  colorSlugs?: string[];
  /** Composition-line color — ANDed with other composition facets on the same component. */
  componentColorIds?: string[];
  componentColorSlugs?: string[];
  /** /cvety rewrite: flower-type slug matched via FlowerItem.flowerType.slug. */
  flowerSlugs?: string[];
  budgetRanges?: BudgetBound[];
  bestsellerGroupIds?: string[];
  /** CatalogCategory ids (already expanded to include descendants). */
  catalogCategoryIds?: string[];
  /**
   * ProductKind filter. When combined with catalogCategoryIds and
   * `matchCategoryOrProductKind`, matches category tree OR kind (hub PLPs).
   */
  productKinds?: Array<'BOUQUET' | 'COMPOSITION' | 'STEM' | 'PLANT' | 'GIFT' | 'OTHER'>;
  /**
   * Hub PLP mode: product in category tree OR productKind in productKinds.
   * Leaf merchandising categories leave this false and use category ids only.
   */
  matchCategoryOrProductKind?: boolean;
  flowerTypeIds?: string[];
  flowerTypeSlugs?: string[];
  flowerVarietyIds?: string[];
  flowerVarietySlugs?: string[];
  flowerOriginIds?: string[];
  flowerOriginSlugs?: string[];
  /**
   * Stem-height bounds for "Высота цветка" — matched ONLY against FlowerItem.stemLengthCm.
   * Product.bouquetHeightCm (bouquet/card) is a separate filter (bouquetHeightCm).
   */
  heightCm?: { gt?: number; gte?: number; lte?: number };
  /** Optional bouquet/card height filter — Product.bouquetHeightCm only. */
  bouquetHeightCm?: { gt?: number; gte?: number; lte?: number };
  familyId?: string;
  /** Only products with a currently effective promotion (used by /akcii). */
  promotionalOnly?: boolean;
  minPriceMinor?: string;
  maxPriceMinor?: string;
  compositionKinds?: Array<'MONO' | 'MIXED' | 'UNKNOWN'>;
  /** Min qty on a PRIMARY line for flowerTypeQuantitySlug (EXACT products only). */
  minFlowerTypeQuantity?: number;
  flowerTypeQuantitySlug?: string;
  /**
   * Predominant PRIMARY flower type (strict max quantity, comparable units, EXACT).
   * SQL prefilters candidates; refined in memory via `isDominantFlowerType`.
   */
  dominantFlowerTypeSlug?: string;
  /** Product ids to exclude (SEO landing excludes). */
  excludeProductIds?: string[];
  /** When set, restricts to effectively published products at that instant. */
  publishedAt?: Date;
};

const SLUG_LIST_MAX = 16;
/** Page size while loading all candidates for effective-price / promo refinement.
 *  Must not silently truncate — incomplete loads break totals/sort/pagination. */
const IN_MEMORY_CANDIDATE_PAGE = 500;

/** Parse `a,b,c` (or a single value) into a de-duplicated list. */
export function parseSlugList(value?: string | null): string[] | undefined {
  if (!value) return undefined;
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part.length <= 120);
  if (parts.length === 0) return undefined;
  return [...new Set(parts)].slice(0, SLUG_LIST_MAX);
}

function nonEmpty(values?: string[]): string[] | undefined {
  if (!values || values.length === 0) return undefined;
  return [...new Set(values)].slice(0, SLUG_LIST_MAX);
}

/**
 * Mirrors `isEffectivelyPublished` in SQL: published lifecycle plus an open
 * schedule window at `now`.
 */
export function effectivelyPublishedWhere(now: Date): Prisma.ProductWhereInput {
  return {
    lifecycle: 'PUBLISHED',
    AND: [
      {
        OR: [
          { publishAt: { lte: now } },
          { publishAt: null, publishedAt: { lte: now } },
          { publishAt: null, publishedAt: null },
        ],
      },
      { OR: [{ unpublishAt: null }, { unpublishAt: { gt: now } }] },
    ],
  };
}

/** SQL approximation of `isPromotionEffective` (actual discount is verified in memory). */
export function promotionScheduleWhere(now: Date): Prisma.ProductWhereInput {
  return {
    promotion: {
      is: {
        enabled: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
    },
  };
}

type CandidateRow = {
  id: string;
  currency: string;
  publishedAt: Date | null;
  updatedAt: Date;
  variants: Array<{ id: string; priceMinor: bigint; status: string }>;
  promotion: {
    enabled: boolean;
    type: PromotionRow['type'];
    percentOff: number | null;
    startsAt: Date | null;
    endsAt: Date | null;
    variantPrices: Array<{ variantId: string; salePriceMinor: bigint }>;
  } | null;
  _count: { bestsellerLinks: number };
};

const CANDIDATE_SELECT = {
  id: true,
  currency: true,
  publishedAt: true,
  updatedAt: true,
  variants: { select: { id: true, priceMinor: true, status: true } },
  promotion: {
    select: {
      enabled: true,
      type: true,
      percentOff: true,
      startsAt: true,
      endsAt: true,
      variantPrices: { select: { variantId: true, salePriceMinor: true } },
    },
  },
  _count: { select: { bestsellerLinks: true } },
} satisfies Prisma.ProductSelect;

function promotionRowOf(candidate: CandidateRow): PromotionRow | null {
  return candidate.promotion ? { ...candidate.promotion } : null;
}

function activeVariants(candidate: CandidateRow) {
  return candidate.variants.filter((variant) => variant.status === 'ACTIVE');
}

/** Lowest price a customer would actually pay (drives price sorting). */
function minEffectivePrice(candidate: CandidateRow, now: Date): bigint | null {
  const promo = promotionRowOf(candidate);
  const prices = activeVariants(candidate).map((variant) =>
    effectiveVariantPriceMinor(variant, promo, now),
  );
  if (prices.length === 0) return null;
  return prices.reduce((min, price) => (price < min ? price : min), prices[0]!);
}

function matchesBudget(candidate: CandidateRow, ranges: BudgetBound[], now: Date): boolean {
  const promo = promotionRowOf(candidate);
  return activeVariants(candidate).some((variant) => {
    const effective = effectiveVariantPriceMinor(variant, promo, now);
    return ranges.some(
      (range) =>
        budgetRangeMatchesPrice(variant.priceMinor, range.minMinor, range.maxMinor) ||
        budgetRangeMatchesPrice(effective, range.minMinor, range.maxMinor),
    );
  });
}

function hasEffectivePromotion(candidate: CandidateRow, now: Date): boolean {
  return (
    buildPublicPromotionDto(
      candidate.currency,
      candidate.variants,
      promotionRowOf(candidate),
      now,
    ) !== null
  );
}

/**
 * Prisma cannot order by effective (promo-discounted) price or refine budget
 * matches that depend on discounted amounts, so those list modes load ALL
 * matching candidates in pages of IN_MEMORY_CANDIDATE_PAGE and refine in memory.
 *
 * There is no silent truncation. Totals/pagination/sort use the full refined set.
 * Composition / taxonomy filters stay in Prisma WHERE (not this path).
 *
 * Scale note (boutique florist): expected published catalog ≪ tens of thousands.
 * Full-candidate load is acceptable until inventory growth forces SQL effective-price
 * sorting. Not a release blocker for the current shop size.
 */
function buildOrderBy(sort: ProductSort | undefined): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case 'newest':
      return [{ publishedAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }];
    case 'price_asc':
    case 'price_desc':
      // Handled separately in list(); fallback only if misrouted.
      return [{ updatedAt: 'desc' }];
    case 'recommended':
    default:
      return [
        { bestsellerLinks: { _count: 'desc' } },
        { publishedAt: { sort: 'desc', nulls: 'last' } },
        { updatedAt: 'desc' },
      ];
  }
}

function compareCandidates(
  a: CandidateRow,
  b: CandidateRow,
  sort: ProductSort,
  now: Date,
): number {
  if (sort === 'price_asc' || sort === 'price_desc') {
    const aMin = minEffectivePrice(a, now);
    const bMin = minEffectivePrice(b, now);
    if (aMin !== null || bMin !== null) {
      if (aMin === null) return 1;
      if (bMin === null) return -1;
      if (aMin !== bMin) {
        const ascending = aMin < bMin ? -1 : 1;
        return sort === 'price_asc' ? ascending : -ascending;
      }
    }
  }
  if (sort === 'recommended' && a._count.bestsellerLinks !== b._count.bestsellerLinks) {
    return b._count.bestsellerLinks - a._count.bestsellerLinks;
  }
  const aPublished = a.publishedAt?.getTime() ?? 0;
  const bPublished = b.publishedAt?.getTime() ?? 0;
  if (aPublished !== bPublished) return bPublished - aPublished;
  return b.updatedAt.getTime() - a.updatedAt.getTime();
}

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Prisma.TransactionClient) {
    return tx ?? this.prisma.client;
  }

  findById(id: string, tx?: Prisma.TransactionClient): Promise<ProductWithRelations | null> {
    return this.db(tx).product.findUnique({ where: { id }, include: PRODUCT_INCLUDE });
  }

  findBySlug(slug: string, tx?: Prisma.TransactionClient): Promise<ProductWithRelations | null> {
    return this.db(tx).product.findUnique({ where: { slug }, include: PRODUCT_INCLUDE });
  }

  findIdBySlug(slug: string, tx?: Prisma.TransactionClient): Promise<{ id: string } | null> {
    return this.db(tx).product.findUnique({ where: { slug }, select: { id: true } });
  }

  async list(params: {
    filters: ProductListFilters;
    skip: number;
    take: number;
    sort?: ProductSort;
    now?: Date;
  }): Promise<{ items: ProductWithRelations[]; total: number }> {
    const now = params.now ?? new Date();
    const where = buildProductWhere(params.filters, now);
    const sort = params.sort ?? 'recommended';
    const budgetRanges = params.filters.budgetRanges ?? [];
    const dominantSlug = params.filters.dominantFlowerTypeSlug?.trim() || undefined;
    const needsRefinement =
      sort === 'price_asc' ||
      sort === 'price_desc' ||
      budgetRanges.length > 0 ||
      params.filters.promotionalOnly === true ||
      Boolean(dominantSlug);

    if (needsRefinement) {
      // Composition / taxonomy filters stay in Prisma WHERE. Effective price, budget,
      // promo effectiveness, and dominant flower type need JS refinement.
      // Load ALL matching candidates in stable pages — never truncate.
      const candidates: CandidateRow[] = [];
      for (;;) {
        const batch = (await this.db().product.findMany({
          where,
          select: dominantSlug
            ? {
                ...CANDIDATE_SELECT,
                compositionPrecision: true,
                components: {
                  select: {
                    role: true,
                    quantity: true,
                    unit: true,
                    flowerItem: { select: { flowerType: { select: { slug: true } } } },
                  },
                },
              }
            : CANDIDATE_SELECT,
          orderBy: { id: 'asc' },
          skip: candidates.length,
          take: IN_MEMORY_CANDIDATE_PAGE,
        })) as Array<
          CandidateRow & {
            compositionPrecision?: string;
            components?: Array<{
              role: string;
              quantity: number | null;
              unit: string;
              flowerItem: { flowerType: { slug: string } | null } | null;
            }>;
          }
        >;
        candidates.push(...batch);
        if (batch.length < IN_MEMORY_CANDIDATE_PAGE) break;
      }

      const refined = candidates.filter((candidate) => {
        if (params.filters.promotionalOnly && !hasEffectivePromotion(candidate, now)) {
          return false;
        }
        if (budgetRanges.length > 0 && !matchesBudget(candidate, budgetRanges, now)) {
          return false;
        }
        if (dominantSlug) {
          const withComp = candidate as CandidateRow & {
            compositionPrecision?: string;
            components?: Array<{
              role: string;
              quantity: number | null;
              unit: string;
              flowerItem: { flowerType: { slug: string } | null } | null;
            }>;
          };
          if (withComp.compositionPrecision !== 'EXACT') return false;
          if (
            !isDominantFlowerType(
              (withComp.components ?? []).map((row) => ({
                role: row.role as 'PRIMARY' | 'GREENERY' | 'FILLER' | 'OTHER',
                quantity: row.quantity,
                unit: row.unit,
                flowerTypeSlug: row.flowerItem?.flowerType?.slug ?? null,
              })),
              dominantSlug,
            )
          ) {
            return false;
          }
        }
        return true;
      });

      refined.sort((a, b) => compareCandidates(a, b, sort, now));
      const pageIds = refined.slice(params.skip, params.skip + params.take).map((row) => row.id);
      if (pageIds.length === 0) {
        return { items: [], total: refined.length };
      }
      const items = await this.findManyByIds(pageIds);
      const byId = new Map(items.map((item) => [item.id, item]));
      return {
        items: pageIds.map((id) => byId.get(id)).filter((item): item is ProductWithRelations => Boolean(item)),
        total: refined.length,
      };
    }

    const [items, total] = await Promise.all([
      this.db().product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        orderBy: buildOrderBy(sort),
        skip: params.skip,
        take: params.take,
      }),
      this.db().product.count({ where }),
    ]);
    return { items, total };
  }

  findMany(where: Prisma.ProductWhereInput): Promise<ProductWithRelations[]> {
    return this.db().product.findMany({
      where,
      include: PRODUCT_INCLUDE,
      orderBy: [{ bestsellerLinks: { _count: 'desc' } }, { updatedAt: 'desc' }],
    });
  }

  findManyByIds(ids: string[]): Promise<ProductWithRelations[]> {
    return this.db().product.findMany({
      where: { id: { in: ids } },
      include: PRODUCT_INCLUDE,
    });
  }

  create(
    data: Prisma.ProductCreateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<{ id: string; slug: string }> {
    return this.db(tx).product.create({ data, select: { id: true, slug: true } });
  }

  /** Optimistic concurrency: returns the number of rows changed (0 on mismatch). */
  async updateWithVersion(
    id: string,
    expectedVersion: number,
    data: Prisma.ProductUncheckedUpdateManyInput,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const result = await this.db(tx).product.updateMany({
      where: { id, version: expectedVersion },
      data: { ...data, version: { increment: 1 } },
    });
    return result.count;
  }

  async bumpVersion(id: string, tx?: Prisma.TransactionClient): Promise<void> {
    await this.db(tx).product.update({
      where: { id },
      data: { version: { increment: 1 } },
    });
  }

  async exists(id: string, tx?: Prisma.TransactionClient): Promise<boolean> {
    const found = await this.db(tx).product.findUnique({ where: { id }, select: { id: true } });
    return found !== null;
  }

  async replaceVariants(
    productId: string,
    variants: Array<{
      name: string;
      priceMinor: bigint;
      sortOrder: number;
      status: 'ACTIVE' | 'INACTIVE';
    }>,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await this.replaceVariantsReturning(productId, variants, tx);
  }

  /**
   * Delete-all + recreate variants. Returns created rows carrying optional
   * `salePriceMinor` from the same input object used to create each row.
   */
  async replaceVariantsReturning(
    productId: string,
    variants: Array<{
      name: string;
      priceMinor: bigint;
      sortOrder: number;
      status: 'ACTIVE' | 'INACTIVE';
      salePriceMinor?: string | null;
    }>,
    tx: Prisma.TransactionClient,
  ): Promise<
    Array<{
      id: string;
      priceMinor: bigint;
      status: 'ACTIVE' | 'INACTIVE';
      salePriceMinor?: string | null;
    }>
  > {
    await tx.productVariant.deleteMany({ where: { productId } });
    const created: Array<{
      id: string;
      priceMinor: bigint;
      status: 'ACTIVE' | 'INACTIVE';
      salePriceMinor?: string | null;
    }> = [];
    for (const variant of variants) {
      const { salePriceMinor, ...data } = variant;
      const row = await tx.productVariant.create({
        data: { ...data, productId },
        select: { id: true, priceMinor: true, status: true },
      });
      created.push({
        id: row.id,
        priceMinor: row.priceMinor,
        status: row.status as 'ACTIVE' | 'INACTIVE',
        salePriceMinor,
      });
    }
    return created;
  }

  async replaceComponents(
    productId: string,
    components: Array<{
      flowerItemId: string;
      colorId?: string | null;
      role?: Prisma.ProductComponentCreateManyInput['role'];
      displayName: string;
      quantity: number | null;
      unit: Prisma.ProductComponentCreateManyInput['unit'];
      sortOrder: number;
    }>,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.productComponent.deleteMany({ where: { productId } });
    if (components.length > 0) {
      await tx.productComponent.createMany({
        data: components.map((component) => ({
          productId,
          flowerItemId: component.flowerItemId,
          colorId: component.colorId ?? null,
          role: component.role ?? 'PRIMARY',
          displayName: component.displayName,
          quantity: component.quantity,
          unit: component.unit,
          sortOrder: component.sortOrder,
        })),
      });
    }
  }

  async replaceOccasions(
    productId: string,
    occasionIds: string[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.productOccasion.deleteMany({ where: { productId } });
    if (occasionIds.length > 0) {
      await tx.productOccasion.createMany({
        data: occasionIds.map((occasionId) => ({ productId, occasionId })),
      });
    }
  }

  async replaceRecipients(
    productId: string,
    recipientIds: string[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.productRecipient.deleteMany({ where: { productId } });
    if (recipientIds.length > 0) {
      await tx.productRecipient.createMany({
        data: recipientIds.map((recipientId) => ({ productId, recipientId })),
      });
    }
  }

  async replaceColors(
    productId: string,
    colorIds: string[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.productColor.deleteMany({ where: { productId } });
    if (colorIds.length > 0) {
      await tx.productColor.createMany({
        data: colorIds.map((colorId) => ({ productId, colorId })),
      });
    }
  }
}

export function buildProductWhere(
  filters: ProductListFilters,
  now = new Date(),
): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [];
  const where: Prisma.ProductWhereInput = {
    ...(filters.publishedAt ? effectivelyPublishedWhere(filters.publishedAt) : {}),
    ...(filters.lifecycle ? { lifecycle: filters.lifecycle } : {}),
    ...(filters.availability ? { availability: filters.availability } : {}),
  };

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { slug: { contains: filters.search, mode: 'insensitive' } },
      { shortDescription: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const occasionIds = nonEmpty(filters.occasionIds);
  if (occasionIds) {
    and.push({ occasions: { some: { occasionId: { in: occasionIds } } } });
  } else {
    const occasionSlugs = nonEmpty(filters.occasionSlugs);
    if (occasionSlugs) {
      and.push({ occasions: { some: { occasion: { slug: { in: occasionSlugs } } } } });
    }
  }

  const recipientIds = nonEmpty(filters.recipientIds);
  if (recipientIds) {
    and.push({ recipients: { some: { recipientId: { in: recipientIds } } } });
  } else {
    const recipientSlugs = nonEmpty(filters.recipientSlugs);
    if (recipientSlugs) {
      and.push({ recipients: { some: { recipient: { slug: { in: recipientSlugs } } } } });
    }
  }

  const colorIds = nonEmpty(filters.colorIds);
  if (colorIds) {
    and.push({ colors: { some: { colorId: { in: colorIds } } } });
  } else {
    const colorSlugs = nonEmpty(filters.colorSlugs);
    if (colorSlugs) {
      and.push({ colors: { some: { color: { slug: { in: colorSlugs } } } } });
    }
  }

  const bestsellerGroupIds = nonEmpty(filters.bestsellerGroupIds);
  if (bestsellerGroupIds) {
    and.push({ bestsellerLinks: { some: { groupId: { in: bestsellerGroupIds } } } });
  }

  const catalogCategoryIds = nonEmpty(filters.catalogCategoryIds);
  const productKinds = nonEmpty(filters.productKinds as string[] | undefined) as
    | Array<'BOUQUET' | 'COMPOSITION' | 'STEM' | 'PLANT' | 'GIFT' | 'OTHER'>
    | undefined;
  if (catalogCategoryIds && productKinds && filters.matchCategoryOrProductKind) {
    and.push({
      OR: [
        { catalogCategoryId: { in: catalogCategoryIds } },
        { productKind: { in: productKinds } },
      ],
    });
  } else {
    if (catalogCategoryIds) {
      and.push({ catalogCategoryId: { in: catalogCategoryIds } });
    }
    if (productKinds) {
      and.push({ productKind: { in: productKinds } });
    }
  }

  // Composition facets: same-component AND (type ∧ variety ∧ origin ∧ color ∧ stem).
  // Multi-values within one facet stay OR (`in`).
  const flowerTypeIds = nonEmpty(filters.flowerTypeIds);
  const flowerTypeSlugs = nonEmpty([
    ...(filters.flowerTypeSlugs ?? []),
    ...(filters.flowerSlugs ?? []),
  ]);
  const flowerVarietyIds = nonEmpty(filters.flowerVarietyIds);
  const flowerVarietySlugs = nonEmpty(filters.flowerVarietySlugs);
  const flowerOriginIds = nonEmpty(filters.flowerOriginIds);
  const flowerOriginSlugs = nonEmpty(filters.flowerOriginSlugs);
  const componentColorIds = nonEmpty(filters.componentColorIds);
  const componentColorSlugs = nonEmpty(filters.componentColorSlugs);

  const flowerItemWhere: Prisma.FlowerItemWhereInput = {};
  if (flowerTypeIds) flowerItemWhere.flowerTypeId = { in: flowerTypeIds };
  else if (flowerTypeSlugs) flowerItemWhere.flowerType = { slug: { in: flowerTypeSlugs } };
  if (flowerVarietyIds) flowerItemWhere.flowerVarietyId = { in: flowerVarietyIds };
  else if (flowerVarietySlugs) flowerItemWhere.flowerVariety = { slug: { in: flowerVarietySlugs } };
  if (flowerOriginIds) flowerItemWhere.flowerOriginId = { in: flowerOriginIds };
  else if (flowerOriginSlugs) flowerItemWhere.flowerOrigin = { slug: { in: flowerOriginSlugs } };
  if (filters.heightCm) {
    flowerItemWhere.stemLengthCm = {
      ...(filters.heightCm.gt !== undefined ? { gt: filters.heightCm.gt } : {}),
      ...(filters.heightCm.gte !== undefined ? { gte: filters.heightCm.gte } : {}),
      ...(filters.heightCm.lte !== undefined ? { lte: filters.heightCm.lte } : {}),
    };
  }

  const hasFlowerItemPredicate = Object.keys(flowerItemWhere).length > 0;
  const hasComponentColor = Boolean(componentColorIds || componentColorSlugs);
  if (hasFlowerItemPredicate || hasComponentColor) {
    const componentSome: Prisma.ProductComponentWhereInput = {};
    if (hasFlowerItemPredicate) componentSome.flowerItem = flowerItemWhere;
    if (componentColorIds) componentSome.colorId = { in: componentColorIds };
    else if (componentColorSlugs) componentSome.color = { slug: { in: componentColorSlugs } };
    and.push({ components: { some: componentSome } });
  }

  const compositionKinds = nonEmpty(filters.compositionKinds);
  if (compositionKinds) {
    const kinds = compositionKinds as Array<'MONO' | 'MIXED' | 'UNKNOWN'>;
    const bouquetOnly = kinds.some((k) => k === 'MONO' || k === 'MIXED');
    and.push({ compositionKind: { in: kinds } });
    // Mono/mixed apply only to bouquets & compositions — never STEM/gifts.
    if (bouquetOnly) {
      and.push({ productKind: { in: ['BOUQUET', 'COMPOSITION'] } });
    }
  }

  if (
    filters.minFlowerTypeQuantity != null &&
    filters.minFlowerTypeQuantity > 0 &&
    filters.flowerTypeQuantitySlug
  ) {
    and.push({
      compositionPrecision: 'EXACT',
      components: {
        some: {
          role: 'PRIMARY',
          quantity: { gte: filters.minFlowerTypeQuantity },
          flowerItem: { flowerType: { slug: filters.flowerTypeQuantitySlug } },
        },
      },
    });
  }

  const dominantSlug = filters.dominantFlowerTypeSlug?.trim();
  if (dominantSlug) {
    // SQL prefilter: EXACT + contains the type as PRIMARY. Strict majority refined in memory.
    and.push({
      compositionPrecision: 'EXACT',
      components: {
        some: {
          role: 'PRIMARY',
          quantity: { gte: 1 },
          flowerItem: { flowerType: { slug: dominantSlug } },
        },
      },
    });
  }

  const excludeProductIds = nonEmpty(filters.excludeProductIds);
  if (excludeProductIds) {
    and.push({ id: { notIn: excludeProductIds } });
  }

  if (filters.bouquetHeightCm) {
    const bouquetHeightFilter = {
      ...(filters.bouquetHeightCm.gt !== undefined ? { gt: filters.bouquetHeightCm.gt } : {}),
      ...(filters.bouquetHeightCm.gte !== undefined
        ? { gte: filters.bouquetHeightCm.gte }
        : {}),
      ...(filters.bouquetHeightCm.lte !== undefined
        ? { lte: filters.bouquetHeightCm.lte }
        : {}),
    };
    and.push({ bouquetHeightCm: bouquetHeightFilter });
  }

  if (filters.familyId) {
    and.push({ familyMember: { is: { familyId: filters.familyId } } });
  }

  if (filters.promotionalOnly) {
    and.push(promotionScheduleWhere(now));
  }

  if (filters.budgetRanges && filters.budgetRanges.length > 0) {
    const ranges = filters.budgetRanges;
    const candidates: Prisma.ProductWhereInput[] = ranges.map((range) => ({
      variants: {
        some: {
          status: 'ACTIVE',
          priceMinor: {
            ...(range.minMinor === null ? {} : { gte: range.minMinor }),
            ...(range.maxMinor === null ? {} : { lte: range.maxMinor }),
          },
        },
      },
    }));

    // A promotion can only lower a price, so a discounted product may fall into a
    // range its regular price overshoots. Keep those candidates and refine in memory.
    const lowestMin = ranges.some((range) => range.minMinor === null)
      ? null
      : ranges.reduce<bigint>(
          (min, range) => (range.minMinor! < min ? range.minMinor! : min),
          ranges[0]!.minMinor!,
        );
    candidates.push({
      AND: [
        { promotion: { is: { enabled: true } } },
        ...(lowestMin === null
          ? []
          : [
              {
                variants: { some: { status: 'ACTIVE', priceMinor: { gte: lowestMin } } },
              } satisfies Prisma.ProductWhereInput,
            ]),
      ],
    });

    and.push({ OR: candidates });
  }

  if (filters.minPriceMinor !== undefined || filters.maxPriceMinor !== undefined) {
    const priceMinor: Prisma.BigIntFilter = {};
    if (filters.minPriceMinor !== undefined) {
      priceMinor.gte = BigInt(filters.minPriceMinor);
    }
    if (filters.maxPriceMinor !== undefined) {
      priceMinor.lte = BigInt(filters.maxPriceMinor);
    }
    and.push({ variants: { some: { status: 'ACTIVE', priceMinor } } });
  }

  if (and.length > 0) {
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), ...and];
  }

  return where;
}

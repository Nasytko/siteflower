import { Injectable } from '@nestjs/common';
import type { CommercialAvailability, Prisma, ProductLifecycle } from '@bouquet-one/database';
import { budgetRangeMatchesPrice, type ProductSort } from '@bouquet-one/contracts';
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
  colorIds?: string[];
  colorSlugs?: string[];
  flowerIds?: string[];
  flowerSlugs?: string[];
  bouquetSizeIds?: string[];
  bouquetSizeSlugs?: string[];
  budgetRanges?: BudgetBound[];
  bestsellerGroupIds?: string[];
  /** CatalogCategory ids (already expanded to include descendants). */
  catalogCategoryIds?: string[];
  flowerTypeIds?: string[];
  flowerTypeSlugs?: string[];
  flowerVarietyIds?: string[];
  flowerVarietySlugs?: string[];
  flowerOriginIds?: string[];
  flowerOriginSlugs?: string[];
  /** Inclusive heightCm bounds from heightBandWhere. */
  heightCm?: { gte?: number; lte?: number };
  familyId?: string;
  /** Only products with a currently effective promotion (used by /akcii). */
  promotionalOnly?: boolean;
  minPriceMinor?: string;
  maxPriceMinor?: string;
  /** When set, restricts to effectively published products at that instant. */
  publishedAt?: Date;
};

const SLUG_LIST_MAX = 16;
/** Boutique catalog: in-memory refinement stays bounded and predictable. */
const IN_MEMORY_CANDIDATE_CAP = 2_000;
/** Soft safety bound for boutique catalogs: in-memory sort/filter candidates.
 *  Raising is fine when inventory grows; rewrite to SQL sort only if correctness
 *  or memory becomes a real problem at this scale. */

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
 * Prisma relation `orderBy` cannot aggregate variant prices, so price sorts are
 * resolved in memory (see `list`). `recommended` puts merchandised (bestseller)
 * products first — a curated signal, not fake popularity.
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
    const needsRefinement =
      sort === 'price_asc' ||
      sort === 'price_desc' ||
      budgetRanges.length > 0 ||
      params.filters.promotionalOnly === true;

    if (needsRefinement) {
      const candidates = (await this.db().product.findMany({
        where,
        select: CANDIDATE_SELECT,
        take: IN_MEMORY_CANDIDATE_CAP,
      })) as CandidateRow[];

      const refined = candidates.filter((candidate) => {
        if (params.filters.promotionalOnly && !hasEffectivePromotion(candidate, now)) {
          return false;
        }
        if (budgetRanges.length > 0 && !matchesBudget(candidate, budgetRanges, now)) {
          return false;
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
      flowerItemId?: string | null;
      flowerId: string | null;
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
        data: components.map((component) => ({ ...component, productId })),
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

  async replaceProductLines(
    productId: string,
    productLineIds: string[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.productProductLine.deleteMany({ where: { productId } });
    if (productLineIds.length > 0) {
      await tx.productProductLine.createMany({
        data: productLineIds.map((productLineId) => ({ productId, productLineId })),
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

  const flowerIds = nonEmpty(filters.flowerIds);
  if (flowerIds) {
    and.push({ components: { some: { flowerId: { in: flowerIds } } } });
  } else {
    const flowerSlugs = nonEmpty(filters.flowerSlugs);
    if (flowerSlugs) {
      and.push({ components: { some: { flower: { slug: { in: flowerSlugs } } } } });
    }
  }

  const bouquetSizeIds = nonEmpty(filters.bouquetSizeIds);
  if (bouquetSizeIds) {
    and.push({ bouquetSizeId: { in: bouquetSizeIds } });
  } else {
    const bouquetSizeSlugs = nonEmpty(filters.bouquetSizeSlugs);
    if (bouquetSizeSlugs) {
      and.push({ bouquetSize: { slug: { in: bouquetSizeSlugs } } });
    }
  }

  const bestsellerGroupIds = nonEmpty(filters.bestsellerGroupIds);
  if (bestsellerGroupIds) {
    and.push({ bestsellerLinks: { some: { groupId: { in: bestsellerGroupIds } } } });
  }

  const catalogCategoryIds = nonEmpty(filters.catalogCategoryIds);
  if (catalogCategoryIds) {
    and.push({ catalogCategoryId: { in: catalogCategoryIds } });
  }

  // Discovery: legacy Product.flower* OR composition → FlowerItem (mixed bouquets).
  const flowerTypeIds = nonEmpty(filters.flowerTypeIds);
  if (flowerTypeIds) {
    and.push({
      OR: [
        { flowerTypeId: { in: flowerTypeIds } },
        { components: { some: { flowerItem: { flowerTypeId: { in: flowerTypeIds } } } } },
      ],
    });
  } else {
    const flowerTypeSlugs = nonEmpty(filters.flowerTypeSlugs);
    if (flowerTypeSlugs) {
      and.push({
        OR: [
          { flowerType: { slug: { in: flowerTypeSlugs } } },
          {
            components: {
              some: { flowerItem: { flowerType: { slug: { in: flowerTypeSlugs } } } },
            },
          },
        ],
      });
    }
  }

  const flowerVarietyIds = nonEmpty(filters.flowerVarietyIds);
  if (flowerVarietyIds) {
    and.push({
      OR: [
        { flowerVarietyId: { in: flowerVarietyIds } },
        { components: { some: { flowerItem: { flowerVarietyId: { in: flowerVarietyIds } } } } },
      ],
    });
  } else {
    const flowerVarietySlugs = nonEmpty(filters.flowerVarietySlugs);
    if (flowerVarietySlugs) {
      and.push({
        OR: [
          { flowerVariety: { slug: { in: flowerVarietySlugs } } },
          {
            components: {
              some: { flowerItem: { flowerVariety: { slug: { in: flowerVarietySlugs } } } },
            },
          },
        ],
      });
    }
  }

  const flowerOriginIds = nonEmpty(filters.flowerOriginIds);
  if (flowerOriginIds) {
    and.push({
      OR: [
        { flowerOriginId: { in: flowerOriginIds } },
        { components: { some: { flowerItem: { flowerOriginId: { in: flowerOriginIds } } } } },
      ],
    });
  } else {
    const flowerOriginSlugs = nonEmpty(filters.flowerOriginSlugs);
    if (flowerOriginSlugs) {
      and.push({
        OR: [
          { flowerOrigin: { slug: { in: flowerOriginSlugs } } },
          {
            components: {
              some: { flowerItem: { flowerOrigin: { slug: { in: flowerOriginSlugs } } } },
            },
          },
        ],
      });
    }
  }

  if (filters.heightCm) {
    const heightFilter = {
      ...(filters.heightCm.gte !== undefined ? { gte: filters.heightCm.gte } : {}),
      ...(filters.heightCm.lte !== undefined ? { lte: filters.heightCm.lte } : {}),
    };
    and.push({
      OR: [
        { heightCm: heightFilter },
        { components: { some: { flowerItem: { heightCm: heightFilter } } } },
      ],
    });
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

import { Injectable } from '@nestjs/common';
import type {
  CommercialAvailability,
  Prisma,
  ProductLifecycle,
} from '@bouquet-one/database';
import type { ProductSort } from '@bouquet-one/contracts';
import { PrismaService } from '../database/prisma.service';
import { PRODUCT_INCLUDE, type ProductWithRelations } from './catalog.mapper';

export type ProductListFilters = {
  search?: string;
  lifecycle?: ProductLifecycle;
  availability?: CommercialAvailability;
  featured?: boolean;
  categoryId?: string;
  /** Single slug or comma-separated list (OR within facet). */
  categorySlug?: string;
  occasionSlug?: string;
  recipientSlug?: string;
  styleSlug?: string;
  colorSlug?: string;
  flowerSlug?: string;
  minPriceMinor?: string;
  maxPriceMinor?: string;
  publishedAt?: Date;
};

const SLUG_LIST_MAX = 16;

/** Parse `a,b,c` (or a single slug) into a de-duplicated list. */
export function parseSlugList(value?: string | null): string[] | undefined {
  if (!value) return undefined;
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part.length <= 120);
  if (parts.length === 0) return undefined;
  return [...new Set(parts)].slice(0, SLUG_LIST_MAX);
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

function minActivePrice(variants: Array<{ priceMinor: bigint }>): bigint | null {
  if (variants.length === 0) return null;
  return variants.reduce(
    (min, variant) => (variant.priceMinor < min ? variant.priceMinor : min),
    variants[0]!.priceMinor,
  );
}

/**
 * Prisma relation `orderBy` only exposes `_count` (not `_min` on variant price).
 * Price sorts therefore load matching rows, order by min ACTIVE variant price
 * in memory, then paginate — fine for a boutique catalog size.
 */
function buildOrderBy(sort: ProductSort | undefined): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case 'newest':
      return [{ publishedAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }];
    case 'price_asc':
    case 'price_desc':
      // Handled separately in list(); fallback only if misrouted.
      return [{ featured: 'desc' }, { updatedAt: 'desc' }];
    case 'featured':
    default:
      return [{ featured: 'desc' }, { updatedAt: 'desc' }];
  }
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
  }): Promise<{ items: ProductWithRelations[]; total: number }> {
    const where = buildProductWhere(params.filters);
    const sort = params.sort ?? 'featured';

    if (sort === 'price_asc' || sort === 'price_desc') {
      // Boutique catalogs are small; sort by min ACTIVE variant price then paginate.
      // Cap protects against accidental unbounded loads if filters are too broad.
      const candidates = await this.db().product.findMany({
        where,
        select: {
          id: true,
          updatedAt: true,
          featured: true,
          variants: {
            where: { status: 'ACTIVE' },
            select: { priceMinor: true },
          },
        },
        take: 2_000,
      });
      const direction = sort === 'price_asc' ? 1 : -1;
      candidates.sort((a, b) => {
        const aMin = minActivePrice(a.variants);
        const bMin = minActivePrice(b.variants);
        if (aMin === null && bMin === null) {
          if (a.featured !== b.featured) return a.featured ? -1 : 1;
          return b.updatedAt.getTime() - a.updatedAt.getTime();
        }
        if (aMin === null) return 1;
        if (bMin === null) return -1;
        if (aMin !== bMin) {
          return aMin < bMin ? -direction : direction;
        }
        if (a.featured !== b.featured) return a.featured ? -1 : 1;
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      });
      const pageIds = candidates.slice(params.skip, params.skip + params.take).map((row) => row.id);
      if (pageIds.length === 0) {
        return { items: [], total: candidates.length };
      }
      const items = await this.findManyByIds(pageIds);
      const byId = new Map(items.map((item) => [item.id, item]));
      return {
        items: pageIds.map((id) => byId.get(id)!).filter(Boolean),
        total: candidates.length,
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
      orderBy: [{ featured: 'desc' }, { updatedAt: 'desc' }],
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
    data: Prisma.ProductUpdateManyMutationInput,
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
    await tx.productVariant.deleteMany({ where: { productId } });
    if (variants.length > 0) {
      await tx.productVariant.createMany({
        data: variants.map((variant) => ({ ...variant, productId })),
      });
    }
  }

  async replaceComponents(
    productId: string,
    components: Array<{
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

  async replaceCategories(
    productId: string,
    categoryIds: string[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.productCategory.deleteMany({ where: { productId } });
    if (categoryIds.length > 0) {
      await tx.productCategory.createMany({
        data: categoryIds.map((categoryId) => ({ productId, categoryId })),
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

  async replaceStyles(
    productId: string,
    styleIds: string[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.productStyle.deleteMany({ where: { productId } });
    if (styleIds.length > 0) {
      await tx.productStyle.createMany({
        data: styleIds.map((styleId) => ({ productId, styleId })),
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

export function buildProductWhere(filters: ProductListFilters): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {
    ...(filters.publishedAt ? effectivelyPublishedWhere(filters.publishedAt) : {}),
    ...(filters.lifecycle ? { lifecycle: filters.lifecycle } : {}),
    ...(filters.availability ? { availability: filters.availability } : {}),
    ...(filters.featured === undefined ? {} : { featured: filters.featured }),
  };

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { slug: { contains: filters.search, mode: 'insensitive' } },
      { shortDescription: { contains: filters.search, mode: 'insensitive' } },
    ];
  }
  if (filters.categoryId) {
    where.categories = { some: { categoryId: filters.categoryId } };
  } else {
    const categorySlugs = parseSlugList(filters.categorySlug);
    if (categorySlugs) {
      where.categories = {
        some: {
          category: {
            slug: categorySlugs.length === 1 ? categorySlugs[0] : { in: categorySlugs },
          },
        },
      };
    }
  }
  const occasionSlugs = parseSlugList(filters.occasionSlug);
  if (occasionSlugs) {
    where.occasions = {
      some: {
        occasion: {
          slug: occasionSlugs.length === 1 ? occasionSlugs[0] : { in: occasionSlugs },
        },
      },
    };
  }
  const recipientSlugs = parseSlugList(filters.recipientSlug);
  if (recipientSlugs) {
    where.recipients = {
      some: {
        recipient: {
          slug: recipientSlugs.length === 1 ? recipientSlugs[0] : { in: recipientSlugs },
        },
      },
    };
  }
  const styleSlugs = parseSlugList(filters.styleSlug);
  if (styleSlugs) {
    where.styles = {
      some: {
        style: {
          slug: styleSlugs.length === 1 ? styleSlugs[0] : { in: styleSlugs },
        },
      },
    };
  }
  const colorSlugs = parseSlugList(filters.colorSlug);
  if (colorSlugs) {
    where.colors = {
      some: {
        color: {
          slug: colorSlugs.length === 1 ? colorSlugs[0] : { in: colorSlugs },
        },
      },
    };
  }
  const flowerSlugs = parseSlugList(filters.flowerSlug);
  if (flowerSlugs) {
    where.components = {
      some: {
        flower: {
          slug: flowerSlugs.length === 1 ? flowerSlugs[0] : { in: flowerSlugs },
        },
      },
    };
  }

  if (filters.minPriceMinor !== undefined || filters.maxPriceMinor !== undefined) {
    const priceMinor: Prisma.BigIntFilter = {};
    if (filters.minPriceMinor !== undefined) {
      priceMinor.gte = BigInt(filters.minPriceMinor);
    }
    if (filters.maxPriceMinor !== undefined) {
      priceMinor.lte = BigInt(filters.maxPriceMinor);
    }
    where.variants = {
      some: {
        status: 'ACTIVE',
        priceMinor,
      },
    };
  }

  return where;
}

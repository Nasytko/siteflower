import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CollectionPublicDto,
  PaginatedResponse,
  ProductListItemDto,
  ProductResolveDto,
  SitemapEntryDto,
  TaxonomyPublicDto,
  TaxonomyRefDto,
} from '@bouquet-one/contracts';
import type { Prisma } from '@bouquet-one/database';
import { PrismaService } from '../database/prisma.service';
import { MediaService } from '../media/media.service';
import { isEffectivelyPublished } from './catalog.logic';
import {
  PRODUCT_INCLUDE,
  toProductListItemDto,
  toProductPublicDto,
  toTaxonomyPublicDto,
  toTaxonomyRef,
  type TaxonomyRecord,
} from './catalog.mapper';
import { CollectionsService } from './collections.service';
import type { PublicProductListQueryDto } from './products.dto';
import { effectivelyPublishedWhere, ProductsRepository } from './products.repository';
import { SlugRedirectsService } from './slug-redirects.service';

const PUBLIC_TAXONOMY_KINDS = [
  'flower',
  'occasion',
  'recipient',
  'category',
  'style',
  'color',
] as const;

type PublicTaxonomyKind = (typeof PUBLIC_TAXONOMY_KINDS)[number];

function isPublicTaxonomyKind(value: string): value is PublicTaxonomyKind {
  return (PUBLIC_TAXONOMY_KINDS as readonly string[]).includes(value);
}

@Injectable()
export class PublicCatalogService {
  constructor(
    private readonly products: ProductsRepository,
    private readonly collections: CollectionsService,
    private readonly slugRedirects: SlugRedirectsService,
    private readonly media: MediaService,
    private readonly prisma: PrismaService,
  ) {}

  private readonly urlFor = (storageKey: string) => this.media.getPublicUrl(storageKey);

  async listProducts(
    query: PublicProductListQueryDto,
  ): Promise<PaginatedResponse<ProductListItemDto>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 24;
    const { items, total } = await this.products.list({
      filters: {
        publishedAt: new Date(),
        search: query.search,
        availability: query.availability,
        featured: query.featured,
        categorySlug: query.categorySlug,
        occasionSlug: query.occasionSlug,
        recipientSlug: query.recipientSlug,
        styleSlug: query.styleSlug,
        colorSlug: query.colorSlug,
        flowerSlug: query.flowerSlug,
        minPriceMinor: query.minPriceMinor,
        maxPriceMinor: query.maxPriceMinor,
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      sort: query.sort ?? 'featured',
    });
    return {
      items: items.map((product) => toProductListItemDto(product, this.urlFor)),
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
        return {
          product: toProductPublicDto(product, this.urlFor),
          redirectedFrom: slug !== product.slug ? slug : null,
          canonicalSlug: product.slug,
        };
      }
    }
    throw new NotFoundException('Product not found');
  }

  async listRelatedProducts(slug: string, limit = 8): Promise<ProductListItemDto[]> {
    const product = await this.products.findBySlug(slug);
    if (!product || !isEffectivelyPublished(product)) {
      throw new NotFoundException('Product not found');
    }

    const categoryIds = product.categories.map((link) => link.categoryId);
    const styleIds = product.styles.map((link) => link.styleId);
    const colorIds = product.colors.map((link) => link.colorId);
    const flowerIds = product.components
      .map((component) => component.flowerId)
      .filter((id): id is string => Boolean(id));

    const overlap: Prisma.ProductWhereInput[] = [];
    if (categoryIds.length > 0) {
      overlap.push({ categories: { some: { categoryId: { in: categoryIds } } } });
    }
    if (styleIds.length > 0) {
      overlap.push({ styles: { some: { styleId: { in: styleIds } } } });
    }
    if (colorIds.length > 0) {
      overlap.push({ colors: { some: { colorId: { in: colorIds } } } });
    }
    if (flowerIds.length > 0) {
      overlap.push({ components: { some: { flowerId: { in: flowerIds } } } });
    }
    if (overlap.length === 0) {
      return [];
    }

    const items = await this.prisma.client.product.findMany({
      where: {
        AND: [effectivelyPublishedWhere(new Date()), { id: { not: product.id }, OR: overlap }],
      },
      include: PRODUCT_INCLUDE,
      orderBy: [{ featured: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
    });

    return items.map((item) => toProductListItemDto(item, this.urlFor));
  }

  async listCategories(): Promise<TaxonomyRefDto[]> {
    return this.listVisibleTaxonomyRefs('category');
  }

  async listOccasions(): Promise<TaxonomyRefDto[]> {
    return this.listVisibleTaxonomyRefs('occasion');
  }

  async listRecipients(): Promise<TaxonomyRefDto[]> {
    return this.listVisibleTaxonomyRefs('recipient');
  }

  async listFlowers(): Promise<TaxonomyRefDto[]> {
    return this.listVisibleTaxonomyRefs('flower');
  }

  async listStyles(): Promise<TaxonomyRefDto[]> {
    return this.listVisibleTaxonomyRefs('style');
  }

  async listColors(): Promise<TaxonomyRefDto[]> {
    return this.listVisibleTaxonomyRefs('color');
  }

  async getTaxonomyPublic(kind: string, slug: string): Promise<TaxonomyPublicDto> {
    if (!isPublicTaxonomyKind(kind)) {
      throw new BadRequestException('Unknown taxonomy kind');
    }
    const row = await this.taxonomyDelegate(kind).findUnique({ where: { slug } });
    if (!row || row.visibility !== 'VISIBLE') {
      throw new NotFoundException('Taxonomy entry not found');
    }
    return toTaxonomyPublicDto(row, kind);
  }

  async listCollections(): Promise<Array<{ slug: string; name: string; description?: string }>> {
    const collections = await this.prisma.client.collection.findMany({
      where: { visibility: 'VISIBLE' },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { slug: true, name: true, description: true },
    });
    return collections.map((collection) => ({
      slug: collection.slug,
      name: collection.name,
      ...(collection.description ? { description: collection.description } : {}),
    }));
  }

  getCollectionBySlug(slug: string): Promise<CollectionPublicDto> {
    return this.collections.findPublicBySlug(slug);
  }

  async getSitemap(): Promise<SitemapEntryDto[]> {
    const now = new Date();
    const [products, collections, flowers, occasions, recipients] = await Promise.all([
      this.prisma.client.product.findMany({
        where: { ...effectivelyPublishedWhere(now), noIndex: false },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.client.collection.findMany({
        where: { visibility: 'VISIBLE', noIndex: false },
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
    ]);

    const entries: SitemapEntryDto[] = [
      ...products.map((product) => ({
        path: `/bukety/${product.slug}`,
        updatedAt: product.updatedAt.toISOString(),
      })),
      ...collections.map((collection) => ({
        path: `/collections/${collection.slug}`,
        updatedAt: collection.updatedAt.toISOString(),
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

    return entries;
  }

  private async listVisibleTaxonomyRefs(kind: PublicTaxonomyKind): Promise<TaxonomyRefDto[]> {
    const rows = await this.taxonomyDelegate(kind).findMany({
      where: { visibility: 'VISIBLE' },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, slug: true, name: true },
    });
    return rows.map(toTaxonomyRef);
  }

  private taxonomyDelegate(kind: PublicTaxonomyKind): {
    findUnique(args: { where: { slug: string } }): Promise<TaxonomyRecord | null>;
    findMany(args: {
      where?: { visibility?: 'VISIBLE' | 'HIDDEN' };
      orderBy?: Array<{ sortOrder?: 'asc' | 'desc'; name?: 'asc' | 'desc' }>;
      select?: { id: true; slug: true; name: true };
    }): Promise<Array<{ id: string; slug: string; name: string }>>;
  } {
    const db = this.prisma.client;
    const delegates = {
      flower: db.flower,
      occasion: db.occasion,
      recipient: db.recipient,
      category: db.category,
      style: db.style,
      color: db.color,
    };
    return delegates[kind] as unknown as {
      findUnique(args: { where: { slug: string } }): Promise<TaxonomyRecord | null>;
      findMany(args: {
        where?: { visibility?: 'VISIBLE' | 'HIDDEN' };
        orderBy?: Array<{ sortOrder?: 'asc' | 'desc'; name?: 'asc' | 'desc' }>;
        select?: { id: true; slug: true; name: true };
      }): Promise<Array<{ id: string; slug: string; name: string }>>;
    };
  }
}

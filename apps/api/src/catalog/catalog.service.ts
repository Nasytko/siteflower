import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  defaultProductSeoDescription,
  defaultProductSeoTitle,
  derivePriceRange,
  normalizeSlug,
  type CollectionRulesDto,
  type ProductAdminDto,
  type ProductListItemDto,
  type ProductPublicDto,
  type TaxonomyAdminDto,
  type TaxonomyRefDto,
} from '@bouquet-one/contracts';
import type { Prisma } from '@bouquet-one/database';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { MediaService } from '../media/media.service';
import {
  activeVariantPrices,
  isEffectivelyPublished,
  matchesCollectionRules,
  validatePublishRequirements,
  wouldCreateRedirectLoop,
} from './catalog.logic';

const productInclude = {
  variants: { orderBy: { sortOrder: 'asc' as const } },
  components: { orderBy: { sortOrder: 'asc' as const }, include: { flower: true } },
  media: {
    orderBy: { sortOrder: 'asc' as const },
    include: { mediaAsset: { include: { derivatives: true } } },
  },
  categories: { include: { category: true } },
  occasions: { include: { occasion: true } },
  recipients: { include: { recipient: true } },
  styles: { include: { style: true } },
  colors: { include: { color: true } },
} satisfies Prisma.ProductInclude;

type ProductLoaded = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
  ) {}

  // ---------- mappers ----------

  private ref(t: { id: string; slug: string; name: string }): TaxonomyRefDto {
    return { id: t.id, slug: t.slug, name: t.name };
  }

  private mapMedia(product: ProductLoaded) {
    return product.media.map((m) => ({
      id: m.id,
      mediaAssetId: m.mediaAssetId,
      sortOrder: m.sortOrder,
      isPrimary: m.isPrimary,
      alt: m.alt,
      caption: m.caption,
      url: this.media.getPublicUrl(m.mediaAsset.storageKey),
      width: m.mediaAsset.width,
      height: m.mediaAsset.height,
      mimeType: m.mediaAsset.mimeType,
      derivatives: m.mediaAsset.derivatives.map((d) => ({
        width: d.width,
        format: d.format,
        url: this.media.getPublicUrl(d.storageKey),
      })),
    }));
  }

  toAdminDto(product: ProductLoaded): ProductAdminDto {
    const price = activeVariantPrices(product.currency, product.variants);
    const resolvedTitle = product.seoTitle?.trim() || defaultProductSeoTitle(product.name);
    const resolvedDescription =
      product.seoDescription?.trim() ||
      defaultProductSeoDescription(product.name, product.shortDescription);
    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      shortDescription: product.shortDescription,
      description: product.description,
      lifecycle: product.lifecycle,
      availability: product.availability,
      featured: product.featured,
      heightCm: product.heightCm ?? null,
      currency: product.currency,
      publishedAt: product.publishedAt?.toISOString() ?? null,
      publishAt: product.publishAt?.toISOString() ?? null,
      unpublishAt: product.unpublishAt?.toISOString() ?? null,
      version: product.version,
      seoTitle: product.seoTitle,
      seoDescription: product.seoDescription,
      noIndex: product.noIndex,
      seo: {
        seoTitle: product.seoTitle,
        seoDescription: product.seoDescription,
        noIndex: product.noIndex,
        resolvedTitle,
        resolvedDescription,
      },
      price,
      variants: product.variants.map((v) => ({
        id: v.id,
        name: v.name,
        priceMinor: v.priceMinor.toString(),
        sortOrder: v.sortOrder,
        status: v.status,
      })),
      components: product.components.map((c) => ({
        id: c.id,
        flowerId: c.flowerId,
        flower: c.flower ? this.ref(c.flower) : null,
        displayName: c.displayName,
        quantity: c.quantity,
        unit: c.unit,
        sortOrder: c.sortOrder,
      })),
      media: this.mapMedia(product),
      categories: product.categories.map((c) => this.ref(c.category)),
      occasions: product.occasions.map((c) => this.ref(c.occasion)),
      recipients: product.recipients.map((c) => this.ref(c.recipient)),
      styles: product.styles.map((c) => this.ref(c.style)),
      colors: product.colors.map((c) => this.ref(c.color)),
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }

  toPublicDto(product: ProductLoaded): ProductPublicDto {
    const admin = this.toAdminDto(product);
    const price = admin.price ?? {
      currency: product.currency,
      minMinor: '0',
      maxMinor: '0',
      single: true,
      label: `0,00 ${product.currency}`,
    };
    return {
      id: admin.id,
      slug: admin.slug,
      name: admin.name,
      shortDescription: admin.shortDescription,
      description: admin.description,
      availability: admin.availability,
      featured: admin.featured,
      heightCm: admin.heightCm,
      currency: admin.currency,
      price,
      seo: admin.seo,
      variants: admin.variants
        .filter((v) => v.status === 'ACTIVE')
        .map((v) => ({
          id: v.id,
          name: v.name,
          priceMinor: v.priceMinor,
          sortOrder: v.sortOrder,
        })),
      components: admin.components.map((c) => ({
        displayName: c.displayName,
        quantity: c.quantity,
        unit: c.unit,
        flowerSlug: c.flower?.slug ?? null,
      })),
      media: admin.media.map((m) => ({
        url: m.url,
        alt: m.alt,
        isPrimary: m.isPrimary,
        sortOrder: m.sortOrder,
        width: m.width,
        height: m.height,
        derivatives: m.derivatives,
      })),
      categories: admin.categories,
      occasions: admin.occasions,
      recipients: admin.recipients,
      styles: admin.styles,
      colors: admin.colors,
    };
  }

  toListItem(product: ProductLoaded): ProductListItemDto {
    const primary = product.media.find((m) => m.isPrimary) ?? product.media[0];
    const active = product.variants
      .filter((v) => v.status === 'ACTIVE')
      .slice()
      .sort((a, b) => {
        const byOrder = a.sortOrder - b.sortOrder;
        if (byOrder !== 0) return byOrder;
        if (a.priceMinor === b.priceMinor) return 0;
        return a.priceMinor < b.priceMinor ? -1 : 1;
      });
    const pick = active[0];
    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      lifecycle: product.lifecycle,
      availability: product.availability,
      featured: product.featured,
      heightCm: product.heightCm ?? null,
      price: activeVariantPrices(product.currency, product.variants),
      defaultVariant: pick
        ? { id: pick.id, name: pick.name, priceMinor: pick.priceMinor.toString() }
        : null,
      primaryImageUrl: primary
        ? this.media.getPublicUrl(primary.mediaAsset.storageKey)
        : null,
      categories: product.categories.map((c) => this.ref(c.category)),
      updatedAt: product.updatedAt.toISOString(),
    };
  }

  private mapTaxonomy(row: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    sortOrder: number;
    visibility: TaxonomyAdminDto['visibility'];
    version: number;
    seoTitle: string | null;
    seoDescription: string | null;
    noIndex: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): TaxonomyAdminDto {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      sortOrder: row.sortOrder,
      visibility: row.visibility,
      version: row.version,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      noIndex: row.noIndex,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // ---------- products ----------

  async listProducts(input: {
    page: number;
    pageSize: number;
    search?: string;
    lifecycle?: string;
    availability?: string;
    categorySlug?: string;
  }) {
    const where: Prisma.ProductWhereInput = {
      ...(input.lifecycle ? { lifecycle: input.lifecycle as never } : {}),
      ...(input.availability ? { availability: input.availability as never } : {}),
      ...(input.search
        ? {
            OR: [
              { name: { contains: input.search, mode: 'insensitive' } },
              { slug: { contains: input.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(input.categorySlug
        ? { categories: { some: { category: { slug: input.categorySlug } } } }
        : {}),
    };
    const skip = (input.page - 1) * input.pageSize;
    const [total, rows] = await Promise.all([
      this.prisma.client.product.count({ where }),
      this.prisma.client.product.findMany({
        where,
        include: productInclude,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: input.pageSize,
      }),
    ]);
    return {
      items: rows.map((r) => this.toListItem(r)),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async getProduct(id: string): Promise<ProductAdminDto> {
    const product = await this.prisma.client.product.findUnique({
      where: { id },
      include: productInclude,
    });
    if (!product) throw new NotFoundException('Product not found');
    return this.toAdminDto(product);
  }

  async createProduct(input: {
    name: string;
    slug?: string;
    actorId: string;
    requestId?: string;
  }): Promise<ProductAdminDto> {
    const slug = normalizeSlug(input.slug ?? input.name);
    if (slug.length < 2) throw new BadRequestException('Invalid slug');
    const existing = await this.prisma.client.product.findUnique({ where: { slug } });
    if (existing) throw new ConflictException('Slug already in use');

    const product = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: { name: input.name.trim(), slug, lifecycle: 'DRAFT' },
        include: productInclude,
      });
      await this.audit.record(
        {
          actorAdminUserId: input.actorId,
          action: 'PRODUCT_CREATED',
          entityType: 'Product',
          entityId: created.id,
          metadata: { slug: created.slug },
          requestId: input.requestId,
        },
        tx,
      );
      return created;
    });
    return this.toAdminDto(product);
  }

  async updateProduct(input: {
    id: string;
    expectedVersion: number;
    actorId: string;
    requestId?: string;
    data: {
      name?: string;
      slug?: string;
      shortDescription?: string | null;
      description?: string | null;
      availability?: string;
      featured?: boolean;
      publishAt?: string | null;
      unpublishAt?: string | null;
      seoTitle?: string | null;
      seoDescription?: string | null;
      noIndex?: boolean;
      categoryIds?: string[];
      occasionIds?: string[];
      recipientIds?: string[];
      styleIds?: string[];
      colorIds?: string[];
      variants?: Array<{
        id?: string;
        name: string;
        priceMinor: string;
        sortOrder: number;
        status: 'ACTIVE' | 'INACTIVE';
      }>;
      components?: Array<{
        flowerId?: string | null;
        displayName: string;
        quantity?: number | null;
        unit?: string;
        sortOrder: number;
      }>;
    };
  }): Promise<ProductAdminDto> {
    const product = await this.prisma.client.product.findUnique({ where: { id: input.id } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.version !== input.expectedVersion) {
      throw new ConflictException(
        'This item was changed by another user. Reload before saving.',
      );
    }

    let nextSlug = product.slug;
    if (input.data.slug !== undefined) {
      nextSlug = normalizeSlug(input.data.slug);
      if (nextSlug.length < 2) throw new BadRequestException('Invalid slug');
      if (nextSlug !== product.slug) {
        const clash = await this.prisma.client.product.findUnique({ where: { slug: nextSlug } });
        if (clash) throw new ConflictException('Slug already in use');
      }
    }

    const updated = await this.prisma.client.$transaction(async (tx) => {
      if (nextSlug !== product.slug) {
        const redirects = await tx.slugRedirect.findMany({
          where: { entityType: 'PRODUCT' },
          select: { fromSlug: true, toSlug: true },
        });
        if (wouldCreateRedirectLoop(redirects, product.slug, nextSlug)) {
          throw new BadRequestException('Slug redirect would create a loop');
        }
        await tx.slugRedirect.upsert({
          where: {
            entityType_fromSlug: { entityType: 'PRODUCT', fromSlug: product.slug },
          },
          create: {
            entityType: 'PRODUCT',
            fromSlug: product.slug,
            toSlug: nextSlug,
          },
          update: { toSlug: nextSlug },
        });
      }

      await tx.product.update({
        where: { id: product.id },
        data: {
          name: input.data.name?.trim(),
          slug: nextSlug,
          shortDescription: input.data.shortDescription,
          description: input.data.description,
          availability: input.data.availability as never,
          featured: input.data.featured,
          publishAt:
            input.data.publishAt === undefined
              ? undefined
              : input.data.publishAt
                ? new Date(input.data.publishAt)
                : null,
          unpublishAt:
            input.data.unpublishAt === undefined
              ? undefined
              : input.data.unpublishAt
                ? new Date(input.data.unpublishAt)
                : null,
          seoTitle: input.data.seoTitle,
          seoDescription: input.data.seoDescription,
          noIndex: input.data.noIndex,
          version: { increment: 1 },
        },
      });

      if (input.data.variants) {
        await tx.productVariant.deleteMany({ where: { productId: product.id } });
        if (input.data.variants.length > 0) {
          await tx.productVariant.createMany({
            data: input.data.variants.map((v) => ({
              productId: product.id,
              name: v.name.trim(),
              priceMinor: BigInt(v.priceMinor),
              sortOrder: v.sortOrder,
              status: v.status,
            })),
          });
        }
        await this.audit.record(
          {
            actorAdminUserId: input.actorId,
            action: 'PRODUCT_VARIANT_CHANGED',
            entityType: 'Product',
            entityId: product.id,
            metadata: { count: input.data.variants.length },
            requestId: input.requestId,
          },
          tx,
        );
      }

      if (input.data.components) {
        await tx.productComponent.deleteMany({ where: { productId: product.id } });
        if (input.data.components.length > 0) {
          await tx.productComponent.createMany({
            data: input.data.components.map((c) => ({
              productId: product.id,
              flowerId: c.flowerId ?? null,
              displayName: c.displayName.trim(),
              quantity: c.quantity ?? null,
              unit: (c.unit as never) ?? 'UNSPECIFIED',
              sortOrder: c.sortOrder,
            })),
          });
        }
      }

      const syncJoin = async (
        clear: () => Promise<unknown>,
        create: (ids: string[]) => Promise<unknown>,
        ids?: string[],
      ) => {
        if (ids === undefined) return;
        await clear();
        if (ids.length) await create([...new Set(ids)]);
      };

      await syncJoin(
        () => tx.productCategory.deleteMany({ where: { productId: product.id } }),
        (ids) =>
          tx.productCategory.createMany({
            data: ids.map((categoryId) => ({ productId: product.id, categoryId })),
          }),
        input.data.categoryIds,
      );
      await syncJoin(
        () => tx.productOccasion.deleteMany({ where: { productId: product.id } }),
        (ids) =>
          tx.productOccasion.createMany({
            data: ids.map((occasionId) => ({ productId: product.id, occasionId })),
          }),
        input.data.occasionIds,
      );
      await syncJoin(
        () => tx.productRecipient.deleteMany({ where: { productId: product.id } }),
        (ids) =>
          tx.productRecipient.createMany({
            data: ids.map((recipientId) => ({ productId: product.id, recipientId })),
          }),
        input.data.recipientIds,
      );
      await syncJoin(
        () => tx.productStyle.deleteMany({ where: { productId: product.id } }),
        (ids) =>
          tx.productStyle.createMany({
            data: ids.map((styleId) => ({ productId: product.id, styleId })),
          }),
        input.data.styleIds,
      );
      await syncJoin(
        () => tx.productColor.deleteMany({ where: { productId: product.id } }),
        (ids) =>
          tx.productColor.createMany({
            data: ids.map((colorId) => ({ productId: product.id, colorId })),
          }),
        input.data.colorIds,
      );

      await this.audit.record(
        {
          actorAdminUserId: input.actorId,
          action: 'PRODUCT_UPDATED',
          entityType: 'Product',
          entityId: product.id,
          requestId: input.requestId,
        },
        tx,
      );

      return tx.product.findUniqueOrThrow({
        where: { id: product.id },
        include: productInclude,
      });
    });

    return this.toAdminDto(updated);
  }

  async publishProduct(input: {
    id: string;
    expectedVersion: number;
    actorId: string;
    requestId?: string;
  }) {
    const product = await this.prisma.client.product.findUnique({
      where: { id: input.id },
      include: productInclude,
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product.version !== input.expectedVersion) {
      throw new ConflictException(
        'This item was changed by another user. Reload before saving.',
      );
    }
    const issues = validatePublishRequirements({
      name: product.name,
      slug: product.slug,
      shortDescription: product.shortDescription,
      description: product.description,
      variants: product.variants,
      hasPrimaryImage: product.media.some((m) => m.isPrimary),
    });
    if (issues.length > 0) {
      throw new BadRequestException({
        message: `Cannot publish — ${issues.length} issues`,
        error: 'PublishValidationError',
        issues,
      });
    }

    const updated = await this.prisma.client.$transaction(async (tx) => {
      const row = await tx.product.update({
        where: { id: product.id },
        data: {
          lifecycle: 'PUBLISHED',
          publishedAt: product.publishedAt ?? new Date(),
          version: { increment: 1 },
        },
        include: productInclude,
      });
      await this.audit.record(
        {
          actorAdminUserId: input.actorId,
          action: 'PRODUCT_PUBLISHED',
          entityType: 'Product',
          entityId: product.id,
          requestId: input.requestId,
        },
        tx,
      );
      return row;
    });
    return this.toAdminDto(updated);
  }

  async unpublishProduct(input: {
    id: string;
    expectedVersion: number;
    actorId: string;
    requestId?: string;
  }) {
    return this.setLifecycle(input, 'DRAFT', 'PRODUCT_UNPUBLISHED');
  }

  async archiveProduct(input: {
    id: string;
    expectedVersion: number;
    actorId: string;
    requestId?: string;
  }) {
    return this.setLifecycle(input, 'ARCHIVED', 'PRODUCT_ARCHIVED');
  }

  private async setLifecycle(
    input: { id: string; expectedVersion: number; actorId: string; requestId?: string },
    lifecycle: 'DRAFT' | 'ARCHIVED',
    action: 'PRODUCT_UNPUBLISHED' | 'PRODUCT_ARCHIVED',
  ) {
    const product = await this.prisma.client.product.findUnique({ where: { id: input.id } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.version !== input.expectedVersion) {
      throw new ConflictException(
        'This item was changed by another user. Reload before saving.',
      );
    }
    const updated = await this.prisma.client.$transaction(async (tx) => {
      const row = await tx.product.update({
        where: { id: product.id },
        data: { lifecycle, version: { increment: 1 } },
        include: productInclude,
      });
      await this.audit.record(
        {
          actorAdminUserId: input.actorId,
          action,
          entityType: 'Product',
          entityId: product.id,
          requestId: input.requestId,
        },
        tx,
      );
      return row;
    });
    return this.toAdminDto(updated);
  }

  async addProductMedia(input: {
    productId: string;
    buffer: Buffer;
    actorId: string;
    requestId?: string;
    alt?: string;
    makePrimary?: boolean;
  }) {
    const product = await this.prisma.client.product.findUnique({
      where: { id: input.productId },
      include: { media: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    const asset = await this.media.uploadImage(input.buffer);
    if (!asset) throw new BadRequestException('Upload failed');

    const makePrimary = input.makePrimary ?? product.media.length === 0;
    await this.prisma.client.$transaction(async (tx) => {
      if (makePrimary) {
        await tx.productMedia.updateMany({
          where: { productId: product.id },
          data: { isPrimary: false },
        });
      }
      await tx.productMedia.create({
        data: {
          productId: product.id,
          mediaAssetId: asset.id,
          sortOrder: product.media.length,
          isPrimary: makePrimary,
          alt: input.alt ?? null,
        },
      });
      await tx.product.update({
        where: { id: product.id },
        data: { version: { increment: 1 } },
      });
      await this.audit.record(
        {
          actorAdminUserId: input.actorId,
          action: 'PRODUCT_MEDIA_ADDED',
          entityType: 'Product',
          entityId: product.id,
          metadata: { mediaAssetId: asset.id },
          requestId: input.requestId,
        },
        tx,
      );
    });
    return this.getProduct(product.id);
  }

  async reorderProductMedia(input: {
    productId: string;
    orderedIds: string[];
    primaryId?: string;
    actorId: string;
    requestId?: string;
  }) {
    await this.prisma.client.$transaction(async (tx) => {
      for (let i = 0; i < input.orderedIds.length; i += 1) {
        await tx.productMedia.update({
          where: { id: input.orderedIds[i]! },
          data: {
            sortOrder: i,
            isPrimary: input.primaryId ? input.orderedIds[i] === input.primaryId : undefined,
          },
        });
      }
      if (input.primaryId) {
        await tx.productMedia.updateMany({
          where: { productId: input.productId, NOT: { id: input.primaryId } },
          data: { isPrimary: false },
        });
        await tx.productMedia.update({
          where: { id: input.primaryId },
          data: { isPrimary: true },
        });
      }
      await tx.product.update({
        where: { id: input.productId },
        data: { version: { increment: 1 } },
      });
      await this.audit.record(
        {
          actorAdminUserId: input.actorId,
          action: 'PRODUCT_MEDIA_REORDERED',
          entityType: 'Product',
          entityId: input.productId,
          requestId: input.requestId,
        },
        tx,
      );
    });
    return this.getProduct(input.productId);
  }

  async removeProductMedia(input: {
    productId: string;
    mediaId: string;
    actorId: string;
    requestId?: string;
  }) {
    await this.prisma.client.$transaction(async (tx) => {
      await tx.productMedia.delete({ where: { id: input.mediaId } });
      await tx.product.update({
        where: { id: input.productId },
        data: { version: { increment: 1 } },
      });
      await this.audit.record(
        {
          actorAdminUserId: input.actorId,
          action: 'PRODUCT_MEDIA_REMOVED',
          entityType: 'Product',
          entityId: input.productId,
          metadata: { mediaId: input.mediaId },
          requestId: input.requestId,
        },
        tx,
      );
    });
    return this.getProduct(input.productId);
  }

  // ---------- taxonomies ----------

  private taxonomyModelKey(kind: string): 'flower' | 'category' | 'occasion' | 'recipient' | 'style' | 'color' {
    switch (kind) {
      case 'flowers':
        return 'flower';
      case 'categories':
        return 'category';
      case 'occasions':
        return 'occasion';
      case 'recipients':
        return 'recipient';
      case 'styles':
        return 'style';
      case 'colors':
        return 'color';
      default:
        throw new NotFoundException('Unknown taxonomy');
    }
  }

  private taxonomyDelegate(kind: string): {
    findMany: (args?: object) => Promise<Array<Parameters<CatalogService['mapTaxonomy']>[0]>>;
    findUnique: (args: object) => Promise<(Parameters<CatalogService['mapTaxonomy']>[0] & { version: number }) | null>;
    create: (args: object) => Promise<Parameters<CatalogService['mapTaxonomy']>[0]>;
    update: (args: object) => Promise<Parameters<CatalogService['mapTaxonomy']>[0]>;
  } {
    const key = this.taxonomyModelKey(kind);
    return this.prisma.client[key] as never;
  }

  async listTaxonomy(kind: string) {
    const rows = await this.taxonomyDelegate(kind).findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((r) => this.mapTaxonomy(r));
  }

  async createTaxonomy(
    kind: string,
    input: {
      name: string;
      slug?: string;
      description?: string;
      sortOrder?: number;
      actorId: string;
      requestId?: string;
    },
  ) {
    const slug = normalizeSlug(input.slug ?? input.name);
    const modelKey = this.taxonomyModelKey(kind);
    const row = await this.prisma.client.$transaction(async (tx) => {
      const created = await (tx[modelKey] as never as { create: (a: object) => Promise<Parameters<CatalogService['mapTaxonomy']>[0]> }).create({
        data: {
          name: input.name.trim(),
          slug,
          description: input.description ?? null,
          sortOrder: input.sortOrder ?? 0,
        },
      });
      await this.audit.record(
        {
          actorAdminUserId: input.actorId,
          action: 'TAXONOMY_CREATED',
          entityType: kind,
          entityId: created.id,
          metadata: { slug },
          requestId: input.requestId,
        },
        tx,
      );
      return created;
    });
    return this.mapTaxonomy(row);
  }

  async updateTaxonomy(
    kind: string,
    id: string,
    expectedVersion: number,
    data: Partial<{
      name: string;
      slug: string;
      description: string | null;
      sortOrder: number;
      visibility: 'VISIBLE' | 'HIDDEN';
      seoTitle: string | null;
      seoDescription: string | null;
      noIndex: boolean;
    }>,
    actorId: string,
    requestId?: string,
  ) {
    const delegate = this.taxonomyDelegate(kind);
    const existing = await delegate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Not found');
    if (existing.version !== expectedVersion) {
      throw new ConflictException(
        'This item was changed by another user. Reload before saving.',
      );
    }
    const modelKey = this.taxonomyModelKey(kind);

    const row = await this.prisma.client.$transaction(async (tx) => {
      const updated = await (tx[modelKey] as never as { update: (a: object) => Promise<Parameters<CatalogService['mapTaxonomy']>[0]> }).update({
        where: { id },
        data: {
          ...data,
          slug: data.slug !== undefined ? normalizeSlug(data.slug) : undefined,
          version: { increment: 1 },
        },
      });
      await this.audit.record(
        {
          actorAdminUserId: actorId,
          action: 'TAXONOMY_UPDATED',
          entityType: kind,
          entityId: id,
          requestId,
        },
        tx,
      );
      return updated;
    });
    return this.mapTaxonomy(row);
  }

  // ---------- collections ----------

  async listCollections() {
    const rows = await this.prisma.client.collection.findMany({
      include: { products: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      type: c.type,
      rules: (c.rules as CollectionRulesDto | null) ?? null,
      sortOrder: c.sortOrder,
      visibility: c.visibility,
      version: c.version,
      seoTitle: c.seoTitle,
      seoDescription: c.seoDescription,
      noIndex: c.noIndex,
      productIds: c.products.map((p) => p.productId),
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));
  }

  async createCollection(input: {
    name: string;
    slug?: string;
    type: 'MANUAL' | 'RULE_BASED';
    rules?: CollectionRulesDto | null;
    actorId: string;
    requestId?: string;
  }) {
    const slug = normalizeSlug(input.slug ?? input.name);
    const row = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.collection.create({
        data: {
          name: input.name.trim(),
          slug,
          type: input.type,
          rules: input.rules ? (input.rules as never) : undefined,
        },
        include: { products: true },
      });
      await this.audit.record(
        {
          actorAdminUserId: input.actorId,
          action: 'COLLECTION_CREATED',
          entityType: 'Collection',
          entityId: created.id,
          requestId: input.requestId,
        },
        tx,
      );
      return created;
    });
    return (await this.listCollections()).find((c) => c.id === row.id)!;
  }

  async updateCollection(input: {
    id: string;
    expectedVersion: number;
    name?: string;
    slug?: string;
    description?: string | null;
    type?: 'MANUAL' | 'RULE_BASED';
    rules?: CollectionRulesDto | null;
    visibility?: 'VISIBLE' | 'HIDDEN';
    sortOrder?: number;
    productIds?: string[];
    seoTitle?: string | null;
    seoDescription?: string | null;
    noIndex?: boolean;
    actorId: string;
    requestId?: string;
  }) {
    const existing = await this.prisma.client.collection.findUnique({ where: { id: input.id } });
    if (!existing) throw new NotFoundException('Collection not found');
    if (existing.version !== input.expectedVersion) {
      throw new ConflictException(
        'This item was changed by another user. Reload before saving.',
      );
    }
    await this.prisma.client.$transaction(async (tx) => {
      await tx.collection.update({
        where: { id: input.id },
        data: {
          name: input.name?.trim(),
          slug: input.slug !== undefined ? normalizeSlug(input.slug) : undefined,
          description: input.description,
          type: input.type,
          rules: input.rules === undefined ? undefined : (input.rules as never),
          visibility: input.visibility,
          sortOrder: input.sortOrder,
          seoTitle: input.seoTitle,
          seoDescription: input.seoDescription,
          noIndex: input.noIndex,
          version: { increment: 1 },
        },
      });
      if (input.productIds) {
        await tx.collectionProduct.deleteMany({ where: { collectionId: input.id } });
        if (input.productIds.length) {
          await tx.collectionProduct.createMany({
            data: input.productIds.map((productId, index) => ({
              collectionId: input.id,
              productId,
              sortOrder: index,
            })),
          });
        }
      }
      await this.audit.record(
        {
          actorAdminUserId: input.actorId,
          action: 'COLLECTION_UPDATED',
          entityType: 'Collection',
          entityId: input.id,
          requestId: input.requestId,
        },
        tx,
      );
    });
    return (await this.listCollections()).find((c) => c.id === input.id)!;
  }

  async previewCollectionMatches(rules: CollectionRulesDto) {
    const products = await this.prisma.client.product.findMany({
      include: productInclude,
      take: 500,
    });
    const matched = products.filter((p) =>
      matchesCollectionRules(
        {
          availability: p.availability,
          lifecycle: p.lifecycle,
          categorySlugs: p.categories.map((c) => c.category.slug),
          occasionSlugs: p.occasions.map((c) => c.occasion.slug),
          recipientSlugs: p.recipients.map((c) => c.recipient.slug),
          styleSlugs: p.styles.map((c) => c.style.slug),
          flowerSlugs: p.components
            .map((c) => c.flower?.slug)
            .filter((s): s is string => Boolean(s)),
          colorSlugs: p.colors.map((c) => c.color.slug),
          minActivePriceMinor:
            derivePriceRange(
              p.currency,
              p.variants.filter((v) => v.status === 'ACTIVE').map((v) => v.priceMinor),
            ) != null
              ? BigInt(
                  derivePriceRange(
                    p.currency,
                    p.variants.filter((v) => v.status === 'ACTIVE').map((v) => v.priceMinor),
                  )!.minMinor,
                )
              : null,
        },
        rules,
      ),
    );
    return {
      matchCount: matched.length,
      products: matched.slice(0, 50).map((p) => this.toListItem(p)),
    };
  }

  // ---------- public ----------

  private publicWhere(now = new Date()): Prisma.ProductWhereInput {
    return {
      lifecycle: 'PUBLISHED',
      AND: [
        {
          OR: [{ publishAt: null }, { publishAt: { lte: now } }],
        },
        {
          OR: [{ publishedAt: null }, { publishedAt: { lte: now } }, { publishAt: { not: null } }],
        },
        {
          OR: [{ unpublishAt: null }, { unpublishAt: { gt: now } }],
        },
      ],
    };
  }

  async publicListProducts(input: {
    page: number;
    pageSize: number;
    category?: string;
    occasion?: string;
    recipient?: string;
    flower?: string;
    style?: string;
    color?: string;
    minPrice?: string;
    maxPrice?: string;
  }) {
    const now = new Date();
    const where: Prisma.ProductWhereInput = {
      ...this.publicWhere(now),
      ...(input.category
        ? { categories: { some: { category: { slug: input.category, visibility: 'VISIBLE' } } } }
        : {}),
      ...(input.occasion
        ? { occasions: { some: { occasion: { slug: input.occasion, visibility: 'VISIBLE' } } } }
        : {}),
      ...(input.recipient
        ? { recipients: { some: { recipient: { slug: input.recipient, visibility: 'VISIBLE' } } } }
        : {}),
      ...(input.style
        ? { styles: { some: { style: { slug: input.style, visibility: 'VISIBLE' } } } }
        : {}),
      ...(input.color
        ? { colors: { some: { color: { slug: input.color, visibility: 'VISIBLE' } } } }
        : {}),
      ...(input.flower
        ? {
            components: {
              some: { flower: { slug: input.flower, visibility: 'VISIBLE' } },
            },
          }
        : {}),
    };

    const skip = (input.page - 1) * input.pageSize;
    let rows = await this.prisma.client.product.findMany({
      where,
      include: productInclude,
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });

    if (input.minPrice || input.maxPrice) {
      const min = input.minPrice ? BigInt(input.minPrice) : null;
      const max = input.maxPrice ? BigInt(input.maxPrice) : null;
      rows = rows.filter((p) => {
        const prices = p.variants
          .filter((v) => v.status === 'ACTIVE')
          .map((v) => v.priceMinor);
        if (!prices.length) return false;
        const lo = prices.reduce((a, b) => (a < b ? a : b));
        if (min != null && lo < min) return false;
        if (max != null && lo > max) return false;
        return true;
      });
    }

    // Final effective filter (schedule edge cases)
    rows = rows.filter((p) => isEffectivelyPublished(p, now));
    const total = rows.length;
    const pageRows = rows.slice(skip, skip + input.pageSize);
    return {
      items: pageRows.map((r) => this.toListItem(r)),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async publicGetProductBySlug(slug: string) {
    const now = new Date();
    let product = await this.prisma.client.product.findUnique({
      where: { slug },
      include: productInclude,
    });
    if (!product || !isEffectivelyPublished(product, now)) {
      const redirect = await this.prisma.client.slugRedirect.findUnique({
        where: { entityType_fromSlug: { entityType: 'PRODUCT', fromSlug: slug } },
      });
      if (redirect) {
        product = await this.prisma.client.product.findUnique({
          where: { slug: redirect.toSlug },
          include: productInclude,
        });
        if (product && isEffectivelyPublished(product, now)) {
          return { redirectTo: redirect.toSlug, product: this.toPublicDto(product) };
        }
      }
      throw new NotFoundException('Product not found');
    }
    return { product: this.toPublicDto(product) };
  }

  async publicListCategories() {
    const rows = await this.prisma.client.category.findMany({
      where: { visibility: 'VISIBLE' },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((c) => this.ref(c));
  }

  async publicGetCollection(slug: string) {
    const collection = await this.prisma.client.collection.findUnique({
      where: { slug },
      include: {
        products: {
          orderBy: { sortOrder: 'asc' },
          include: { product: { include: productInclude } },
        },
      },
    });
    if (!collection || collection.visibility !== 'VISIBLE') {
      throw new NotFoundException('Collection not found');
    }
    const now = new Date();
    let products = collection.products
      .map((cp) => cp.product)
      .filter((p) => isEffectivelyPublished(p, now));

    if (collection.type === 'RULE_BASED' && collection.rules) {
      const all = await this.prisma.client.product.findMany({ include: productInclude });
      products = all.filter(
        (p) =>
          isEffectivelyPublished(p, now) &&
          matchesCollectionRules(
            {
              availability: p.availability,
              lifecycle: p.lifecycle,
              categorySlugs: p.categories.map((c) => c.category.slug),
              occasionSlugs: p.occasions.map((c) => c.occasion.slug),
              recipientSlugs: p.recipients.map((c) => c.recipient.slug),
              styleSlugs: p.styles.map((c) => c.style.slug),
              flowerSlugs: p.components
                .map((c) => c.flower?.slug)
                .filter((s): s is string => Boolean(s)),
              colorSlugs: p.colors.map((c) => c.color.slug),
              minActivePriceMinor: (() => {
                const r = activeVariantPrices(p.currency, p.variants);
                return r ? BigInt(r.minMinor) : null;
              })(),
            },
            collection.rules as CollectionRulesDto,
          ),
      );
    }

    return {
      id: collection.id,
      slug: collection.slug,
      name: collection.name,
      description: collection.description,
      seo: {
        seoTitle: collection.seoTitle,
        seoDescription: collection.seoDescription,
        noIndex: collection.noIndex,
        resolvedTitle: collection.seoTitle || collection.name,
        resolvedDescription: collection.seoDescription || collection.description || '',
      },
      products: products.map((p) => this.toListItem(p)),
    };
  }
}

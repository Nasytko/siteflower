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
import type { ActorContext } from '../common/actor.util';
import { BestsellersService } from './bestsellers.service';
import { BudgetRangesService } from './budget-ranges.service';
import { OCC_CONFLICT_MESSAGE, validatePublishRequirements } from './catalog.logic';
import { toProductAdminDto, toProductListItemDto, toProductPublicDto } from './catalog.mapper';
import type {
  CreateProductDto,
  ProductListQueryDto,
  PublishProductDto,
  ReorderProductMediaDto,
  SetProductBestsellerGroupsDto,
  SetProductComponentsDto,
  SetProductTaxonomiesDto,
  SetProductVariantsDto,
  UpdateProductDto,
  UpdateProductMediaDto,
  UploadProductMediaDto,
} from './products.dto';
import { ProductsRepository } from './products.repository';
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

function publishValidationException(issues: PublishValidationIssue[]): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    error: 'PublishValidationError',
    message: `Cannot publish — ${issues.length} ${issues.length === 1 ? 'issue' : 'issues'}`,
    issues,
  });
}

function trimmedOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly products: ProductsRepository,
    private readonly slugRedirects: SlugRedirectsService,
    private readonly bestsellers: BestsellersService,
    private readonly budgetRanges: BudgetRangesService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
  ) {}

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

  async update(
    id: string,
    input: UpdateProductDto,
    actor: ActorContext,
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
        ...(input.publishAt === undefined ? {} : { publishAt: new Date(input.publishAt) }),
        ...(input.unpublishAt === undefined
          ? {}
          : { unpublishAt: new Date(input.unpublishAt) }),
      };

      await this.guardVersion(tx, id, input.expectedVersion, data);
      await this.recordAudit(tx, actor, 'PRODUCT_UPDATED', id, {
        fields: Object.keys(data),
        ...(slugChanged ? { previousSlug: product.slug, slug: nextSlug } : {}),
      });
    });

    return this.getById(id);
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

    return this.getById(id);
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

    return this.getById(id);
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

    return this.getById(id);
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

    return this.getById(id);
  }

  async publish(
    id: string,
    input: PublishProductDto,
    actor: ActorContext,
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
      });
    });

    return this.getById(id);
  }

  async unpublish(
    id: string,
    expectedVersion: number,
    actor: ActorContext,
  ): Promise<ProductAdminDto> {
    await this.prisma.client.$transaction(async (tx) => {
      await this.guardVersion(tx, id, expectedVersion, {
        lifecycle: 'DRAFT',
        publishAt: null,
        unpublishAt: null,
      });
      await this.recordAudit(tx, actor, 'PRODUCT_UNPUBLISHED', id);
    });

    return this.getById(id);
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

    return this.getById(id);
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

    const asset = await this.media.uploadImage(file.buffer, file.originalname);
    if (!asset) {
      throw new BadRequestException('Image could not be stored');
    }
    const isPrimary = input.isPrimary ?? product.media.length === 0;

    await this.prisma.client.$transaction(async (tx) => {
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
          sortOrder: product.media.length,
          isPrimary,
          alt: input.alt ? trimmedOrNull(input.alt) : null,
          caption: input.caption ? trimmedOrNull(input.caption) : null,
        },
      });
      await this.products.bumpVersion(id, tx);
      await this.recordAudit(tx, actor, 'PRODUCT_MEDIA_ADDED', id, {
        mediaAssetId: asset.id,
        isPrimary,
      });
    });

    return this.getById(id);
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

    return this.getById(id);
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
      await tx.productMedia.delete({ where: { id: mediaId } });
      const next = product.media.find((item) => item.id !== mediaId);
      if (media.isPrimary && next) {
        await tx.productMedia.update({ where: { id: next.id }, data: { isPrimary: true } });
      }
      await this.products.bumpVersion(id, tx);
      await this.recordAudit(tx, actor, 'PRODUCT_MEDIA_REMOVED', id, { mediaId });
    });

    return this.getById(id);
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

    return this.getById(id);
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

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  COMMERCIAL_AVAILABILITIES,
  normalizeSlug,
  type CollectionAdminDto,
  type CollectionPublicDto,
  type CollectionRulesDto,
  type CollectionType,
  type PaginatedResponse,
  type ProductListItemDto,
  type TaxonomyVisibility,
} from '@bouquet-one/contracts';
import { Prisma } from '@bouquet-one/database';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { hashIp } from '../auth/crypto.util';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../database/prisma.service';
import { MediaService } from '../media/media.service';
import type { ActorContext } from './catalog.actor';
import {
  isEffectivelyPublished,
  matchesCollectionRules,
  OCC_CONFLICT_MESSAGE,
} from './catalog.logic';
import {
  asCollectionRules,
  COLLECTION_INCLUDE,
  toCollectionAdminDto,
  toCollectionPublicDto,
  toProductListItemDto,
  toRuleCandidate,
  type CollectionWithProducts,
  type ProductWithRelations,
} from './catalog.mapper';
import { effectivelyPublishedWhere, ProductsRepository } from './products.repository';

const PRICE_MINOR_PATTERN = /^\d{1,15}$/;

const slugList = z.array(z.string().min(1).max(120)).max(50);

const collectionRulesSchema = z
  .object({
    categorySlugs: slugList.optional(),
    occasionSlugs: slugList.optional(),
    recipientSlugs: slugList.optional(),
    styleSlugs: slugList.optional(),
    flowerSlugs: slugList.optional(),
    colorSlugs: slugList.optional(),
    minPriceMinor: z.string().regex(PRICE_MINOR_PATTERN).optional(),
    maxPriceMinor: z.string().regex(PRICE_MINOR_PATTERN).optional(),
    availabilities: z.array(z.enum(COMMERCIAL_AVAILABILITIES)).optional(),
    requirePublished: z.boolean().optional(),
  })
  .strict();

/** Rules are stored as JSON, so they are validated on every write. */
export function parseCollectionRules(value: unknown): CollectionRulesDto {
  const result = collectionRulesSchema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues.map(
        (issue) => `rules${issue.path.length ? `.${issue.path.join('.')}` : ''}: ${issue.message}`,
      ),
    );
  }
  if (
    result.data.minPriceMinor !== undefined &&
    result.data.maxPriceMinor !== undefined &&
    BigInt(result.data.minPriceMinor) > BigInt(result.data.maxPriceMinor)
  ) {
    throw new BadRequestException('rules.minPriceMinor must not exceed rules.maxPriceMinor');
  }
  return result.data;
}

export type CollectionListQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  type?: CollectionType;
  visibility?: TaxonomyVisibility;
};

export type CreateCollectionInput = {
  name: string;
  slug?: string;
  description?: string;
  type?: CollectionType;
  rules?: unknown;
  sortOrder?: number;
  visibility?: TaxonomyVisibility;
  seoTitle?: string;
  seoDescription?: string;
  noIndex?: boolean;
};

export type UpdateCollectionInput = Partial<CreateCollectionInput> & { expectedVersion: number };

@Injectable()
export class CollectionsService {
  constructor(
    private readonly products: ProductsRepository,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
  ) {}

  private readonly urlFor = (storageKey: string) => this.media.getPublicUrl(storageKey);

  async list(query: CollectionListQuery): Promise<PaginatedResponse<CollectionAdminDto>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where: Prisma.CollectionWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.visibility ? { visibility: query.visibility } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { slug: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.client.collection.findMany({
        where,
        include: COLLECTION_INCLUDE,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.client.collection.count({ where }),
    ]);

    return {
      items: items.map((collection) => toCollectionAdminDto(collection)),
      total,
      page,
      pageSize,
    };
  }

  async getById(id: string): Promise<CollectionAdminDto> {
    const collection = await this.findOrThrow(id);
    if (collection.type !== 'RULE_BASED') {
      return toCollectionAdminDto(collection);
    }
    const rules = asCollectionRules(collection.rules);
    const matches = rules ? await this.matchProducts(rules) : [];
    return toCollectionAdminDto(collection, matches.length);
  }

  async create(input: CreateCollectionInput, actor: ActorContext): Promise<CollectionAdminDto> {
    const name = input.name.trim();
    const slug = normalizeSlug(input.slug ?? name);
    if (!slug) {
      throw new BadRequestException('Slug could not be derived from the name');
    }
    const type = input.type ?? 'MANUAL';
    const rules = this.rulesForType(type, input.rules);

    const created = await this.prisma.client.$transaction(async (tx) => {
      const taken = await tx.collection.findUnique({ where: { slug }, select: { id: true } });
      if (taken) {
        throw new ConflictException('Slug already in use');
      }
      const collection = await tx.collection.create({
        data: {
          slug,
          name,
          description: input.description?.trim() ?? null,
          type,
          rules: rules === null ? Prisma.DbNull : (rules as Prisma.InputJsonValue),
          ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
          ...(input.visibility ? { visibility: input.visibility } : {}),
          seoTitle: input.seoTitle?.trim() ?? null,
          seoDescription: input.seoDescription?.trim() ?? null,
          ...(input.noIndex === undefined ? {} : { noIndex: input.noIndex }),
        },
        select: { id: true },
      });
      await this.recordAudit(tx, actor, 'COLLECTION_CREATED', collection.id, { slug, name, type });
      return collection;
    });

    return this.getById(created.id);
  }

  async update(
    id: string,
    input: UpdateCollectionInput,
    actor: ActorContext,
  ): Promise<CollectionAdminDto> {
    const current = await this.findOrThrow(id);
    const nextType = input.type ?? current.type;
    const nextSlug = input.slug === undefined ? current.slug : normalizeSlug(input.slug);
    if (!nextSlug) {
      throw new BadRequestException('Slug cannot be empty');
    }
    const slugChanged = nextSlug !== current.slug;
    const rules =
      input.rules === undefined && input.type === undefined
        ? undefined
        : this.rulesForType(nextType, input.rules ?? asCollectionRules(current.rules));

    await this.prisma.client.$transaction(async (tx) => {
      if (slugChanged) {
        const taken = await tx.collection.findUnique({
          where: { slug: nextSlug },
          select: { id: true },
        });
        if (taken && taken.id !== id) {
          throw new ConflictException('Slug already in use');
        }
      }

      const data: Prisma.CollectionUpdateManyMutationInput = {
        ...(input.name === undefined ? {} : { name: input.name.trim() }),
        ...(slugChanged ? { slug: nextSlug } : {}),
        ...(input.description === undefined
          ? {}
          : { description: input.description.trim() || null }),
        ...(input.type === undefined ? {} : { type: nextType }),
        ...(rules === undefined
          ? {}
          : { rules: rules === null ? Prisma.DbNull : (rules as Prisma.InputJsonValue) }),
        ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
        ...(input.visibility === undefined ? {} : { visibility: input.visibility }),
        ...(input.seoTitle === undefined ? {} : { seoTitle: input.seoTitle.trim() || null }),
        ...(input.seoDescription === undefined
          ? {}
          : { seoDescription: input.seoDescription.trim() || null }),
        ...(input.noIndex === undefined ? {} : { noIndex: input.noIndex }),
      };

      const result = await tx.collection.updateMany({
        where: { id, version: input.expectedVersion },
        data: { ...data, version: { increment: 1 } },
      });
      if (result.count === 0) {
        throw new ConflictException(OCC_CONFLICT_MESSAGE);
      }

      if (nextType === 'RULE_BASED' && current.products.length > 0) {
        await tx.collectionProduct.deleteMany({ where: { collectionId: id } });
      }

      await this.recordAudit(tx, actor, 'COLLECTION_UPDATED', id, {
        fields: Object.keys(data),
        ...(slugChanged ? { previousSlug: current.slug, slug: nextSlug } : {}),
      });
    });

    return this.getById(id);
  }

  async setMembers(
    id: string,
    expectedVersion: number,
    productIds: string[],
    actor: ActorContext,
  ): Promise<CollectionAdminDto> {
    const collection = await this.findOrThrow(id);
    if (collection.type !== 'MANUAL') {
      throw new BadRequestException('Only MANUAL collections have explicit members');
    }
    const unique = [...new Set(productIds)];
    if (unique.length !== productIds.length) {
      throw new BadRequestException('productIds must not contain duplicates');
    }

    await this.prisma.client.$transaction(async (tx) => {
      const result = await tx.collection.updateMany({
        where: { id, version: expectedVersion },
        data: { version: { increment: 1 } },
      });
      if (result.count === 0) {
        throw new ConflictException(OCC_CONFLICT_MESSAGE);
      }

      if (unique.length > 0) {
        const found = await tx.product.count({ where: { id: { in: unique } } });
        if (found !== unique.length) {
          throw new BadRequestException('Unknown product reference');
        }
      }

      await tx.collectionProduct.deleteMany({ where: { collectionId: id } });
      if (unique.length > 0) {
        await tx.collectionProduct.createMany({
          data: unique.map((productId, index) => ({
            collectionId: id,
            productId,
            sortOrder: index,
          })),
        });
      }

      await this.recordAudit(tx, actor, 'COLLECTION_UPDATED', id, { members: unique.length });
    });

    return this.getById(id);
  }

  /** Admin preview of the products a rule set currently selects. */
  async previewRules(rules: unknown): Promise<{ items: ProductListItemDto[]; total: number }> {
    const parsed = parseCollectionRules(rules);
    const matches = await this.matchProducts(parsed);
    return {
      items: matches.map((product) => toProductListItemDto(product, this.urlFor)),
      total: matches.length,
    };
  }

  async previewById(id: string): Promise<{ items: ProductListItemDto[]; total: number }> {
    const collection = await this.findOrThrow(id);
    if (collection.type !== 'RULE_BASED') {
      const products = await this.resolveProducts(collection, false);
      return {
        items: products.map((product) => toProductListItemDto(product, this.urlFor)),
        total: products.length,
      };
    }
    return this.previewRules(asCollectionRules(collection.rules) ?? {});
  }

  async findPublicBySlug(slug: string): Promise<CollectionPublicDto> {
    const collection = await this.prisma.client.collection.findUnique({
      where: { slug },
      include: COLLECTION_INCLUDE,
    });
    if (!collection || collection.visibility !== 'VISIBLE') {
      throw new NotFoundException('Collection not found');
    }
    const products = await this.resolveProducts(collection, true);
    return toCollectionPublicDto(collection, products, this.urlFor);
  }

  async matchProducts(
    rules: CollectionRulesDto,
    options: { publicOnly?: boolean } = {},
  ): Promise<ProductWithRelations[]> {
    const where: Prisma.ProductWhereInput = options.publicOnly
      ? effectivelyPublishedWhere(new Date())
      : rules.requirePublished === false
        ? {}
        : { lifecycle: 'PUBLISHED' };
    const candidates = await this.products.findMany(where);
    return candidates.filter((product) => matchesCollectionRules(toRuleCandidate(product), rules));
  }

  private async resolveProducts(
    collection: CollectionWithProducts,
    publicOnly: boolean,
  ): Promise<ProductWithRelations[]> {
    if (collection.type === 'RULE_BASED') {
      const rules = asCollectionRules(collection.rules);
      return rules ? this.matchProducts(rules, { publicOnly }) : [];
    }

    const order = new Map(collection.products.map((link) => [link.productId, link.sortOrder]));
    const products = await this.products.findManyByIds([...order.keys()]);
    return products
      .filter((product) => !publicOnly || isEffectivelyPublished(product))
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  private rulesForType(type: CollectionType, rules: unknown): CollectionRulesDto | null {
    if (type === 'MANUAL') {
      return null;
    }
    if (rules === undefined || rules === null) {
      throw new BadRequestException('RULE_BASED collections require rules');
    }
    return parseCollectionRules(rules);
  }

  private async findOrThrow(id: string): Promise<CollectionWithProducts> {
    const collection = await this.prisma.client.collection.findUnique({
      where: { id },
      include: COLLECTION_INCLUDE,
    });
    if (!collection) {
      throw new NotFoundException('Collection not found');
    }
    return collection;
  }

  private recordAudit(
    tx: Prisma.TransactionClient,
    actor: ActorContext,
    action: 'COLLECTION_CREATED' | 'COLLECTION_UPDATED',
    entityId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.record(
      {
        actorAdminUserId: actor.actorId,
        action,
        entityType: 'Collection',
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

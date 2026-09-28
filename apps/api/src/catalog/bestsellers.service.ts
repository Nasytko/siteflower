import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  normalizeSlug,
  type BestsellerGroupAdminDto,
  type BestsellerGroupPublicDto,
  type ProductListItemDto,
} from '@bouquet-one/contracts';
import type { Prisma } from '@bouquet-one/database';
import { AuditService } from '../audit/audit.service';
import { hashIp } from '../auth/crypto.util';
import type { ActorContext } from '../common/actor.util';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../database/prisma.service';
import { MediaService } from '../media/media.service';
import { OCC_CONFLICT_MESSAGE } from './catalog.logic';
import {
  toBestsellerGroupAdminDto,
  toBestsellerGroupPublicDto,
  toProductListItemDto,
  type BestsellerGroupWithProducts,
} from './catalog.mapper';
import { effectivelyPublishedWhere, ProductsRepository } from './products.repository';

const GROUP_INCLUDE = {
  products: { orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.BestsellerGroupInclude;

export type CreateBestsellerGroupInput = {
  name: string;
  slug?: string;
  title?: string | null;
  sortOrder?: number;
  active?: boolean;
};

export type UpdateBestsellerGroupInput = Partial<CreateBestsellerGroupInput> & {
  expectedVersion: number;
};

/**
 * Manual merchandising groups ("Хиты недели", …). Deliberately not a rule engine:
 * the shop owner curates order, the storefront renders it verbatim.
 */
@Injectable()
export class BestsellersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsRepository,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    private readonly appConfig: AppConfigService,
  ) {}

  private readonly urlFor = (storageKey: string) => this.media.getPublicUrl(storageKey);

  async listAdmin(): Promise<BestsellerGroupAdminDto[]> {
    const groups = await this.prisma.client.bestsellerGroup.findMany({
      include: GROUP_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const productsById = await this.loadProducts(groups, { publicOnly: false });
    return groups.map((group) => toBestsellerGroupAdminDto(group, productsById));
  }

  async getAdmin(id: string): Promise<BestsellerGroupAdminDto> {
    const group = await this.findOrThrow(id);
    const productsById = await this.loadProducts([group], { publicOnly: false });
    return toBestsellerGroupAdminDto(group, productsById);
  }

  /** Public groups: active groups, orderable products only, single batched product query. */
  async listPublic(): Promise<BestsellerGroupPublicDto[]> {
    const groups = await this.prisma.client.bestsellerGroup.findMany({
      where: { active: true },
      include: GROUP_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const productsById = await this.loadProducts(groups, { publicOnly: true });
    return groups
      .map((group) => toBestsellerGroupPublicDto(group, productsById))
      .filter((group) => group.products.length > 0);
  }

  async getPublicBySlug(slug: string): Promise<BestsellerGroupPublicDto> {
    const group = await this.prisma.client.bestsellerGroup.findUnique({
      where: { slug },
      include: GROUP_INCLUDE,
    });
    if (!group || !group.active) {
      throw new NotFoundException('Bestseller group not found');
    }
    const productsById = await this.loadProducts([group], { publicOnly: true });
    return toBestsellerGroupPublicDto(group, productsById);
  }

  async create(
    input: CreateBestsellerGroupInput,
    actor: ActorContext,
  ): Promise<BestsellerGroupAdminDto> {
    const name = input.name.trim();
    const slug = normalizeSlug(input.slug ?? name);
    if (!slug) {
      throw new BadRequestException('Не удалось сформировать slug из названия');
    }

    const created = await this.prisma.client.$transaction(async (tx) => {
      const taken = await tx.bestsellerGroup.findUnique({ where: { slug }, select: { id: true } });
      if (taken) {
        throw new ConflictException('Slug already in use');
      }
      const group = await tx.bestsellerGroup.create({
        data: {
          slug,
          name,
          title: input.title?.trim() ?? null,
          ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
          ...(input.active === undefined ? {} : { active: input.active }),
        },
        select: { id: true },
      });
      await this.recordAudit(tx, actor, group.id, { created: true, slug, name });
      return group;
    });

    return this.getAdmin(created.id);
  }

  async update(
    id: string,
    input: UpdateBestsellerGroupInput,
    actor: ActorContext,
  ): Promise<BestsellerGroupAdminDto> {
    const current = await this.findOrThrow(id);
    const nextSlug = input.slug === undefined ? current.slug : normalizeSlug(input.slug);
    if (!nextSlug) {
      throw new BadRequestException('Slug не может быть пустым');
    }
    const slugChanged = nextSlug !== current.slug;

    await this.prisma.client.$transaction(async (tx) => {
      if (slugChanged) {
        const taken = await tx.bestsellerGroup.findUnique({
          where: { slug: nextSlug },
          select: { id: true },
        });
        if (taken && taken.id !== id) {
          throw new ConflictException('Slug already in use');
        }
      }

      const data: Prisma.BestsellerGroupUpdateManyMutationInput = {
        ...(input.name === undefined ? {} : { name: input.name.trim() }),
        ...(slugChanged ? { slug: nextSlug } : {}),
        ...(input.title === undefined ? {} : { title: input.title?.trim() || null }),
        ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
        ...(input.active === undefined ? {} : { active: input.active }),
      };

      const result = await tx.bestsellerGroup.updateMany({
        where: { id, version: input.expectedVersion },
        data: { ...data, version: { increment: 1 } },
      });
      if (result.count === 0) {
        throw new ConflictException(OCC_CONFLICT_MESSAGE);
      }
      await this.recordAudit(tx, actor, id, { fields: Object.keys(data) });
    });

    return this.getAdmin(id);
  }

  async remove(id: string, expectedVersion: number, actor: ActorContext): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      const deleted = await tx.bestsellerGroup.deleteMany({
        where: { id, version: expectedVersion },
      });
      if (deleted.count === 0) {
        const exists = await tx.bestsellerGroup.findUnique({ where: { id }, select: { id: true } });
        if (exists) {
          throw new ConflictException(OCC_CONFLICT_MESSAGE);
        }
        throw new NotFoundException('Bestseller group not found');
      }
      await this.recordAudit(tx, actor, id, { deleted: true });
    });
  }

  /** Replaces membership and its display order in one shot (order = array order). */
  async setProducts(
    id: string,
    expectedVersion: number,
    productIds: string[],
    actor: ActorContext,
  ): Promise<BestsellerGroupAdminDto> {
    const unique = [...new Set(productIds)];
    if (unique.length !== productIds.length) {
      throw new BadRequestException('productIds не должны повторяться');
    }

    await this.prisma.client.$transaction(async (tx) => {
      await this.bumpGroupVersion(tx, id, expectedVersion);
      if (unique.length > 0) {
        const found = await tx.product.count({ where: { id: { in: unique } } });
        if (found !== unique.length) {
          throw new BadRequestException('Указан несуществующий товар');
        }
      }
      await tx.bestsellerGroupProduct.deleteMany({ where: { groupId: id } });
      if (unique.length > 0) {
        await tx.bestsellerGroupProduct.createMany({
          data: unique.map((productId, index) => ({
            groupId: id,
            productId,
            sortOrder: index * 10,
          })),
        });
      }
      await this.recordAudit(tx, actor, id, { members: unique.length });
    });

    return this.getAdmin(id);
  }

  async reorderProducts(
    id: string,
    expectedVersion: number,
    productIds: string[],
    actor: ActorContext,
  ): Promise<BestsellerGroupAdminDto> {
    const group = await this.findOrThrow(id);
    const owned = new Set(group.products.map((link) => link.productId));
    const unique = [...new Set(productIds)];
    if (unique.length !== owned.size || unique.some((productId) => !owned.has(productId))) {
      throw new BadRequestException('Передайте все товары подборки ровно один раз');
    }

    await this.prisma.client.$transaction(async (tx) => {
      await this.bumpGroupVersion(tx, id, expectedVersion);
      for (const [index, productId] of unique.entries()) {
        await tx.bestsellerGroupProduct.update({
          where: { groupId_productId: { groupId: id, productId } },
          data: { sortOrder: index * 10 },
        });
      }
      await this.recordAudit(tx, actor, id, { reordered: unique.length });
    });

    return this.getAdmin(id);
  }

  /** Product-side assignment used by the product editor. */
  async setGroupsForProduct(
    productId: string,
    groupIds: string[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const unique = [...new Set(groupIds)];
    if (unique.length > 0) {
      const found = await tx.bestsellerGroup.count({ where: { id: { in: unique } } });
      if (found !== unique.length) {
        throw new BadRequestException('Указана несуществующая подборка бестселлеров');
      }
    }
    await tx.bestsellerGroupProduct.deleteMany({ where: { productId } });
    if (unique.length > 0) {
      const tails = await tx.bestsellerGroupProduct.groupBy({
        by: ['groupId'],
        where: { groupId: { in: unique } },
        _max: { sortOrder: true },
      });
      const tailByGroup = new Map(tails.map((row) => [row.groupId, row._max.sortOrder ?? -10]));
      await tx.bestsellerGroupProduct.createMany({
        data: unique.map((groupId) => ({
          groupId,
          productId,
          sortOrder: (tailByGroup.get(groupId) ?? -10) + 10,
        })),
      });
    }
  }

  private async bumpGroupVersion(
    tx: Prisma.TransactionClient,
    id: string,
    expectedVersion: number,
  ): Promise<void> {
    const result = await tx.bestsellerGroup.updateMany({
      where: { id, version: expectedVersion },
      data: { version: { increment: 1 } },
    });
    if (result.count > 0) return;
    const exists = await tx.bestsellerGroup.findUnique({ where: { id }, select: { id: true } });
    if (exists) {
      throw new ConflictException(OCC_CONFLICT_MESSAGE);
    }
    throw new NotFoundException('Bestseller group not found');
  }

  /** One query for every group's products — keeps group listings free of N+1. */
  private async loadProducts(
    groups: BestsellerGroupWithProducts[],
    options: { publicOnly: boolean },
  ): Promise<Map<string, ProductListItemDto>> {
    const ids = [...new Set(groups.flatMap((group) => group.products.map((p) => p.productId)))];
    if (ids.length === 0) {
      return new Map();
    }
    const now = new Date();
    const rows = options.publicOnly
      ? await this.products.findMany({
          AND: [effectivelyPublishedWhere(now), { id: { in: ids } }],
        })
      : await this.products.findManyByIds(ids);
    return new Map(
      rows.map((row) => [row.id, toProductListItemDto(row, this.urlFor, now)] as const),
    );
  }

  private async findOrThrow(id: string): Promise<BestsellerGroupWithProducts> {
    const group = await this.prisma.client.bestsellerGroup.findUnique({
      where: { id },
      include: GROUP_INCLUDE,
    });
    if (!group) {
      throw new NotFoundException('Bestseller group not found');
    }
    return group;
  }

  private recordAudit(
    tx: Prisma.TransactionClient,
    actor: ActorContext,
    entityId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.record(
      {
        actorAdminUserId: actor.actorId,
        action: 'BESTSELLER_UPDATED',
        entityType: 'BestsellerGroup',
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

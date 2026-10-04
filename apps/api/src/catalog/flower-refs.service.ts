import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  normalizeSlug,
  type FlowerItemAdminDto,
  type FlowerItemDto,
  type FlowerOriginAdminDto,
  type FlowerOriginDto,
  type FlowerTypeAdminDto,
  type FlowerTypeDto,
  type FlowerVarietyAdminDto,
  type FlowerVarietyDto,
  type TaxonomyVisibility,
} from '@bouquet-one/contracts';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { StorefrontRevalidateService } from '../storefront/storefront-revalidate.service';
import {
  buildFlowerItemFields,
  FLOWER_ITEM_INCLUDE,
  toFlowerItemAdminDto,
  toFlowerItemDto,
  type FlowerItemRow,
} from './flower-item.util';

type ActorContext = {
  actorId: string;
  requestId?: string | null;
  ipHash?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class FlowerRefsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidate: StorefrontRevalidateService,
  ) {}

  async listTypes(visibleOnly = false): Promise<FlowerTypeDto[]> {
    const rows = await this.prisma.client.flowerType.findMany({
      where: visibleOnly ? { visibility: 'VISIBLE' } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      sortOrder: row.sortOrder,
      visibility: row.visibility,
    }));
  }

  async listTypesAdmin(): Promise<FlowerTypeAdminDto[]> {
    const rows = await this.prisma.client.flowerType.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true, varieties: true, items: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      sortOrder: row.sortOrder,
      visibility: row.visibility,
      version: row.version,
      productsCount: row._count.products,
      varietiesCount: row._count.varieties,
      itemsCount: row._count.items,
    }));
  }

  async listVarieties(flowerTypeId?: string, visibleOnly = false): Promise<FlowerVarietyDto[]> {
    const rows = await this.prisma.client.flowerVariety.findMany({
      where: {
        ...(flowerTypeId ? { flowerTypeId } : {}),
        ...(visibleOnly ? { visibility: 'VISIBLE' } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      flowerTypeId: row.flowerTypeId,
      slug: row.slug,
      name: row.name,
      sortOrder: row.sortOrder,
      visibility: row.visibility,
    }));
  }

  async listVarietiesAdmin(flowerTypeId?: string): Promise<FlowerVarietyAdminDto[]> {
    const rows = await this.prisma.client.flowerVariety.findMany({
      where: flowerTypeId ? { flowerTypeId } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true, items: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      flowerTypeId: row.flowerTypeId,
      slug: row.slug,
      name: row.name,
      sortOrder: row.sortOrder,
      visibility: row.visibility,
      version: row.version,
      productsCount: row._count.products,
      itemsCount: row._count.items,
    }));
  }

  async listOrigins(visibleOnly = false): Promise<FlowerOriginDto[]> {
    const rows = await this.prisma.client.flowerOrigin.findMany({
      where: visibleOnly ? { visibility: 'VISIBLE' } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      sortOrder: row.sortOrder,
      visibility: row.visibility,
    }));
  }

  async listOriginsAdmin(): Promise<FlowerOriginAdminDto[]> {
    const rows = await this.prisma.client.flowerOrigin.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true, items: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      sortOrder: row.sortOrder,
      visibility: row.visibility,
      version: row.version,
      productsCount: row._count.products,
      itemsCount: row._count.items,
    }));
  }

  async createType(
    input: { name: string; slug?: string; sortOrder?: number },
    actor?: ActorContext,
  ): Promise<FlowerTypeAdminDto> {
    const slug = normalizeSlug(input.slug?.trim() || input.name);
    if (!slug) throw new BadRequestException('Slug could not be derived');
    try {
      const row = await this.prisma.client.$transaction(async (tx) => {
        const created = await tx.flowerType.create({
          data: { name: input.name.trim(), slug, sortOrder: input.sortOrder ?? 0 },
          include: { _count: { select: { products: true, varieties: true } } },
        });
        if (actor) {
          await this.audit.record(
            {
              actorAdminUserId: actor.actorId,
              action: 'TAXONOMY_CREATED',
              entityType: 'FlowerType',
              entityId: created.id,
              metadata: { slug: created.slug, name: created.name },
              requestId: actor.requestId,
              ipHash: actor.ipHash,
              userAgent: actor.userAgent,
            },
            tx,
          );
        }
        return created;
      });
      await this.pingStorefront();
      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        sortOrder: row.sortOrder,
        visibility: row.visibility,
        version: row.version,
        productsCount: row._count.products,
        varietiesCount: row._count.varieties,
        itemsCount: 0,
      };
    } catch {
      throw new ConflictException('Flower type slug already in use');
    }
  }

  async createVariety(
    input: { flowerTypeId: string; name: string; slug?: string; sortOrder?: number },
    actor?: ActorContext,
  ): Promise<FlowerVarietyAdminDto> {
    const type = await this.prisma.client.flowerType.findUnique({
      where: { id: input.flowerTypeId },
    });
    if (!type) throw new NotFoundException('Flower type not found');
    const slug = normalizeSlug(input.slug?.trim() || input.name);
    if (!slug) throw new BadRequestException('Slug could not be derived');
    try {
      const row = await this.prisma.client.$transaction(async (tx) => {
        const created = await tx.flowerVariety.create({
          data: {
            flowerTypeId: input.flowerTypeId,
            name: input.name.trim(),
            slug,
            sortOrder: input.sortOrder ?? 0,
          },
          include: { _count: { select: { products: true } } },
        });
        if (actor) {
          await this.audit.record(
            {
              actorAdminUserId: actor.actorId,
              action: 'TAXONOMY_CREATED',
              entityType: 'FlowerVariety',
              entityId: created.id,
              metadata: { slug: created.slug, name: created.name, flowerTypeId: created.flowerTypeId },
              requestId: actor.requestId,
              ipHash: actor.ipHash,
              userAgent: actor.userAgent,
            },
            tx,
          );
        }
        return created;
      });
      await this.pingStorefront();
      return {
        id: row.id,
        flowerTypeId: row.flowerTypeId,
        slug: row.slug,
        name: row.name,
        sortOrder: row.sortOrder,
        visibility: row.visibility,
        version: row.version,
        productsCount: row._count.products,
        itemsCount: 0,
      };
    } catch {
      throw new ConflictException('Flower variety slug already in use');
    }
  }

  async createOrigin(
    input: { name: string; slug?: string; sortOrder?: number },
    actor?: ActorContext,
  ): Promise<FlowerOriginAdminDto> {
    const slug = normalizeSlug(input.slug?.trim() || input.name);
    if (!slug) throw new BadRequestException('Slug could not be derived');
    try {
      const row = await this.prisma.client.$transaction(async (tx) => {
        const created = await tx.flowerOrigin.create({
          data: { name: input.name.trim(), slug, sortOrder: input.sortOrder ?? 0 },
          include: { _count: { select: { products: true } } },
        });
        if (actor) {
          await this.audit.record(
            {
              actorAdminUserId: actor.actorId,
              action: 'TAXONOMY_CREATED',
              entityType: 'FlowerOrigin',
              entityId: created.id,
              metadata: { slug: created.slug, name: created.name },
              requestId: actor.requestId,
              ipHash: actor.ipHash,
              userAgent: actor.userAgent,
            },
            tx,
          );
        }
        return created;
      });
      await this.pingStorefront();
      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        sortOrder: row.sortOrder,
        visibility: row.visibility,
        version: row.version,
        productsCount: row._count.products,
        itemsCount: 0,
      };
    } catch {
      throw new ConflictException('Flower origin slug already in use');
    }
  }

  async updateType(
    id: string,
    input: {
      expectedVersion: number;
      name?: string;
      slug?: string;
      sortOrder?: number;
      visibility?: TaxonomyVisibility;
    },
    actor?: ActorContext,
  ): Promise<FlowerTypeAdminDto> {
    return (await this.patchRef('flowerType', id, input, actor)) as FlowerTypeAdminDto;
  }

  async updateVariety(
    id: string,
    input: {
      expectedVersion: number;
      name?: string;
      slug?: string;
      sortOrder?: number;
      visibility?: TaxonomyVisibility;
      flowerTypeId?: string;
    },
    actor?: ActorContext,
  ): Promise<FlowerVarietyAdminDto> {
    if (input.flowerTypeId) {
      const type = await this.prisma.client.flowerType.findUnique({
        where: { id: input.flowerTypeId },
      });
      if (!type) throw new BadRequestException('Flower type not found');
    }
    return (await this.patchRef('flowerVariety', id, input, actor)) as FlowerVarietyAdminDto;
  }

  async updateOrigin(
    id: string,
    input: {
      expectedVersion: number;
      name?: string;
      slug?: string;
      sortOrder?: number;
      visibility?: TaxonomyVisibility;
    },
    actor?: ActorContext,
  ): Promise<FlowerOriginAdminDto> {
    return (await this.patchRef('flowerOrigin', id, input, actor)) as FlowerOriginAdminDto;
  }

  async deleteTypeEmpty(id: string, expectedVersion: number, actor?: ActorContext): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      const row = await tx.flowerType.findUnique({
        where: { id },
        include: { _count: { select: { products: true, varieties: true } } },
      });
      if (!row) throw new NotFoundException('Flower type not found');
      if (row.version !== expectedVersion) {
        throw new ConflictException('Flower type was modified elsewhere');
      }
      if (row._count.varieties > 0) {
        throw new BadRequestException({
          message: 'Flower type has varieties',
          error: 'CatalogDeleteBlocked',
          code: 'HAS_VARIETIES',
          varietiesCount: row._count.varieties,
        });
      }
      const itemsCount = await tx.flowerItem.count({ where: { flowerTypeId: id } });
      if (itemsCount > 0) {
        throw new BadRequestException({
          message: 'Flower type has flower items',
          error: 'CatalogDeleteBlocked',
          code: 'HAS_ITEMS',
          itemsCount,
        });
      }
      if (row._count.products > 0) {
        throw new BadRequestException({
          message: 'Flower type has products',
          error: 'CatalogDeleteBlocked',
          code: 'HAS_PRODUCTS',
          productsCount: row._count.products,
        });
      }
      await tx.flowerType.delete({ where: { id } });
      if (actor) {
        await this.audit.record(
          {
            actorAdminUserId: actor.actorId,
            action: 'TAXONOMY_DELETED',
            entityType: 'FlowerType',
            entityId: id,
            metadata: { slug: row.slug, name: row.name },
            requestId: actor.requestId,
            ipHash: actor.ipHash,
            userAgent: actor.userAgent,
          },
          tx,
        );
      }
    });
    await this.pingStorefront();
  }

  async reassignProductsAndDeleteType(
    id: string,
    input: { expectedVersion: number; targetFlowerTypeId: string },
    actor?: ActorContext,
  ): Promise<{ reassignedCount: number }> {
    if (input.targetFlowerTypeId === id) {
      throw new BadRequestException('Cannot reassign to the same flower type');
    }
    const result = await this.prisma.client.$transaction(async (tx) => {
      const row = await tx.flowerType.findUnique({
        where: { id },
        include: { _count: { select: { products: true, varieties: true } } },
      });
      if (!row) throw new NotFoundException('Flower type not found');
      if (row.version !== input.expectedVersion) {
        throw new ConflictException('Flower type was modified elsewhere');
      }
      if (row._count.varieties > 0) {
        throw new BadRequestException({
          message: 'Flower type has varieties — reassign or delete them first',
          error: 'CatalogDeleteBlocked',
          code: 'HAS_VARIETIES',
          varietiesCount: row._count.varieties,
        });
      }
      const itemsCount = await tx.flowerItem.count({ where: { flowerTypeId: id } });
      if (itemsCount > 0) {
        throw new BadRequestException({
          message: 'Flower type has flower items — archive or reassign them first',
          error: 'CatalogDeleteBlocked',
          code: 'HAS_ITEMS',
          itemsCount,
        });
      }
      const target = await tx.flowerType.findUnique({ where: { id: input.targetFlowerTypeId } });
      if (!target) throw new BadRequestException('Target flower type not found');

      // Clear variety when type changes — variety belongs to the old type.
      const updated = await tx.product.updateMany({
        where: { flowerTypeId: id },
        data: { flowerTypeId: input.targetFlowerTypeId, flowerVarietyId: null },
      });
      await tx.flowerType.delete({ where: { id } });
      if (actor) {
        await this.audit.record(
          {
            actorAdminUserId: actor.actorId,
            action: 'TAXONOMY_DELETED',
            entityType: 'FlowerType',
            entityId: id,
            metadata: {
              slug: row.slug,
              name: row.name,
              reassignedCount: updated.count,
              targetFlowerTypeId: input.targetFlowerTypeId,
              clearedVariety: true,
            },
            requestId: actor.requestId,
            ipHash: actor.ipHash,
            userAgent: actor.userAgent,
          },
          tx,
        );
      }
      return { reassignedCount: updated.count };
    });
    await this.pingStorefront();
    return result;
  }

  async deleteVarietyEmpty(id: string, expectedVersion: number, actor?: ActorContext): Promise<void> {
    const itemsCount = await this.prisma.client.flowerItem.count({
      where: { flowerVarietyId: id },
    });
    if (itemsCount > 0) {
      throw new BadRequestException({
        message: 'Flower variety has flower items',
        error: 'CatalogDeleteBlocked',
        code: 'HAS_ITEMS',
        itemsCount,
      });
    }
    await this.deleteSimple('flowerVariety', id, expectedVersion, actor);
  }

  async reassignProductsAndDeleteVariety(
    id: string,
    input: { expectedVersion: number; targetVarietyId: string },
    actor?: ActorContext,
  ): Promise<{ reassignedCount: number }> {
    if (input.targetVarietyId === id) {
      throw new BadRequestException('Cannot reassign to the same variety');
    }
    const result = await this.prisma.client.$transaction(async (tx) => {
      const row = await tx.flowerVariety.findUnique({
        where: { id },
        include: { _count: { select: { products: true } } },
      });
      if (!row) throw new NotFoundException('Flower variety not found');
      if (row.version !== input.expectedVersion) {
        throw new ConflictException('Flower variety was modified elsewhere');
      }
      const itemsCount = await tx.flowerItem.count({ where: { flowerVarietyId: id } });
      if (itemsCount > 0) {
        throw new BadRequestException({
          message: 'Flower variety has flower items — archive or reassign them first',
          error: 'CatalogDeleteBlocked',
          code: 'HAS_ITEMS',
          itemsCount,
        });
      }
      const target = await tx.flowerVariety.findUnique({ where: { id: input.targetVarietyId } });
      if (!target) throw new BadRequestException('Target variety not found');

      const updated = await tx.product.updateMany({
        where: { flowerVarietyId: id },
        data: {
          flowerVarietyId: input.targetVarietyId,
          flowerTypeId: target.flowerTypeId,
        },
      });
      await tx.flowerVariety.delete({ where: { id } });
      if (actor) {
        await this.audit.record(
          {
            actorAdminUserId: actor.actorId,
            action: 'TAXONOMY_DELETED',
            entityType: 'FlowerVariety',
            entityId: id,
            metadata: {
              slug: row.slug,
              name: row.name,
              reassignedCount: updated.count,
              targetVarietyId: input.targetVarietyId,
            },
            requestId: actor.requestId,
            ipHash: actor.ipHash,
            userAgent: actor.userAgent,
          },
          tx,
        );
      }
      return { reassignedCount: updated.count };
    });
    await this.pingStorefront();
    return result;
  }

  async deleteOriginEmpty(id: string, expectedVersion: number, actor?: ActorContext): Promise<void> {
    const itemsCount = await this.prisma.client.flowerItem.count({
      where: { flowerOriginId: id },
    });
    if (itemsCount > 0) {
      throw new BadRequestException({
        message: 'Flower origin has flower items',
        error: 'CatalogDeleteBlocked',
        code: 'HAS_ITEMS',
        itemsCount,
      });
    }
    await this.deleteSimple('flowerOrigin', id, expectedVersion, actor);
  }

  async reassignProductsAndDeleteOrigin(
    id: string,
    input: { expectedVersion: number; targetOriginId: string },
    actor?: ActorContext,
  ): Promise<{ reassignedCount: number }> {
    if (input.targetOriginId === id) {
      throw new BadRequestException('Cannot reassign to the same origin');
    }
    const result = await this.prisma.client.$transaction(async (tx) => {
      const row = await tx.flowerOrigin.findUnique({
        where: { id },
        include: { _count: { select: { products: true } } },
      });
      if (!row) throw new NotFoundException('Flower origin not found');
      if (row.version !== input.expectedVersion) {
        throw new ConflictException('Flower origin was modified elsewhere');
      }
      const itemsCount = await tx.flowerItem.count({ where: { flowerOriginId: id } });
      if (itemsCount > 0) {
        throw new BadRequestException({
          message: 'Flower origin has flower items — archive or reassign them first',
          error: 'CatalogDeleteBlocked',
          code: 'HAS_ITEMS',
          itemsCount,
        });
      }
      const target = await tx.flowerOrigin.findUnique({ where: { id: input.targetOriginId } });
      if (!target) throw new BadRequestException('Target origin not found');

      const updated = await tx.product.updateMany({
        where: { flowerOriginId: id },
        data: { flowerOriginId: input.targetOriginId },
      });
      await tx.flowerOrigin.delete({ where: { id } });
      if (actor) {
        await this.audit.record(
          {
            actorAdminUserId: actor.actorId,
            action: 'TAXONOMY_DELETED',
            entityType: 'FlowerOrigin',
            entityId: id,
            metadata: {
              slug: row.slug,
              name: row.name,
              reassignedCount: updated.count,
              targetOriginId: input.targetOriginId,
            },
            requestId: actor.requestId,
            ipHash: actor.ipHash,
            userAgent: actor.userAgent,
          },
          tx,
        );
      }
      return { reassignedCount: updated.count };
    });
    await this.pingStorefront();
    return result;
  }

  async assertVarietyMatchesType(
    flowerTypeId: string | null | undefined,
    flowerVarietyId: string | null | undefined,
  ): Promise<void> {
    if (!flowerVarietyId) return;
    const variety = await this.prisma.client.flowerVariety.findUnique({
      where: { id: flowerVarietyId },
    });
    if (!variety) throw new BadRequestException('Flower variety not found');
    if (!flowerTypeId || variety.flowerTypeId !== flowerTypeId) {
      throw new BadRequestException('Flower variety does not belong to the selected flower type');
    }
  }

  async listItemsAdmin(options?: {
    flowerTypeId?: string;
    flowerVarietyId?: string;
    includeHidden?: boolean;
  }): Promise<FlowerItemAdminDto[]> {
    const rows = await this.prisma.client.flowerItem.findMany({
      where: {
        ...(options?.flowerTypeId ? { flowerTypeId: options.flowerTypeId } : {}),
        ...(options?.flowerVarietyId ? { flowerVarietyId: options.flowerVarietyId } : {}),
        ...(options?.includeHidden ? {} : { visibility: 'VISIBLE' }),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        ...FLOWER_ITEM_INCLUDE,
        _count: { select: { components: true } },
      },
    });
    return rows.map((row) => toFlowerItemAdminDto(row as FlowerItemRow));
  }

  async listItemsPublic(): Promise<FlowerItemDto[]> {
    const rows = await this.prisma.client.flowerItem.findMany({
      where: { visibility: 'VISIBLE' },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: FLOWER_ITEM_INCLUDE,
    });
    return rows.map((row) => toFlowerItemDto(row as FlowerItemRow));
  }

  async createItem(
    input: {
      flowerTypeId: string;
      flowerVarietyId?: string | null;
      flowerOriginId?: string | null;
      heightCm?: number | null;
      name?: string;
      slug?: string;
      sortOrder?: number;
    },
    actor?: ActorContext,
  ): Promise<FlowerItemAdminDto> {
    await this.assertVarietyMatchesType(input.flowerTypeId, input.flowerVarietyId);
    const type = await this.prisma.client.flowerType.findUnique({
      where: { id: input.flowerTypeId },
    });
    if (!type) throw new BadRequestException('Flower type not found');
    let varietyName: string | null = null;
    if (input.flowerVarietyId) {
      const variety = await this.prisma.client.flowerVariety.findUnique({
        where: { id: input.flowerVarietyId },
      });
      if (!variety) throw new BadRequestException('Flower variety not found');
      varietyName = variety.name;
    }
    let originName: string | null = null;
    if (input.flowerOriginId) {
      const origin = await this.prisma.client.flowerOrigin.findUnique({
        where: { id: input.flowerOriginId },
      });
      if (!origin) throw new BadRequestException('Flower origin not found');
      originName = origin.name;
    }
    if (input.heightCm != null && (input.heightCm < 1 || input.heightCm > 300)) {
      throw new BadRequestException('heightCm must be between 1 and 300');
    }

    const fields = buildFlowerItemFields({
      flowerTypeId: input.flowerTypeId,
      flowerVarietyId: input.flowerVarietyId,
      flowerOriginId: input.flowerOriginId,
      heightCm: input.heightCm,
      typeName: type.name,
      varietyName,
      originName,
      name: input.name,
      slug: input.slug,
    });
    if (!fields.slug) throw new BadRequestException('Slug could not be derived');

    try {
      const row = await this.prisma.client.$transaction(async (tx) => {
        const created = await tx.flowerItem.create({
          data: {
            flowerTypeId: input.flowerTypeId,
            flowerVarietyId: input.flowerVarietyId ?? null,
            flowerOriginId: input.flowerOriginId ?? null,
            heightCm: input.heightCm ?? null,
            identityKey: fields.identityKey,
            slug: fields.slug,
            name: fields.name,
            sortOrder: input.sortOrder ?? 0,
          },
          include: {
            ...FLOWER_ITEM_INCLUDE,
            _count: { select: { components: true } },
          },
        });
        if (actor) {
          await this.audit.record(
            {
              actorAdminUserId: actor.actorId,
              action: 'TAXONOMY_CREATED',
              entityType: 'FlowerItem',
              entityId: created.id,
              metadata: {
                slug: created.slug,
                name: created.name,
                identityKey: created.identityKey,
              },
              requestId: actor.requestId,
              ipHash: actor.ipHash,
              userAgent: actor.userAgent,
            },
            tx,
          );
        }
        return created;
      });
      await this.pingStorefront();
      return toFlowerItemAdminDto(row as FlowerItemRow);
    } catch {
      throw new ConflictException('Flower item already exists or slug is taken');
    }
  }

  async updateItem(
    id: string,
    input: {
      expectedVersion: number;
      name?: string;
      slug?: string;
      sortOrder?: number;
      visibility?: TaxonomyVisibility;
      flowerVarietyId?: string | null;
      flowerOriginId?: string | null;
      heightCm?: number | null;
    },
    actor?: ActorContext,
  ): Promise<FlowerItemAdminDto> {
    const existing = await this.prisma.client.flowerItem.findUnique({
      where: { id },
      include: FLOWER_ITEM_INCLUDE,
    });
    if (!existing) throw new NotFoundException('Flower item not found');
    if (existing.version !== input.expectedVersion) {
      throw new ConflictException('Flower item was modified elsewhere');
    }

    const nextVarietyId =
      input.flowerVarietyId === undefined ? existing.flowerVarietyId : input.flowerVarietyId;
    const nextOriginId =
      input.flowerOriginId === undefined ? existing.flowerOriginId : input.flowerOriginId;
    const nextHeight =
      input.heightCm === undefined ? existing.heightCm : input.heightCm;

    await this.assertVarietyMatchesType(existing.flowerTypeId, nextVarietyId);
    if (nextVarietyId) {
      const variety = await this.prisma.client.flowerVariety.findUnique({
        where: { id: nextVarietyId },
      });
      if (!variety) throw new BadRequestException('Flower variety not found');
    }
    if (nextOriginId) {
      const origin = await this.prisma.client.flowerOrigin.findUnique({
        where: { id: nextOriginId },
      });
      if (!origin) throw new BadRequestException('Flower origin not found');
    }
    if (nextHeight != null && (nextHeight < 1 || nextHeight > 300)) {
      throw new BadRequestException('heightCm must be between 1 and 300');
    }

    const varietyName =
      nextVarietyId == null
        ? null
        : (
            await this.prisma.client.flowerVariety.findUnique({ where: { id: nextVarietyId } })
          )?.name ?? null;
    const originName =
      nextOriginId == null
        ? null
        : (await this.prisma.client.flowerOrigin.findUnique({ where: { id: nextOriginId } }))
            ?.name ?? null;

    const fields = buildFlowerItemFields({
      flowerTypeId: existing.flowerTypeId,
      flowerVarietyId: nextVarietyId,
      flowerOriginId: nextOriginId,
      heightCm: nextHeight,
      typeName: existing.flowerType.name,
      varietyName,
      originName,
      name: input.name ?? existing.name,
      slug: input.slug ?? existing.slug,
    });
    if (!fields.slug) throw new BadRequestException('Slug could not be derived');

    try {
      const row = await this.prisma.client.$transaction(async (tx) => {
        const bumped = await tx.flowerItem.updateMany({
          where: { id, version: input.expectedVersion },
          data: {
            flowerVarietyId: nextVarietyId,
            flowerOriginId: nextOriginId,
            heightCm: nextHeight,
            identityKey: fields.identityKey,
            slug: fields.slug,
            name: input.name !== undefined ? input.name.trim() : fields.name,
            ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
            ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
            version: { increment: 1 },
          },
        });
        if (bumped.count === 0) {
          throw new ConflictException('Flower item was modified elsewhere');
        }
        const updated = await tx.flowerItem.findUniqueOrThrow({
          where: { id },
          include: {
            ...FLOWER_ITEM_INCLUDE,
            _count: { select: { components: true } },
          },
        });
        if (actor) {
          await this.audit.record(
            {
              actorAdminUserId: actor.actorId,
              action: 'TAXONOMY_UPDATED',
              entityType: 'FlowerItem',
              entityId: id,
              metadata: {
                fields: Object.keys(input).filter((key) => key !== 'expectedVersion'),
                visibility: input.visibility,
              },
              requestId: actor.requestId,
              ipHash: actor.ipHash,
              userAgent: actor.userAgent,
            },
            tx,
          );
        }
        return updated;
      });
      await this.pingStorefront();
      return toFlowerItemAdminDto(row as FlowerItemRow);
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof ConflictException ||
        err instanceof BadRequestException
      ) {
        throw err;
      }
      throw new ConflictException('Flower item already exists or slug is taken');
    }
  }

  /** Hard-delete only when unused. Used items must be archived (HIDDEN). */
  async deleteItemEmpty(
    id: string,
    expectedVersion: number,
    actor?: ActorContext,
  ): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      const row = await tx.flowerItem.findUnique({
        where: { id },
        include: { _count: { select: { components: true } } },
      });
      if (!row) throw new NotFoundException('Flower item not found');
      if (row.version !== expectedVersion) {
        throw new ConflictException('Flower item was modified elsewhere');
      }
      if (row._count.components > 0) {
        throw new BadRequestException({
          message: 'Flower item is used in product composition',
          error: 'CatalogDeleteBlocked',
          code: 'HAS_COMPONENTS',
          componentsCount: row._count.components,
        });
      }
      await tx.flowerItem.delete({ where: { id } });
      if (actor) {
        await this.audit.record(
          {
            actorAdminUserId: actor.actorId,
            action: 'TAXONOMY_DELETED',
            entityType: 'FlowerItem',
            entityId: id,
            metadata: { slug: row.slug, name: row.name, identityKey: row.identityKey },
            requestId: actor.requestId,
            ipHash: actor.ipHash,
            userAgent: actor.userAgent,
          },
          tx,
        );
      }
    });
    await this.pingStorefront();
  }

  async assertFlowerItemsExist(ids: string[]): Promise<void> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return;
    const count = await this.prisma.client.flowerItem.count({
      where: { id: { in: unique } },
    });
    if (count !== unique.length) {
      throw new BadRequestException('One or more flower items were not found');
    }
  }

  private async patchRef(
    model: 'flowerType' | 'flowerVariety' | 'flowerOrigin',
    id: string,
    input: {
      expectedVersion: number;
      name?: string;
      slug?: string;
      sortOrder?: number;
      visibility?: TaxonomyVisibility;
      flowerTypeId?: string;
    },
    actor?: ActorContext,
  ): Promise<FlowerTypeAdminDto | FlowerVarietyAdminDto | FlowerOriginAdminDto> {
    const slug = input.slug !== undefined ? normalizeSlug(input.slug) : undefined;
    if (input.slug !== undefined && !slug) {
      throw new BadRequestException('Slug could not be derived');
    }
    const entityType =
      model === 'flowerType' ? 'FlowerType' : model === 'flowerVariety' ? 'FlowerVariety' : 'FlowerOrigin';

    try {
      const row = await this.prisma.client.$transaction(async (tx) => {
        const client = tx[model] as {
          updateMany: (args: unknown) => Promise<{ count: number }>;
          findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
          findUniqueOrThrow: (args: unknown) => Promise<Record<string, unknown>>;
        };
        const result = await client.updateMany({
          where: { id, version: input.expectedVersion },
          data: {
            ...(input.name !== undefined ? { name: input.name.trim() } : {}),
            ...(slug !== undefined ? { slug } : {}),
            ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
            ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
            ...(input.flowerTypeId !== undefined ? { flowerTypeId: input.flowerTypeId } : {}),
            version: { increment: 1 },
          },
        });
        if (result.count === 0) {
          const exists = await client.findUnique({ where: { id } });
          if (!exists) throw new NotFoundException(`${entityType} not found`);
          throw new ConflictException(`${entityType} was modified elsewhere`);
        }
        const include =
          model === 'flowerType'
            ? { _count: { select: { products: true, varieties: true } } }
            : { _count: { select: { products: true } } };
        const updated = (await client.findUniqueOrThrow({
          where: { id },
          include,
        })) as {
          id: string;
          slug: string;
          name: string;
          sortOrder: number;
          visibility: TaxonomyVisibility;
          version: number;
          flowerTypeId?: string;
          _count: { products: number; varieties?: number };
        };
        if (actor) {
          await this.audit.record(
            {
              actorAdminUserId: actor.actorId,
              action: 'TAXONOMY_UPDATED',
              entityType,
              entityId: id,
              metadata: {
                fields: Object.keys(input).filter((key) => key !== 'expectedVersion'),
              },
              requestId: actor.requestId,
              ipHash: actor.ipHash,
              userAgent: actor.userAgent,
            },
            tx,
          );
        }
        return updated;
      });
      await this.pingStorefront();
      if (model === 'flowerType') {
        return {
          id: row.id,
          slug: row.slug,
          name: row.name,
          sortOrder: row.sortOrder,
          visibility: row.visibility,
          version: row.version,
          productsCount: row._count.products,
          varietiesCount: row._count.varieties ?? 0,
        };
      }
      if (model === 'flowerVariety') {
        return {
          id: row.id,
          flowerTypeId: row.flowerTypeId!,
          slug: row.slug,
          name: row.name,
          sortOrder: row.sortOrder,
          visibility: row.visibility,
          version: row.version,
          productsCount: row._count.products,
        };
      }
      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        sortOrder: row.sortOrder,
        visibility: row.visibility,
        version: row.version,
        productsCount: row._count.products,
      };
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof ConflictException ||
        err instanceof BadRequestException
      ) {
        throw err;
      }
      throw new ConflictException('Slug already in use');
    }
  }

  private async deleteSimple(
    model: 'flowerVariety' | 'flowerOrigin',
    id: string,
    expectedVersion: number,
    actor?: ActorContext,
  ): Promise<void> {
    const entityType = model === 'flowerVariety' ? 'FlowerVariety' : 'FlowerOrigin';
    await this.prisma.client.$transaction(async (tx) => {
      const client = tx[model] as {
        findUnique: (args: unknown) => Promise<{
          id: string;
          slug: string;
          name: string;
          version: number;
          _count: { products: number };
        } | null>;
        delete: (args: unknown) => Promise<unknown>;
      };
      const row = await client.findUnique({
        where: { id },
        include: { _count: { select: { products: true } } },
      });
      if (!row) throw new NotFoundException(`${entityType} not found`);
      if (row.version !== expectedVersion) {
        throw new ConflictException(`${entityType} was modified elsewhere`);
      }
      if (row._count.products > 0) {
        throw new BadRequestException({
          message: `${entityType} has products`,
          error: 'CatalogDeleteBlocked',
          code: 'HAS_PRODUCTS',
          productsCount: row._count.products,
        });
      }
      await client.delete({ where: { id } });
      if (actor) {
        await this.audit.record(
          {
            actorAdminUserId: actor.actorId,
            action: 'TAXONOMY_DELETED',
            entityType,
            entityId: id,
            metadata: { slug: row.slug, name: row.name },
            requestId: actor.requestId,
            ipHash: actor.ipHash,
            userAgent: actor.userAgent,
          },
          tx,
        );
      }
    });
    await this.pingStorefront();
  }

  private async pingStorefront() {
    await this.revalidate.ping({ tags: ['catalog', 'flower-refs'], paths: ['/', '/bukety'] });
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  normalizeSlug,
  flowerItemIdentityKey,
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
      const existing = await this.prisma.client.flowerVariety.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Flower variety not found');
      if (existing.flowerTypeId !== input.flowerTypeId) {
        // Parent change is a dedicated move — never a silent PATCH.
        throw new BadRequestException(
          'Нельзя просто сменить вид у сорта. Используйте операцию «Переместить сорт».',
        );
      }
    }
    return (await this.patchRef('flowerVariety', id, input, actor)) as FlowerVarietyAdminDto;
  }

  /**
   * Atomically move a variety to another FlowerType and update all FlowerItems.
   * Blocks when identityKey collisions would occur under the target type.
   */
  async moveVarietyToType(
    id: string,
    input: { expectedVersion: number; targetFlowerTypeId: string },
    actor?: ActorContext,
  ): Promise<FlowerVarietyAdminDto> {
    if (input.targetFlowerTypeId === undefined) {
      throw new BadRequestException('Укажите целевой вид цветка');
    }
    const result = await this.prisma.client.$transaction(async (tx) => {
      const variety = await tx.flowerVariety.findUnique({ where: { id } });
      if (!variety) throw new NotFoundException('Сорт не найден');
      if (variety.version !== input.expectedVersion) {
        throw new ConflictException('Сорт был изменён в другом окне');
      }
      if (variety.flowerTypeId === input.targetFlowerTypeId) {
        throw new BadRequestException('Сорт уже принадлежит этому виду');
      }
      const target = await tx.flowerType.findUnique({ where: { id: input.targetFlowerTypeId } });
      if (!target) throw new BadRequestException('Целевой вид цветка не найден');

      const items = await tx.flowerItem.findMany({ where: { flowerVarietyId: id } });
      for (const item of items) {
        const nextKey = flowerItemIdentityKey({
          flowerTypeId: input.targetFlowerTypeId,
          flowerFormId: item.flowerFormId,
          flowerVarietyId: item.flowerVarietyId,
          flowerOriginId: item.flowerOriginId,
          stemLengthCm: item.stemLengthCm,
        });
        const clash = await tx.flowerItem.findFirst({
          where: { identityKey: nextKey, NOT: { id: item.id } },
        });
        if (clash) {
          throw new BadRequestException({
            message: `Конфликт при переносе: позиция «${item.name}» совпадёт с уже существующей «${clash.name}». Перенос отменён.`,
            error: 'VarietyMoveConflict',
            code: 'IDENTITY_CONFLICT',
            flowerItemId: item.id,
            conflictItemId: clash.id,
          });
        }
      }

      for (const item of items) {
        const nextKey = flowerItemIdentityKey({
          flowerTypeId: input.targetFlowerTypeId,
          flowerFormId: item.flowerFormId,
          flowerVarietyId: item.flowerVarietyId,
          flowerOriginId: item.flowerOriginId,
          stemLengthCm: item.stemLengthCm,
        });
        await tx.flowerItem.update({
          where: { id: item.id },
          data: {
            flowerTypeId: input.targetFlowerTypeId,
            identityKey: nextKey,
            version: { increment: 1 },
          },
        });
      }

      const bumped = await tx.flowerVariety.updateMany({
        where: { id, version: input.expectedVersion },
        data: {
          flowerTypeId: input.targetFlowerTypeId,
          version: { increment: 1 },
        },
      });
      if (bumped.count === 0) {
        throw new ConflictException('Сорт был изменён в другом окне');
      }

      // Keep legacy Product.flowerVariety rows consistent when they still point here.
      await tx.product.updateMany({
        where: { flowerVarietyId: id },
        data: { flowerTypeId: input.targetFlowerTypeId },
      });

      if (actor) {
        await this.audit.record(
          {
            actorAdminUserId: actor.actorId,
            action: 'TAXONOMY_UPDATED',
            entityType: 'FlowerVariety',
            entityId: id,
            metadata: {
              moveVariety: true,
              fromFlowerTypeId: variety.flowerTypeId,
              toFlowerTypeId: input.targetFlowerTypeId,
              itemsMoved: items.length,
            },
            requestId: actor.requestId,
            ipHash: actor.ipHash,
            userAgent: actor.userAgent,
          },
          tx,
        );
      }

      const updated = await tx.flowerVariety.findUniqueOrThrow({
        where: { id },
        include: { _count: { select: { products: true, items: true } } },
      });
      return updated;
    });

    await this.pingStorefront();
    return {
      id: result.id,
      flowerTypeId: result.flowerTypeId,
      slug: result.slug,
      name: result.name,
      sortOrder: result.sortOrder,
      visibility: result.visibility,
      version: result.version,
      productsCount: result._count.products,
      itemsCount: result._count.items,
    };
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

  async assertFormMatchesType(
    flowerTypeId: string | null | undefined,
    flowerFormId: string | null | undefined,
  ): Promise<void> {
    if (!flowerFormId) return;
    const form = await this.prisma.client.flowerForm.findUnique({
      where: { id: flowerFormId },
    });
    if (!form) throw new BadRequestException('Flower form not found');
    if (!flowerTypeId || form.flowerTypeId !== flowerTypeId) {
      throw new BadRequestException('Форма не принадлежит выбранному виду цветка');
    }
  }

  async listFormsAdmin(flowerTypeId?: string, includeHidden = false) {
    const rows = await this.prisma.client.flowerForm.findMany({
      where: {
        ...(flowerTypeId ? { flowerTypeId } : {}),
        ...(includeHidden ? {} : { visibility: 'VISIBLE' }),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { items: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      flowerTypeId: row.flowerTypeId,
      slug: row.slug,
      name: row.name,
      sortOrder: row.sortOrder,
      visibility: row.visibility,
      version: row.version,
      itemsCount: row._count.items,
    }));
  }

  async createForm(
    input: { flowerTypeId: string; name: string; slug?: string; sortOrder?: number },
    actor?: ActorContext,
  ) {
    const type = await this.prisma.client.flowerType.findUnique({
      where: { id: input.flowerTypeId },
    });
    if (!type) throw new BadRequestException('Flower type not found');
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Укажите название формы');
    const slug = normalizeSlug(input.slug?.trim() || name);
    if (!slug) throw new BadRequestException('Slug could not be derived');
    const duplicate = await this.prisma.client.flowerForm.findFirst({
      where: {
        flowerTypeId: input.flowerTypeId,
        OR: [{ slug }, { name: { equals: name, mode: 'insensitive' } }],
      },
    });
    if (duplicate) {
      throw new ConflictException(`Форма «${duplicate.name}» уже существует для этого вида`);
    }
    const created = await this.prisma.client.flowerForm.create({
      data: {
        flowerTypeId: input.flowerTypeId,
        name,
        slug,
        sortOrder: input.sortOrder ?? 0,
      },
      include: { _count: { select: { items: true } } },
    });
    if (actor) {
      await this.audit.record({
        actorAdminUserId: actor.actorId,
        action: 'TAXONOMY_CREATED',
        entityType: 'FlowerForm',
        entityId: created.id,
        metadata: { name: created.name, flowerTypeId: created.flowerTypeId },
        requestId: actor.requestId,
        ipHash: actor.ipHash,
        userAgent: actor.userAgent,
      });
    }
    await this.pingStorefront();
    return {
      id: created.id,
      flowerTypeId: created.flowerTypeId,
      slug: created.slug,
      name: created.name,
      sortOrder: created.sortOrder,
      visibility: created.visibility,
      version: created.version,
      itemsCount: created._count.items,
    };
  }

  async listItemsAdmin(options?: {
    flowerTypeId?: string;
    flowerFormId?: string;
    flowerVarietyId?: string;
    flowerOriginId?: string;
    includeHidden?: boolean;
    /** VISIBLE | HIDDEN | omit for all when includeHidden */
    visibility?: TaxonomyVisibility;
    q?: string;
    page?: number;
    pageSize?: number;
    /** @deprecated Prefer page/pageSize. Cap for autocomplete. */
    limit?: number;
  }): Promise<{ items: FlowerItemAdminDto[]; total: number; page: number; pageSize: number }> {
    const q = options?.q?.trim();
    const page = Math.max(1, options?.page ?? 1);
    const requestedSize = options?.limit ?? options?.pageSize ?? 50;
    const pageSize = Math.min(Math.max(1, requestedSize), 100);
    const visibilityWhere =
      options?.visibility
        ? { visibility: options.visibility }
        : options?.includeHidden
          ? {}
          : { visibility: 'VISIBLE' as const };

    const stemFromQuery =
      q && /^\d{1,3}$/.test(q) ? Number(q) : q && /^(\d{1,3})\s*см$/i.test(q)
        ? Number(q.replace(/[^\d]/g, ''))
        : null;

    const where = {
      ...(options?.flowerTypeId ? { flowerTypeId: options.flowerTypeId } : {}),
      ...(options?.flowerFormId ? { flowerFormId: options.flowerFormId } : {}),
      ...(options?.flowerVarietyId ? { flowerVarietyId: options.flowerVarietyId } : {}),
      ...(options?.flowerOriginId ? { flowerOriginId: options.flowerOriginId } : {}),
      ...visibilityWhere,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { flowerType: { name: { contains: q, mode: 'insensitive' as const } } },
              { flowerForm: { name: { contains: q, mode: 'insensitive' as const } } },
              { flowerVariety: { name: { contains: q, mode: 'insensitive' as const } } },
              { flowerOrigin: { name: { contains: q, mode: 'insensitive' as const } } },
              ...(stemFromQuery != null && Number.isFinite(stemFromQuery)
                ? [{ stemLengthCm: stemFromQuery }]
                : []),
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.client.flowerItem.count({ where }),
      this.prisma.client.flowerItem.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          ...FLOWER_ITEM_INCLUDE,
          _count: { select: { components: true } },
        },
      }),
    ]);

    return {
      items: rows.map((row) => toFlowerItemAdminDto(row as FlowerItemRow)),
      total,
      page,
      pageSize,
    };
  }

  async getItemAdmin(id: string): Promise<FlowerItemAdminDto> {
    const row = await this.prisma.client.flowerItem.findUnique({
      where: { id },
      include: {
        ...FLOWER_ITEM_INCLUDE,
        _count: { select: { components: true } },
        components: {
          take: 40,
          orderBy: { createdAt: 'desc' },
          select: {
            quantity: true,
            product: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Flower item not found');
    const dto = toFlowerItemAdminDto(row as FlowerItemRow);
    return {
      ...dto,
      usedIn: row.components.map((c) => ({
        productId: c.product.id,
        productName: c.product.name,
        productSlug: c.product.slug,
        quantity: c.quantity,
      })),
    };
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
      flowerFormId?: string | null;
      flowerVarietyId?: string | null;
      flowerOriginId?: string | null;
      stemLengthCm?: number | null;
      /** @deprecated Use stemLengthCm */
      heightCm?: number | null;
      name?: string;
      slug?: string;
      sortOrder?: number;
    },
    actor?: ActorContext,
  ): Promise<FlowerItemAdminDto> {
    await this.assertVarietyMatchesType(input.flowerTypeId, input.flowerVarietyId);
    await this.assertFormMatchesType(input.flowerTypeId, input.flowerFormId);
    const type = await this.prisma.client.flowerType.findUnique({
      where: { id: input.flowerTypeId },
    });
    if (!type) throw new BadRequestException('Flower type not found');
    let formName: string | null = null;
    if (input.flowerFormId) {
      const form = await this.prisma.client.flowerForm.findUnique({
        where: { id: input.flowerFormId },
      });
      if (!form) throw new BadRequestException('Flower form not found');
      formName = form.name;
    }
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
    const stem = input.stemLengthCm ?? input.heightCm ?? null;
    if (stem != null && (stem < 1 || stem > 300)) {
      throw new BadRequestException('stemLengthCm must be between 1 and 300');
    }

    const fields = buildFlowerItemFields({
      flowerTypeId: input.flowerTypeId,
      flowerFormId: input.flowerFormId,
      flowerVarietyId: input.flowerVarietyId,
      flowerOriginId: input.flowerOriginId,
      stemLengthCm: stem,
      typeName: type.name,
      formName,
      varietyName,
      originName,
      name: input.name,
      slug: input.slug,
    });
    if (!fields.slug) throw new BadRequestException('Slug could not be derived');

    const existingByKey = await this.prisma.client.flowerItem.findFirst({
      where: { identityKey: fields.identityKey },
      select: { id: true, name: true },
    });
    if (existingByKey) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        message: `Такой цветок уже существует: ${existingByKey.name}`,
        code: 'FLOWER_ITEM_DUPLICATE',
        existingId: existingByKey.id,
        existingName: existingByKey.name,
      });
    }

    try {
      const row = await this.prisma.client.$transaction(async (tx) => {
        const created = await tx.flowerItem.create({
          data: {
            flowerTypeId: input.flowerTypeId,
            flowerFormId: input.flowerFormId ?? null,
            flowerVarietyId: input.flowerVarietyId ?? null,
            flowerOriginId: input.flowerOriginId ?? null,
            stemLengthCm: stem,
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
    } catch (err) {
      if (err instanceof ConflictException || err instanceof BadRequestException) throw err;
      // Unique race (identity_key or slug): map to deterministic FLOWER_ITEM_DUPLICATE conflict.
      const raced = await this.prisma.client.flowerItem.findFirst({
        where: {
          OR: [{ identityKey: fields.identityKey }, { slug: fields.slug }],
        },
        select: { id: true, name: true, identityKey: true },
      });
      if (raced) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: `Такой цветок уже существует: ${raced.name}`,
          code: 'FLOWER_ITEM_DUPLICATE',
          existingId: raced.id,
          existingName: raced.name,
        });
      }
      const prismaCode =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: unknown }).code ?? '')
          : '';
      if (prismaCode === 'P2002') {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: `Такой цветок уже существует: ${fields.name}`,
          code: 'FLOWER_ITEM_DUPLICATE',
        });
      }
      throw err;
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
      flowerTypeId?: string;
      flowerVarietyId?: string | null;
      flowerOriginId?: string | null;
      flowerFormId?: string | null;
      stemLengthCm?: number | null;
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

    const nextTypeId = input.flowerTypeId ?? existing.flowerTypeId;
    const nextFormId =
      input.flowerFormId === undefined ? existing.flowerFormId : input.flowerFormId;
    const nextVarietyId =
      input.flowerVarietyId === undefined ? existing.flowerVarietyId : input.flowerVarietyId;
    const nextOriginId =
      input.flowerOriginId === undefined ? existing.flowerOriginId : input.flowerOriginId;
    const nextHeight =
      input.stemLengthCm !== undefined
        ? input.stemLengthCm
        : input.heightCm === undefined
          ? existing.stemLengthCm
          : input.heightCm;

    const type =
      nextTypeId === existing.flowerTypeId
        ? existing.flowerType
        : await this.prisma.client.flowerType.findUnique({ where: { id: nextTypeId } });
    if (!type) throw new BadRequestException('Flower type not found');

    await this.assertVarietyMatchesType(nextTypeId, nextVarietyId);
    await this.assertFormMatchesType(nextTypeId, nextFormId);
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
      throw new BadRequestException('stemLengthCm must be between 1 and 300');
    }

    const formName =
      nextFormId == null
        ? null
        : (await this.prisma.client.flowerForm.findUnique({ where: { id: nextFormId } }))?.name ??
          null;
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
      flowerTypeId: nextTypeId,
      flowerFormId: nextFormId,
      flowerVarietyId: nextVarietyId,
      flowerOriginId: nextOriginId,
      stemLengthCm: nextHeight,
      typeName: type.name,
      formName,
      varietyName,
      originName,
      name: input.name,
      slug: input.slug,
    });
    if (!fields.slug) throw new BadRequestException('Slug could not be derived');

    const conflicting = await this.prisma.client.flowerItem.findFirst({
      where: { identityKey: fields.identityKey, NOT: { id } },
      select: { id: true, name: true },
    });
    if (conflicting) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        message: `Такой цветок уже существует: ${conflicting.name}`,
        code: 'FLOWER_ITEM_DUPLICATE',
        existingId: conflicting.id,
        existingName: conflicting.name,
      });
    }

    try {
      const row = await this.prisma.client.$transaction(async (tx) => {
        const bumped = await tx.flowerItem.updateMany({
          where: { id, version: input.expectedVersion },
          data: {
            flowerTypeId: nextTypeId,
            flowerFormId: nextFormId,
            flowerVarietyId: nextVarietyId,
            flowerOriginId: nextOriginId,
            stemLengthCm: nextHeight,
            identityKey: fields.identityKey,
            slug: fields.slug,
            name: fields.name,
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
          message: `Нельзя удалить: цветок используется в ${row._count.components} товарах. Архивируйте его.`,
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
      throw new BadRequestException('Одна или несколько позиций справочника не найдены');
    }
  }

  /**
   * New composition rows may only reference VISIBLE FlowerItems.
   * Already-assigned HIDDEN items remain valid (archive does not break existing products).
   */
  async assertFlowerItemsAssignable(
    ids: string[],
    previouslyAssignedIds: ReadonlySet<string> = new Set(),
  ): Promise<void> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return;
    const rows = await this.prisma.client.flowerItem.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true, visibility: true },
    });
    if (rows.length !== unique.length) {
      throw new BadRequestException('Одна или несколько позиций справочника не найдены');
    }
    const blocked = rows.filter(
      (row) => row.visibility === 'HIDDEN' && !previouslyAssignedIds.has(row.id),
    );
    if (blocked.length > 0) {
      throw new BadRequestException(
        `Нельзя назначить архивную позицию справочника: ${blocked.map((row) => row.name).join(', ')}. Сначала восстановите её.`,
      );
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

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  isCatalogListingKind,
  normalizeSlug,
  type CatalogCategoryAdminDto,
  type CatalogCategoryTreeNodeDto,
  type CatalogListingKind,
  type TaxonomyVisibility,
} from '@bouquet-one/contracts';
import type { Prisma } from '@bouquet-one/database';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { StorefrontRevalidateService } from '../storefront/storefront-revalidate.service';

type CategoryRow = {
  id: string;
  parentId: string | null;
  slug: string;
  name: string;
  listingKind: string | null;
  sortOrder: number;
  visibility: TaxonomyVisibility;
  version: number;
  seoTitle: string | null;
  seoDescription: string | null;
  noIndex: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count?: { children: number; products: number };
};

type ActorContext = {
  actorId: string;
  requestId?: string | null;
  ipHash?: string | null;
  userAgent?: string | null;
};

function listingKindOf(value: string | null): CatalogListingKind | null {
  return value && isCatalogListingKind(value) ? value : null;
}

/** Pure tree walk — exported for unit tests. Cycle-safe via visited set. */
export function collectCategoryDescendantIds(
  rootId: string,
  rows: Array<{ id: string; parentId: string | null; visibility: TaxonomyVisibility }>,
  options?: { visibleOnly?: boolean },
): string[] {
  const children = new Map<string, string[]>();
  const visibility = new Map<string, TaxonomyVisibility>();
  for (const row of rows) {
    visibility.set(row.id, row.visibility);
    if (!row.parentId) continue;
    const list = children.get(row.parentId) ?? [];
    list.push(row.id);
    children.set(row.parentId, list);
  }
  const out: string[] = [];
  const visited = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    out.push(id);
    for (const childId of children.get(id) ?? []) {
      if (options?.visibleOnly && visibility.get(childId) !== 'VISIBLE') continue;
      stack.push(childId);
    }
  }
  return out;
}

/** Sum direct product counts for each node + all descendants. */
export function computeDescendantProductCounts(
  rows: Array<{ id: string; parentId: string | null; productsCount: number }>,
): Map<string, number> {
  const children = new Map<string, string[]>();
  const direct = new Map<string, number>();
  for (const row of rows) {
    direct.set(row.id, row.productsCount);
    if (!row.parentId) continue;
    const list = children.get(row.parentId) ?? [];
    list.push(row.id);
    children.set(row.parentId, list);
  }
  const memo = new Map<string, number>();
  const walk = (id: string, stack: Set<string>): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (stack.has(id)) return direct.get(id) ?? 0;
    stack.add(id);
    let total = direct.get(id) ?? 0;
    for (const childId of children.get(id) ?? []) {
      total += walk(childId, stack);
    }
    stack.delete(id);
    memo.set(id, total);
    return total;
  };
  for (const row of rows) walk(row.id, new Set());
  return memo;
}

function toAdminDto(
  row: CategoryRow,
  descendantProductsCount = row._count?.products ?? 0,
): CatalogCategoryAdminDto {
  return {
    id: row.id,
    parentId: row.parentId,
    slug: row.slug,
    name: row.name,
    listingKind: listingKindOf(row.listingKind),
    sortOrder: row.sortOrder,
    visibility: row.visibility,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    noIndex: row.noIndex,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    childrenCount: row._count?.children ?? 0,
    productsCount: row._count?.products ?? 0,
    descendantProductsCount,
  };
}

@Injectable()
export class CatalogCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidate: StorefrontRevalidateService,
  ) {}

  async listAdmin(): Promise<CatalogCategoryAdminDto[]> {
    const rows = await this.prisma.client.catalogCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { children: true, products: true } } },
    });
    const descendants = computeDescendantProductCounts(
      rows.map((row) => ({
        id: row.id,
        parentId: row.parentId,
        productsCount: row._count.products,
      })),
    );
    return rows.map((row) => toAdminDto(row, descendants.get(row.id) ?? row._count.products));
  }

  async tree(visibleOnly = true): Promise<CatalogCategoryTreeNodeDto[]> {
    const rows = await this.prisma.client.catalogCategory.findMany({
      where: visibleOnly ? { visibility: 'VISIBLE' } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const byParent = new Map<string | null, CategoryRow[]>();
    for (const row of rows) {
      const key = row.parentId;
      const list = byParent.get(key) ?? [];
      list.push(row);
      byParent.set(key, list);
    }
    const build = (parentId: string | null): CatalogCategoryTreeNodeDto[] =>
      (byParent.get(parentId) ?? []).map((row) => ({
        id: row.id,
        parentId: row.parentId,
        slug: row.slug,
        name: row.name,
        listingKind: listingKindOf(row.listingKind),
        sortOrder: row.sortOrder,
        visibility: row.visibility,
        seoTitle: row.seoTitle,
        seoDescription: row.seoDescription,
        noIndex: row.noIndex,
        children: build(row.id),
      }));
    return build(null);
  }

  async getBySlug(slug: string) {
    const row = await this.prisma.client.catalogCategory.findUnique({ where: { slug } });
    if (!row || row.visibility !== 'VISIBLE') {
      throw new NotFoundException('Category not found');
    }
    return {
      id: row.id,
      parentId: row.parentId,
      slug: row.slug,
      name: row.name,
      listingKind: listingKindOf(row.listingKind),
      sortOrder: row.sortOrder,
      visibility: row.visibility,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      noIndex: row.noIndex,
    };
  }

  async expandCategoryIds(
    rootId: string,
    options?: { visibleOnly?: boolean },
  ): Promise<string[]> {
    const rows = await this.prisma.client.catalogCategory.findMany({
      select: { id: true, parentId: true, visibility: true },
    });
    return collectCategoryDescendantIds(rootId, rows, options);
  }

  async create(
    input: {
      name: string;
      slug?: string;
      parentId?: string | null;
      listingKind?: string | null;
      sortOrder?: number;
    },
    actor?: ActorContext,
  ): Promise<CatalogCategoryAdminDto> {
    const slug = normalizeSlug(input.slug?.trim() || input.name);
    if (!slug) throw new BadRequestException('Slug could not be derived');
    if (input.parentId) {
      const parent = await this.prisma.client.catalogCategory.findUnique({
        where: { id: input.parentId },
      });
      if (!parent) throw new BadRequestException('Parent category not found');
    }
    if (input.listingKind && !isCatalogListingKind(input.listingKind)) {
      throw new BadRequestException('Invalid listingKind');
    }
    try {
      const created = await this.prisma.client.$transaction(async (tx) => {
        const row = await tx.catalogCategory.create({
          data: {
            name: input.name.trim(),
            slug,
            parentId: input.parentId ?? null,
            listingKind: input.listingKind ?? null,
            sortOrder: input.sortOrder ?? 0,
          },
          include: { _count: { select: { children: true, products: true } } },
        });
        if (actor) {
          await this.audit.record(
            {
              actorAdminUserId: actor.actorId,
              action: 'TAXONOMY_CREATED',
              entityType: 'CatalogCategory',
              entityId: row.id,
              metadata: { slug: row.slug, name: row.name, parentId: row.parentId },
              requestId: actor.requestId,
              ipHash: actor.ipHash,
              userAgent: actor.userAgent,
            },
            tx,
          );
        }
        return row;
      });
      await this.pingStorefront();
      return toAdminDto(created, created._count.products);
    } catch {
      throw new ConflictException('Category slug already in use');
    }
  }

  async update(
    id: string,
    input: {
      expectedVersion: number;
      name?: string;
      slug?: string;
      parentId?: string | null;
      listingKind?: string | null;
      sortOrder?: number;
      visibility?: TaxonomyVisibility;
      seoTitle?: string | null;
      seoDescription?: string | null;
      noIndex?: boolean;
    },
    actor?: ActorContext,
  ): Promise<CatalogCategoryAdminDto> {
    if (input.parentId === id) {
      throw new BadRequestException('Category cannot be its own parent');
    }
    if (input.parentId) {
      const descendants = await this.expandCategoryIds(id);
      if (descendants.includes(input.parentId)) {
        throw new BadRequestException('Cannot move category under its descendant');
      }
      const parent = await this.prisma.client.catalogCategory.findUnique({
        where: { id: input.parentId },
      });
      if (!parent) throw new BadRequestException('Parent category not found');
    }
    if (input.listingKind && !isCatalogListingKind(input.listingKind)) {
      throw new BadRequestException('Invalid listingKind');
    }
    const slug = input.slug !== undefined ? normalizeSlug(input.slug) : undefined;
    if (input.slug !== undefined && !slug) {
      throw new BadRequestException('Slug could not be derived');
    }

    const data: Prisma.CatalogCategoryUpdateManyMutationInput = {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(slug !== undefined ? { slug } : {}),
      ...(input.listingKind !== undefined ? { listingKind: input.listingKind } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
      ...(input.seoTitle !== undefined ? { seoTitle: input.seoTitle } : {}),
      ...(input.seoDescription !== undefined ? { seoDescription: input.seoDescription } : {}),
      ...(input.noIndex !== undefined ? { noIndex: input.noIndex } : {}),
      version: { increment: 1 },
    };

    try {
      const updated = await this.prisma.client.$transaction(async (tx) => {
        const result = await tx.catalogCategory.updateMany({
          where: { id, version: input.expectedVersion },
          data: {
            ...data,
            ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
          },
        });
        if (result.count === 0) {
          const exists = await tx.catalogCategory.findUnique({ where: { id } });
          if (!exists) throw new NotFoundException('Category not found');
          throw new ConflictException('Category was modified elsewhere');
        }
        const row = await tx.catalogCategory.findUniqueOrThrow({
          where: { id },
          include: { _count: { select: { children: true, products: true } } },
        });
        if (actor) {
          await this.audit.record(
            {
              actorAdminUserId: actor.actorId,
              action: 'TAXONOMY_UPDATED',
              entityType: 'CatalogCategory',
              entityId: id,
              metadata: {
                fields: Object.keys(input).filter((key) => key !== 'expectedVersion'),
                ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
                ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
              },
              requestId: actor.requestId,
              ipHash: actor.ipHash,
              userAgent: actor.userAgent,
            },
            tx,
          );
        }
        return row;
      });
      await this.pingStorefront();
      return toAdminDto(updated, updated._count.products);
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof ConflictException ||
        err instanceof BadRequestException
      ) {
        throw err;
      }
      throw new ConflictException('Category slug already in use');
    }
  }

  /**
   * Swap sortOrder with the previous/next sibling (same parent).
   */
  async reorderSibling(
    id: string,
    direction: 'up' | 'down',
    expectedVersion: number,
    actor?: ActorContext,
  ): Promise<CatalogCategoryAdminDto> {
    const current = await this.prisma.client.catalogCategory.findUnique({
      where: { id },
      include: { _count: { select: { children: true, products: true } } },
    });
    if (!current) throw new NotFoundException('Category not found');
    if (current.version !== expectedVersion) {
      throw new ConflictException('Category was modified elsewhere');
    }

    const siblings = await this.prisma.client.catalogCategory.findMany({
      where: { parentId: current.parentId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const index = siblings.findIndex((row) => row.id === id);
    const swapWith = direction === 'up' ? siblings[index - 1] : siblings[index + 1];
    if (!swapWith) {
      return toAdminDto(current, current._count.products);
    }

    await this.prisma.client.$transaction(async (tx) => {
      const bumped = await tx.catalogCategory.updateMany({
        where: { id, version: expectedVersion },
        data: { sortOrder: swapWith.sortOrder, version: { increment: 1 } },
      });
      if (bumped.count === 0) {
        throw new ConflictException('Category was modified elsewhere');
      }
      await tx.catalogCategory.update({
        where: { id: swapWith.id },
        data: { sortOrder: current.sortOrder, version: { increment: 1 } },
      });
      if (actor) {
        await this.audit.record(
          {
            actorAdminUserId: actor.actorId,
            action: 'TAXONOMY_UPDATED',
            entityType: 'CatalogCategory',
            entityId: id,
            metadata: { reorder: direction, swappedWith: swapWith.id },
            requestId: actor.requestId,
            ipHash: actor.ipHash,
            userAgent: actor.userAgent,
          },
          tx,
        );
      }
    });

    await this.pingStorefront();
    const rows = await this.listAdmin();
    const row = rows.find((item) => item.id === id);
    if (!row) throw new NotFoundException('Category not found');
    return row;
  }

  /** Delete only when the category has no children and no direct products. */
  async deleteEmpty(id: string, expectedVersion: number, actor?: ActorContext): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      const row = await tx.catalogCategory.findUnique({
        where: { id },
        include: { _count: { select: { children: true, products: true } } },
      });
      if (!row) throw new NotFoundException('Category not found');
      if (row.version !== expectedVersion) {
        throw new ConflictException('Category was modified elsewhere');
      }
      if (row._count.children > 0) {
        throw new BadRequestException({
          message: 'Category has child categories',
          error: 'CatalogDeleteBlocked',
          code: 'HAS_CHILDREN',
          childrenCount: row._count.children,
        });
      }
      if (row._count.products > 0) {
        throw new BadRequestException({
          message: 'Category has products',
          error: 'CatalogDeleteBlocked',
          code: 'HAS_PRODUCTS',
          productsCount: row._count.products,
        });
      }
      await tx.catalogCategory.delete({ where: { id } });
      if (actor) {
        await this.audit.record(
          {
            actorAdminUserId: actor.actorId,
            action: 'TAXONOMY_DELETED',
            entityType: 'CatalogCategory',
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

  /**
   * Atomically reassign all direct products to `targetCategoryId`, then delete.
   * Blocked when the category still has children.
   */
  async reassignProductsAndDelete(
    id: string,
    input: { expectedVersion: number; targetCategoryId: string },
    actor?: ActorContext,
  ): Promise<{ reassignedCount: number }> {
    if (input.targetCategoryId === id) {
      throw new BadRequestException('Cannot reassign products to the same category');
    }

    const result = await this.prisma.client.$transaction(async (tx) => {
      const row = await tx.catalogCategory.findUnique({
        where: { id },
        include: { _count: { select: { children: true, products: true } } },
      });
      if (!row) throw new NotFoundException('Category not found');
      if (row.version !== input.expectedVersion) {
        throw new ConflictException('Category was modified elsewhere');
      }
      if (row._count.children > 0) {
        throw new BadRequestException({
          message: 'Category has child categories',
          error: 'CatalogDeleteBlocked',
          code: 'HAS_CHILDREN',
          childrenCount: row._count.children,
        });
      }

      const target = await tx.catalogCategory.findUnique({
        where: { id: input.targetCategoryId },
      });
      if (!target) throw new BadRequestException('Target category not found');

      const descendants = collectCategoryDescendantIds(
        id,
        (
          await tx.catalogCategory.findMany({
            select: { id: true, parentId: true, visibility: true },
          })
        ).map((r) => ({
          id: r.id,
          parentId: r.parentId,
          visibility: r.visibility as TaxonomyVisibility,
        })),
      );
      if (descendants.includes(input.targetCategoryId)) {
        throw new BadRequestException('Cannot reassign into a descendant of the deleted category');
      }

      const updated = await tx.product.updateMany({
        where: { catalogCategoryId: id },
        data: { catalogCategoryId: input.targetCategoryId },
      });

      await tx.catalogCategory.delete({ where: { id } });

      if (actor) {
        await this.audit.record(
          {
            actorAdminUserId: actor.actorId,
            action: 'TAXONOMY_DELETED',
            entityType: 'CatalogCategory',
            entityId: id,
            metadata: {
              slug: row.slug,
              name: row.name,
              reassignedCount: updated.count,
              targetCategoryId: input.targetCategoryId,
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

  private async pingStorefront() {
    await this.revalidate.ping({ tags: ['catalog', 'categories'], paths: ['/', '/bukety'] });
  }
}

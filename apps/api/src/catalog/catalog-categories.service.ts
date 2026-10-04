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
import { PrismaService } from '../database/prisma.service';

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

function toAdminDto(row: CategoryRow): CatalogCategoryAdminDto {
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
  };
}

@Injectable()
export class CatalogCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async listAdmin(): Promise<CatalogCategoryAdminDto[]> {
    const rows = await this.prisma.client.catalogCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { children: true, products: true } } },
    });
    return rows.map(toAdminDto);
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

  /**
   * Expand a category to itself + descendant ids (for PLP filters).
   * `visibleOnly` excludes HIDDEN descendants so storefront parent PLPs
   * do not leak products assigned only to hidden children.
   */
  async expandCategoryIds(
    rootId: string,
    options?: { visibleOnly?: boolean },
  ): Promise<string[]> {
    const rows = await this.prisma.client.catalogCategory.findMany({
      select: { id: true, parentId: true, visibility: true },
    });
    return collectCategoryDescendantIds(rootId, rows, options);
  }

  async create(input: {
    name: string;
    slug?: string;
    parentId?: string | null;
    listingKind?: string | null;
    sortOrder?: number;
  }): Promise<CatalogCategoryAdminDto> {
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
      const created = await this.prisma.client.catalogCategory.create({
        data: {
          name: input.name.trim(),
          slug,
          parentId: input.parentId ?? null,
          listingKind: input.listingKind ?? null,
          sortOrder: input.sortOrder ?? 0,
        },
        include: { _count: { select: { children: true, products: true } } },
      });
      return toAdminDto(created);
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
  ): Promise<CatalogCategoryAdminDto> {
    const existing = await this.prisma.client.catalogCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Category not found');
    if (existing.version !== input.expectedVersion) {
      throw new ConflictException('Category was modified elsewhere');
    }
    if (input.parentId === id) {
      throw new BadRequestException('Category cannot be its own parent');
    }
    if (input.parentId) {
      const descendants = await this.expandCategoryIds(id);
      if (descendants.includes(input.parentId)) {
        throw new BadRequestException('Cannot move category under its descendant');
      }
    }
    if (input.listingKind && !isCatalogListingKind(input.listingKind)) {
      throw new BadRequestException('Invalid listingKind');
    }
    const slug = input.slug !== undefined ? normalizeSlug(input.slug) : undefined;
    if (input.slug !== undefined && !slug) {
      throw new BadRequestException('Slug could not be derived');
    }
    try {
      const updated = await this.prisma.client.catalogCategory.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(slug !== undefined ? { slug } : {}),
          ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
          ...(input.listingKind !== undefined ? { listingKind: input.listingKind } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
          ...(input.seoTitle !== undefined ? { seoTitle: input.seoTitle } : {}),
          ...(input.seoDescription !== undefined ? { seoDescription: input.seoDescription } : {}),
          ...(input.noIndex !== undefined ? { noIndex: input.noIndex } : {}),
          version: { increment: 1 },
        },
        include: { _count: { select: { children: true, products: true } } },
      });
      return toAdminDto(updated);
    } catch {
      throw new ConflictException('Category slug already in use');
    }
  }
}

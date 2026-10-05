import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  defaultFilterKeysForPreset,
  HEIGHT_BANDS,
  heightBandWhere,
  isCatalogFilterKey,
  listingKindToFilterPreset,
  type CatalogCategoryFilterConfigDto,
  type CatalogCategoryFilterPublicDto,
  type CatalogFilterDefinitionDto,
  type CatalogFilterKey,
  type CatalogFilterOptionDto,
  type CatalogFilterPreset,
  type CatalogFilterType,
} from '@bouquet-one/contracts';
import { PrismaService } from '../database/prisma.service';
import { CatalogCategoriesService } from './catalog-categories.service';
import { effectivelyPublishedWhere } from './products.repository';
import { StorefrontRevalidateService } from '../storefront/storefront-revalidate.service';

type DefinitionRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  filterType: CatalogFilterType;
  sourceKey: string;
  supported: boolean;
  defaultEnabled: boolean;
  defaultSortOrder: number;
};

/** Only filters with correct storefront PLP wiring are exposed publicly. */
const PUBLIC_RUNTIME_FILTER_KEYS = new Set<CatalogFilterKey>([
  'promo',
  'flower_type',
  'variety',
  'origin',
  'stem_height',
  'color',
  'occasion',
  'recipient',
  'bouquet_size',
]);

@Injectable()
export class CatalogFiltersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CatalogCategoriesService,
    private readonly revalidate: StorefrontRevalidateService,
  ) {}

  async listDefinitions(): Promise<CatalogFilterDefinitionDto[]> {
    const rows = await this.prisma.client.catalogFilterDefinition.findMany({
      orderBy: [{ defaultSortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((row) => this.toDefinitionDto(row));
  }

  async getCategoryFiltersAdmin(categoryId: string): Promise<{
    categoryId: string;
    filters: CatalogCategoryFilterConfigDto[];
    available: CatalogFilterDefinitionDto[];
  }> {
    const category = await this.prisma.client.catalogCategory.findUnique({
      where: { id: categoryId },
    });
    if (!category) throw new NotFoundException('Категория не найдена');

    const definitions = await this.prisma.client.catalogFilterDefinition.findMany({
      where: { supported: true },
      orderBy: [{ defaultSortOrder: 'asc' }, { name: 'asc' }],
    });
    const configured = await this.prisma.client.catalogCategoryFilter.findMany({
      where: { categoryId },
      include: { definition: true },
      orderBy: [{ position: 'asc' }],
    });

    const configuredKeys = new Set(configured.map((row) => row.definition.key));
    return {
      categoryId,
      filters: configured.map((row) => this.toConfigDto(row)),
      available: definitions
        .filter((row) => !configuredKeys.has(row.key))
        .map((row) => this.toDefinitionDto(row)),
    };
  }

  async replaceCategoryFilters(
    categoryId: string,
    input: {
      filters: Array<{
        key: string;
        enabled?: boolean;
        position?: number;
        labelOverride?: string | null;
        collapsed?: boolean;
      }>;
    },
  ): Promise<{
    categoryId: string;
    filters: CatalogCategoryFilterConfigDto[];
    available: CatalogFilterDefinitionDto[];
  }> {
    const category = await this.prisma.client.catalogCategory.findUnique({
      where: { id: categoryId },
    });
    if (!category) throw new NotFoundException('Категория не найдена');

    const definitions = await this.prisma.client.catalogFilterDefinition.findMany({
      where: { supported: true },
    });
    const byKey = new Map(definitions.map((row) => [row.key, row]));

    const normalized = input.filters.map((row, index) => {
      if (!isCatalogFilterKey(row.key) || !byKey.has(row.key)) {
        throw new BadRequestException(`Неизвестный фильтр: ${row.key}`);
      }
      return {
        key: row.key as CatalogFilterKey,
        definitionId: byKey.get(row.key)!.id,
        enabled: row.enabled ?? true,
        position: row.position ?? index,
        labelOverride: row.labelOverride?.trim() ? row.labelOverride.trim() : null,
        collapsed: row.collapsed ?? false,
      };
    });

    const seen = new Set<string>();
    for (const row of normalized) {
      if (seen.has(row.key)) {
        throw new BadRequestException(`Фильтр «${row.key}» указан дважды`);
      }
      seen.add(row.key);
    }

    await this.prisma.client.$transaction(async (tx) => {
      await tx.catalogCategoryFilter.deleteMany({ where: { categoryId } });
      if (normalized.length === 0) return;
      await tx.catalogCategoryFilter.createMany({
        data: normalized.map((row) => ({
          categoryId,
          definitionId: row.definitionId,
          enabled: row.enabled,
          position: row.position,
          labelOverride: row.labelOverride,
          collapsed: row.collapsed,
        })),
      });
      await tx.catalogCategory.update({
        where: { id: categoryId },
        data: { version: { increment: 1 } },
      });
    });

    await this.revalidate.ping({ tags: ['catalog'] });
    return this.getCategoryFiltersAdmin(categoryId);
  }

  async applyPreset(
    categoryId: string,
    preset?: CatalogFilterPreset | null,
  ): Promise<{
    categoryId: string;
    filters: CatalogCategoryFilterConfigDto[];
    available: CatalogFilterDefinitionDto[];
  }> {
    const category = await this.prisma.client.catalogCategory.findUnique({
      where: { id: categoryId },
    });
    if (!category) throw new NotFoundException('Категория не найдена');

    const resolved: CatalogFilterPreset =
      preset ?? listingKindToFilterPreset(category.listingKind as never);
    const keys = defaultFilterKeysForPreset(resolved);

    return this.replaceCategoryFilters(categoryId, {
      filters: keys.map((key, position) => ({ key, enabled: true, position })),
    });
  }

  /**
   * Enabled Filter Pool keys for a visible category (no contextual options).
   * Used to gate listing query params before Prisma.
   */
  async getEnabledPublicFilterKeys(slug: string): Promise<CatalogFilterKey[]> {
    const configured = await this.loadEnabledPublicFilterRows(slug);
    const keys: CatalogFilterKey[] = [];
    for (const row of configured) {
      if (!row.definition.supported) continue;
      if (!isCatalogFilterKey(row.definition.key)) continue;
      if (!PUBLIC_RUNTIME_FILTER_KEYS.has(row.definition.key)) continue;
      keys.push(row.definition.key);
    }
    return keys;
  }

  /**
   * Public storefront filter strip for a category.
   * Empty facet options are omitted (price/promo always kept when enabled).
   */
  async getPublicCategoryFilters(slug: string): Promise<CatalogCategoryFilterPublicDto[]> {
    const category = await this.prisma.client.catalogCategory.findFirst({
      where: { slug, visibility: 'VISIBLE' },
    });
    if (!category) throw new NotFoundException('Категория не найдена');

    const configured = await this.loadEnabledPublicFilterRows(slug);
    const categoryIds = await this.categories.expandCategoryIds(category.id, {
      visibleOnly: true,
    });
    const now = new Date();

    const out: CatalogCategoryFilterPublicDto[] = [];
    for (const row of configured) {
      if (!row.definition.supported) continue;
      if (!isCatalogFilterKey(row.definition.key)) continue;
      const key = row.definition.key;
      if (!PUBLIC_RUNTIME_FILTER_KEYS.has(key)) continue;
      const label = row.labelOverride?.trim() || row.definition.name;
      const options = await this.buildContextualOptions(key, categoryIds, now);
      if (options === null) continue; // empty facet — hide
      out.push({
        key,
        label,
        filterType: row.definition.filterType,
        collapsed: row.collapsed,
        options,
      });
    }
    return out;
  }

  private async loadEnabledPublicFilterRows(slug: string) {
    const category = await this.prisma.client.catalogCategory.findFirst({
      where: { slug, visibility: 'VISIBLE' },
    });
    if (!category) throw new NotFoundException('Категория не найдена');

    let configured = await this.prisma.client.catalogCategoryFilter.findMany({
      where: { categoryId: category.id, enabled: true },
      include: { definition: true },
      orderBy: [{ position: 'asc' }],
    });

    if (configured.length === 0) {
      const keys = defaultFilterKeysForPreset(
        listingKindToFilterPreset(category.listingKind as never),
      );
      const definitions = await this.prisma.client.catalogFilterDefinition.findMany({
        where: { key: { in: keys }, supported: true },
      });
      const byKey = new Map(definitions.map((row) => [row.key, row]));
      configured = keys
        .map((key, position) => {
          const definition = byKey.get(key);
          if (!definition) return null;
          return {
            id: definition.id,
            categoryId: category.id,
            definitionId: definition.id,
            enabled: true,
            position,
            labelOverride: null,
            config: null,
            collapsed: false,
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            definition,
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row));
    }

    return configured;
  }

  /**
   * Returns options, or null when the filter should be hidden (empty facet).
   * price/promo return [] (still shown).
   */
  private async buildContextualOptions(
    key: CatalogFilterKey,
    categoryIds: string[],
    now: Date,
  ): Promise<CatalogFilterOptionDto[] | null> {
    const productWhere = {
      AND: [
        effectivelyPublishedWhere(now),
        { catalogCategoryId: { in: categoryIds } },
      ],
    };

    switch (key) {
      case 'price':
      case 'promo':
        return [];
      case 'flower_type': {
        const rows = await this.prisma.client.flowerType.findMany({
          where: {
            visibility: 'VISIBLE',
            OR: [
              { items: { some: { components: { some: { product: productWhere } } } } },
              { products: { some: productWhere } },
            ],
          },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: { id: true, slug: true, name: true },
        });
        return rows.length > 0 ? rows : null;
      }
      case 'variety': {
        const rows = await this.prisma.client.flowerVariety.findMany({
          where: {
            visibility: 'VISIBLE',
            OR: [
              { items: { some: { components: { some: { product: productWhere } } } } },
              { products: { some: productWhere } },
            ],
          },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: { id: true, slug: true, name: true },
        });
        return rows.length > 0 ? rows : null;
      }
      case 'origin': {
        const rows = await this.prisma.client.flowerOrigin.findMany({
          where: {
            visibility: 'VISIBLE',
            OR: [
              { items: { some: { components: { some: { product: productWhere } } } } },
              { products: { some: productWhere } },
            ],
          },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: { id: true, slug: true, name: true },
        });
        return rows.length > 0 ? rows : null;
      }
      case 'color': {
        const rows = await this.prisma.client.color.findMany({
          where: {
            visibility: 'VISIBLE',
            products: { some: { product: productWhere } },
          },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: { id: true, slug: true, name: true },
        });
        return rows.length > 0 ? rows : null;
      }
      case 'occasion': {
        const rows = await this.prisma.client.occasion.findMany({
          where: {
            visibility: 'VISIBLE',
            products: { some: { product: productWhere } },
          },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: { id: true, slug: true, name: true },
        });
        return rows.length > 0 ? rows : null;
      }
      case 'recipient': {
        const rows = await this.prisma.client.recipient.findMany({
          where: {
            visibility: 'VISIBLE',
            products: { some: { product: productWhere } },
          },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: { id: true, slug: true, name: true },
        });
        return rows.length > 0 ? rows : null;
      }
      case 'bouquet_size': {
        const rows = await this.prisma.client.bouquetSize.findMany({
          where: {
            visibility: 'VISIBLE',
            products: { some: productWhere },
          },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: { id: true, slug: true, name: true },
        });
        return rows.length > 0 ? rows : null;
      }
      case 'stem_height': {
        const present: CatalogFilterOptionDto[] = [];
        for (const band of HEIGHT_BANDS) {
          const bounds = heightBandWhere(band.id);
          if (!bounds) continue;
          const count = await this.prisma.client.product.count({
            where: {
              AND: [
                productWhere,
                {
                  components: {
                    some: { flowerItem: { heightCm: bounds } },
                  },
                },
              ],
            },
          });
          if (count > 0) {
            present.push({ id: band.id, slug: band.id, name: band.label });
          }
        }
        return present.length > 0 ? present : null;
      }
      case 'bouquet_height': {
        const present: CatalogFilterOptionDto[] = [];
        for (const band of HEIGHT_BANDS) {
          const bounds = heightBandWhere(band.id);
          if (!bounds) continue;
          const count = await this.prisma.client.product.count({
            where: {
              AND: [productWhere, { heightCm: bounds }],
            },
          });
          if (count > 0) {
            present.push({ id: band.id, slug: band.id, name: band.label });
          }
        }
        return present.length > 0 ? present : null;
      }
      case 'quantity': {
        const groups = await this.prisma.client.productComponent.groupBy({
          by: ['quantity'],
          where: {
            quantity: { not: null },
            product: productWhere,
          },
          orderBy: { quantity: 'asc' },
        });
        const options = groups
          .filter((row) => row.quantity != null)
          .map((row) => ({
            id: String(row.quantity),
            slug: String(row.quantity),
            name: `${row.quantity}`,
          }));
        return options.length > 0 ? options : null;
      }
      default:
        return null;
    }
  }

  private toDefinitionDto(row: DefinitionRow): CatalogFilterDefinitionDto {
    return {
      id: row.id,
      key: row.key as CatalogFilterKey,
      name: row.name,
      description: row.description,
      filterType: row.filterType,
      sourceKey: row.sourceKey,
      supported: row.supported,
      defaultEnabled: row.defaultEnabled,
      defaultSortOrder: row.defaultSortOrder,
    };
  }

  private toConfigDto(row: {
    id: string;
    definitionId: string;
    enabled: boolean;
    position: number;
    labelOverride: string | null;
    collapsed: boolean;
    version: number;
    definition: DefinitionRow;
  }): CatalogCategoryFilterConfigDto {
    return {
      id: row.id,
      definitionId: row.definitionId,
      key: row.definition.key as CatalogFilterKey,
      name: row.definition.name,
      label: row.labelOverride?.trim() || row.definition.name,
      filterType: row.definition.filterType,
      enabled: row.enabled,
      position: row.position,
      labelOverride: row.labelOverride,
      collapsed: row.collapsed,
      version: row.version,
    };
  }
}

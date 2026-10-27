import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  normalizeSlug,
  parseCatalogPageRules,
  SEO_LANDING_STATUSES,
  type PaginatedResponse,
  type ProductListItemDto,
  type SeoLandingPageDto,
  type SeoLandingPagePublicDto,
  type SeoLandingStatus,
} from '@bouquet-one/contracts';
import type { Prisma } from '@bouquet-one/database';
import { AuditService } from '../audit/audit.service';
import { hashIp } from '../auth/crypto.util';
import type { ActorContext } from '../common/actor.util';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../database/prisma.service';
import { MediaService } from '../media/media.service';
import { StorefrontRevalidateService } from '../storefront/storefront-revalidate.service';
import { CatalogMatchService, toProductListFilters } from './catalog-match.service';
import { isEffectivelyPublished, OCC_CONFLICT_MESSAGE } from './catalog.logic';
import { toProductListItemDto } from './catalog.mapper';
import {
  type ProductListFilters,
  ProductsRepository,
} from './products.repository';
import { SlugRedirectsService } from './slug-redirects.service';

const LANDING_INCLUDE = {
  pinnedProducts: { orderBy: { sortOrder: 'asc' as const } },
  excludedProducts: true,
} satisfies Prisma.SeoLandingPageInclude;

type LandingRow = Prisma.SeoLandingPageGetPayload<{ include: typeof LANDING_INCLUDE }>;

/**
 * JSON rules keys accepted from Admin — subset of ProductListFilters
 * shared with the public catalog (same-component AND semantics).
 */
const RULE_KEYS = [
  'flowerTypeIds',
  'flowerTypeSlugs',
  /** Aliases → flowerTypeSlugs (contains). */
  'containsFlowerType',
  'containsFlowerTypeSlugs',
  'onlyFlowerTypeIds',
  'onlyFlowerTypeSlugs',
  /** Alias → onlyFlowerTypeSlugs. */
  'onlyFlowerType',
  'flowerFormIds',
  'flowerFormSlugs',
  'flowerVarietyIds',
  'flowerVarietySlugs',
  'colorIds',
  'colorSlugs',
  'componentColorIds',
  'componentColorSlugs',
  /** Alias → componentColorSlugs (FlowerItem / component line color). */
  'flowerColor',
  'flowerColorSlugs',
  'compositionKinds',
  /** Alias → compositionKinds. */
  'compositionType',
  'productKinds',
  'occasionIds',
  'occasionSlugs',
  'recipientIds',
  'recipientSlugs',
  'minPriceMinor',
  'maxPriceMinor',
  'minFlowerTypeQuantity',
  'flowerTypeQuantitySlug',
  'dominantFlowerTypeSlug',
  'traitKeys',
] as const;

const COMPOSITION_KINDS = new Set(['MONO', 'MIXED', 'UNKNOWN']);
const PRODUCT_KINDS = new Set([
  'BOUQUET',
  'COMPOSITION',
  'STEM',
  'PLANT',
  'GIFT',
  'OTHER',
]);
const SCALAR_STRING_KEYS = new Set([
  'minPriceMinor',
  'maxPriceMinor',
  'flowerTypeQuantitySlug',
  'dominantFlowerTypeSlug',
]);
const SCALAR_INT_KEYS = new Set(['minFlowerTypeQuantity']);

export type SeoLandingUpsertInput = {
  slug?: string;
  title?: string;
  h1?: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
  body?: string | null;
  rules?: Record<string, unknown>;
  noIndex?: boolean;
  navVisible?: boolean;
  sortOrder?: number;
  status?: SeoLandingStatus;
  pinnedProductIds?: string[];
  excludedProductIds?: string[];
};

export type CreateSeoLandingInput = {
  title: string;
  h1?: string;
  slug?: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
  body?: string | null;
  rules?: Record<string, unknown>;
  noIndex?: boolean;
  navVisible?: boolean;
  sortOrder?: number;
  pinnedProductIds?: string[];
  excludedProductIds?: string[];
};

@Injectable()
export class SeoLandingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsRepository,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    private readonly appConfig: AppConfigService,
    private readonly slugRedirects: SlugRedirectsService,
    private readonly revalidate: StorefrontRevalidateService,
    private readonly catalogMatch: CatalogMatchService,
  ) {}

  private readonly urlFor = (storageKey: string) => this.media.getPublicUrl(storageKey);

  async listAdmin(): Promise<SeoLandingPageDto[]> {
    const rows = await this.prisma.client.seoLandingPage.findMany({
      include: LANDING_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    });
    return rows.map((row) => this.toAdminDto(row));
  }

  async getAdmin(id: string): Promise<SeoLandingPageDto> {
    return this.toAdminDto(await this.findOrThrow(id));
  }

  async create(input: CreateSeoLandingInput, actor: ActorContext): Promise<SeoLandingPageDto> {
    const title = input.title.trim();
    if (!title) throw new BadRequestException('Укажите название');
    const h1 = (input.h1 ?? title).trim();
    const slug = normalizeSlug(input.slug ?? title);
    if (!slug) throw new BadRequestException('Не удалось сформировать slug');
    const rules = sanitizeRules(input.rules ?? {});
    const pinned = uniqueIds(input.pinnedProductIds ?? []);
    const excluded = uniqueIds(input.excludedProductIds ?? []);
    assertNoOverlap(pinned, excluded);

    const created = await this.prisma.client.$transaction(async (tx) => {
      const taken = await tx.seoLandingPage.findUnique({ where: { slug }, select: { id: true } });
      if (taken) throw new ConflictException('Slug already in use');

      await this.assertProductsExist(tx, [...pinned, ...excluded]);

      const row = await tx.seoLandingPage.create({
        data: {
          slug,
          title,
          h1,
          seoTitle: trimOrNull(input.seoTitle),
          seoDescription: trimOrNull(input.seoDescription),
          body: trimOrNull(input.body),
          rules,
          noIndex: input.noIndex ?? false,
          navVisible: input.navVisible ?? false,
          sortOrder: input.sortOrder ?? 0,
          pinnedProducts: {
            create: pinned.map((productId, index) => ({
              productId,
              sortOrder: index * 10,
            })),
          },
          excludedProducts: {
            create: excluded.map((productId) => ({ productId })),
          },
        },
        include: LANDING_INCLUDE,
      });

      await this.audit.record(
        {
          actorAdminUserId: actor.actorId,
          action: 'SEO_UPDATED',
          entityType: 'SeoLandingPage',
          entityId: row.id,
          metadata: { created: true, slug },
          requestId: actor.requestId,
          ipHash: hashIp(actor.ip, this.appConfig.sessionHmacSecret),
          userAgent: actor.userAgent,
        },
        tx,
      );
      return row;
    });

    await this.pingStorefront(created.slug);
    return this.toAdminDto(created);
  }

  async update(
    id: string,
    input: SeoLandingUpsertInput & { expectedVersion: number },
    actor: ActorContext,
  ): Promise<SeoLandingPageDto> {
    const current = await this.findOrThrow(id);
    const nextSlug =
      input.slug === undefined ? current.slug : normalizeSlug(input.slug);
    if (!nextSlug) throw new BadRequestException('Slug не может быть пустым');
    const slugChanged = nextSlug !== current.slug;

    if (input.status !== undefined && !SEO_LANDING_STATUSES.includes(input.status)) {
      throw new BadRequestException('Некорректный статус');
    }

    const pinned =
      input.pinnedProductIds === undefined
        ? undefined
        : uniqueIds(input.pinnedProductIds);
    const excluded =
      input.excludedProductIds === undefined
        ? undefined
        : uniqueIds(input.excludedProductIds);
    if (pinned !== undefined || excluded !== undefined) {
      const nextPinned =
        pinned ?? current.pinnedProducts.map((link) => link.productId);
      const nextExcluded =
        excluded ?? current.excludedProducts.map((link) => link.productId);
      assertNoOverlap(nextPinned, nextExcluded);
    }

    const rules =
      input.rules === undefined ? undefined : sanitizeRules(input.rules);

    await this.prisma.client.$transaction(async (tx) => {
      if (slugChanged) {
        const taken = await tx.seoLandingPage.findUnique({
          where: { slug: nextSlug },
          select: { id: true },
        });
        if (taken && taken.id !== id) {
          throw new ConflictException('Slug already in use');
        }
      }

      if (pinned !== undefined || excluded !== undefined) {
        await this.assertProductsExist(tx, [
          ...(pinned ?? []),
          ...(excluded ?? []),
        ]);
      }

      const data: Prisma.SeoLandingPageUpdateManyMutationInput = {
        ...(input.title === undefined ? {} : { title: input.title.trim() }),
        ...(input.h1 === undefined ? {} : { h1: input.h1.trim() }),
        ...(slugChanged ? { slug: nextSlug } : {}),
        ...(input.seoTitle === undefined ? {} : { seoTitle: trimOrNull(input.seoTitle) }),
        ...(input.seoDescription === undefined
          ? {}
          : { seoDescription: trimOrNull(input.seoDescription) }),
        ...(input.body === undefined ? {} : { body: trimOrNull(input.body) }),
        ...(rules === undefined ? {} : { rules }),
        ...(input.noIndex === undefined ? {} : { noIndex: input.noIndex }),
        ...(input.navVisible === undefined ? {} : { navVisible: input.navVisible }),
        ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
        ...(input.status === undefined
          ? {}
          : {
              status: input.status,
              ...(input.status === 'PUBLISHED' && !current.publishedAt
                ? { publishedAt: new Date() }
                : {}),
              ...(input.status !== 'PUBLISHED' && current.status === 'PUBLISHED'
                ? { publishedAt: null }
                : {}),
            }),
      };

      const result = await tx.seoLandingPage.updateMany({
        where: { id, version: input.expectedVersion },
        data: { ...data, version: { increment: 1 } },
      });
      if (result.count === 0) {
        throw new ConflictException(OCC_CONFLICT_MESSAGE);
      }

      if (slugChanged) {
        await this.slugRedirects.record(tx, 'SEO_LANDING', current.slug, nextSlug);
      }

      if (pinned !== undefined) {
        await tx.seoLandingPageProduct.deleteMany({ where: { landingId: id } });
        if (pinned.length > 0) {
          await tx.seoLandingPageProduct.createMany({
            data: pinned.map((productId, index) => ({
              landingId: id,
              productId,
              sortOrder: index * 10,
            })),
          });
        }
      }

      if (excluded !== undefined) {
        await tx.seoLandingPageExclude.deleteMany({ where: { landingId: id } });
        if (excluded.length > 0) {
          await tx.seoLandingPageExclude.createMany({
            data: excluded.map((productId) => ({ landingId: id, productId })),
          });
        }
      }

      await this.audit.record(
        {
          actorAdminUserId: actor.actorId,
          action: 'SEO_UPDATED',
          entityType: 'SeoLandingPage',
          entityId: id,
          metadata: {
            fields: Object.keys(input).filter((key) => key !== 'expectedVersion'),
            ...(slugChanged ? { previousSlug: current.slug, slug: nextSlug } : {}),
          },
          requestId: actor.requestId,
          ipHash: hashIp(actor.ip, this.appConfig.sessionHmacSecret),
          userAgent: actor.userAgent,
        },
        tx,
      );
    });

    const updated = await this.findOrThrow(id);
    await this.pingStorefront(updated.slug, slugChanged ? current.slug : undefined);
    return this.toAdminDto(updated);
  }

  async publish(
    id: string,
    expectedVersion: number,
    actor: ActorContext,
  ): Promise<SeoLandingPageDto> {
    return this.update(
      id,
      { expectedVersion, status: 'PUBLISHED' },
      actor,
    );
  }

  async remove(id: string, expectedVersion: number, actor: ActorContext): Promise<void> {
    const current = await this.findOrThrow(id);
    await this.prisma.client.$transaction(async (tx) => {
      const deleted = await tx.seoLandingPage.deleteMany({
        where: { id, version: expectedVersion },
      });
      if (deleted.count === 0) {
        const exists = await tx.seoLandingPage.findUnique({ where: { id }, select: { id: true } });
        if (exists) throw new ConflictException(OCC_CONFLICT_MESSAGE);
        throw new NotFoundException('SEO landing page not found');
      }
      await this.audit.record(
        {
          actorAdminUserId: actor.actorId,
          action: 'SEO_UPDATED',
          entityType: 'SeoLandingPage',
          entityId: id,
          metadata: { deleted: true, slug: current.slug },
          requestId: actor.requestId,
          ipHash: hashIp(actor.ip, this.appConfig.sessionHmacSecret),
          userAgent: actor.userAgent,
        },
        tx,
      );
    });
    await this.pingStorefront(current.slug);
  }

  /**
   * Rule-selected products with pinned ids merged at the front.
   * Used by Admin preview and the public `/p/{slug}` product grid.
   */
  async listProducts(
    landing: LandingRow,
    options: { page?: number; pageSize?: number; publishedOnly?: boolean },
  ): Promise<PaginatedResponse<ProductListItemDto>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 24;
    const now = new Date();
    const publishedOnly = options.publishedOnly !== false;

    const excludeIds = landing.excludedProducts.map((row) => row.productId);
    const pinnedIds = landing.pinnedProducts
      .map((row) => row.productId)
      .filter((id) => !excludeIds.includes(id));

    const { filters: ruleFilters } = await this.catalogMatch.resolveRulesToFilters(
      landing.rules,
    );
    const filters: ProductListFilters = {
      ...ruleFilters,
      excludeProductIds: [...new Set([...excludeIds, ...pinnedIds])],
      ...(publishedOnly ? { publishedAt: now } : {}),
    };

    const skip = Math.max(0, (page - 1) * pageSize);

    let pinnedItems: ProductListItemDto[] = [];
    if (pinnedIds.length > 0) {
      const rows = await this.products.findManyByIds(pinnedIds);
      const byId = new Map(rows.map((row) => [row.id, row]));
      pinnedItems = pinnedIds
        .map((id) => byId.get(id))
        .filter((row): row is NonNullable<typeof row> => {
          if (!row) return false;
          if (!publishedOnly) return true;
          return isEffectivelyPublished(row, now);
        })
        .map((row) => toProductListItemDto(row, this.urlFor, now));
    }

    const pinnedCount = pinnedItems.length;
    const ruleSkip = Math.max(0, skip - pinnedCount);
    const ruleTake = Math.max(0, pageSize - Math.max(0, pinnedCount - skip));

    // Always query for total; when this page is filled by pins only, take 0 rule rows.
    const { items: ruleRows, total: ruleTotal } = await this.products.list({
      filters,
      skip: ruleSkip,
      take: Math.max(ruleTake, 1),
      sort: 'recommended',
      now,
    });

    const ruleItems =
      ruleTake > 0
        ? ruleRows
            .slice(0, ruleTake)
            .map((row) => toProductListItemDto(row, this.urlFor, now))
        : [];

    const pagePinned =
      skip < pinnedCount ? pinnedItems.slice(skip, skip + pageSize) : [];

    return {
      items: [...pagePinned, ...ruleItems],
      total: pinnedCount + ruleTotal,
      page,
      pageSize,
    };
  }

  async previewProducts(
    id: string,
    query: { page?: number; pageSize?: number },
  ): Promise<PaginatedResponse<ProductListItemDto>> {
    const landing = await this.findOrThrow(id);
    return this.listProducts(landing, { ...query, publishedOnly: true });
  }

  /** Live preview for unsaved constructor rules (Admin). */
  async previewRules(
    input: {
      rules?: Record<string, unknown>;
      pinnedProductIds?: string[];
      excludedProductIds?: string[];
    },
    query: { page?: number; pageSize?: number },
  ): Promise<PaginatedResponse<ProductListItemDto>> {
    const rules = sanitizeRules(input.rules ?? {});
    const pinned = uniqueIds(input.pinnedProductIds ?? []);
    const excluded = uniqueIds(input.excludedProductIds ?? []);
    assertNoOverlap(pinned, excluded);
    const synthetic = {
      rules,
      pinnedProducts: pinned.map((productId, sortOrder) => ({ productId, sortOrder })),
      excludedProducts: excluded.map((productId) => ({ productId })),
    } as LandingRow;
    return this.listProducts(synthetic, { ...query, publishedOnly: true });
  }

  async getPublicBySlug(slug: string): Promise<
    SeoLandingPagePublicDto & {
      redirectedFrom: string | null;
      canonicalSlug: string;
    }
  > {
    const candidates = await this.slugRedirects.resolveChain('SEO_LANDING', slug);
    for (const candidate of candidates) {
      const row = await this.prisma.client.seoLandingPage.findUnique({
        where: { slug: candidate },
        include: LANDING_INCLUDE,
      });
      if (row && row.status === 'PUBLISHED') {
        return {
          ...this.toPublicDto(row),
          redirectedFrom: slug !== row.slug ? slug : null,
          canonicalSlug: row.slug,
        };
      }
      // Dual-read: thematic CatalogCategory pages (unified «Страницы каталога»).
      const page = await this.prisma.client.catalogCategory.findFirst({
        where: {
          slug: candidate,
          pageKind: 'THEMATIC',
          pageStatus: 'PUBLISHED',
          visibility: 'VISIBLE',
        },
      });
      if (page) {
        return {
          id: page.id,
          slug: page.slug,
          title: page.name,
          h1: page.h1 ?? page.name,
          seoTitle: page.seoTitle,
          seoDescription: page.seoDescription,
          body: page.body,
          noIndex: page.noIndex,
          redirectedFrom: slug !== page.slug ? slug : null,
          canonicalSlug: page.slug,
        };
      }
    }
    throw new NotFoundException('SEO landing page not found');
  }

  async listPublicProducts(
    slug: string,
    query: { page?: number; pageSize?: number },
  ): Promise<PaginatedResponse<ProductListItemDto>> {
    const candidates = await this.slugRedirects.resolveChain('SEO_LANDING', slug);
    for (const candidate of candidates) {
      const row = await this.prisma.client.seoLandingPage.findUnique({
        where: { slug: candidate },
        include: LANDING_INCLUDE,
      });
      if (row && row.status === 'PUBLISHED') {
        return this.listProducts(row, { ...query, publishedOnly: true });
      }
      const page = await this.prisma.client.catalogCategory.findFirst({
        where: {
          slug: candidate,
          pageKind: 'THEMATIC',
          pageStatus: 'PUBLISHED',
          visibility: 'VISIBLE',
        },
        include: {
          pinnedProducts: { orderBy: { sortOrder: 'asc' } },
          excludedProducts: true,
        },
      });
      if (page) {
        const synthetic = {
          rules: page.rules ?? {},
          pinnedProducts: page.pinnedProducts.map((p) => ({
            productId: p.productId,
            sortOrder: p.sortOrder,
          })),
          excludedProducts: page.excludedProducts.map((p) => ({ productId: p.productId })),
        } as LandingRow;
        return this.listProducts(synthetic, { ...query, publishedOnly: true });
      }
    }
    throw new NotFoundException('SEO landing page not found');
  }

  async listSitemapEntries(): Promise<Array<{ path: string; updatedAt: string }>> {
    const [legacy, pages] = await Promise.all([
      this.prisma.client.seoLandingPage.findMany({
        where: { status: 'PUBLISHED', noIndex: false },
        select: { slug: true, updatedAt: true },
      }),
      this.prisma.client.catalogCategory.findMany({
        where: {
          pageKind: 'THEMATIC',
          pageStatus: 'PUBLISHED',
          visibility: 'VISIBLE',
          noIndex: false,
        },
        select: { slug: true, updatedAt: true },
      }),
    ]);
    const bySlug = new Map<string, { path: string; updatedAt: string }>();
    for (const row of legacy) {
      bySlug.set(row.slug, {
        path: `/catalog/${row.slug}`,
        updatedAt: row.updatedAt.toISOString(),
      });
    }
    for (const row of pages) {
      // Prefer /catalog/[slug] for unified thematic pages (canonical storefront path).
      bySlug.set(row.slug, {
        path: `/catalog/${row.slug}`,
        updatedAt: row.updatedAt.toISOString(),
      });
    }
    return [...bySlug.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  private async findOrThrow(id: string): Promise<LandingRow> {
    const row = await this.prisma.client.seoLandingPage.findUnique({
      where: { id },
      include: LANDING_INCLUDE,
    });
    if (!row) throw new NotFoundException('SEO landing page not found');
    return row;
  }

  private toAdminDto(row: LandingRow): SeoLandingPageDto {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      h1: row.h1,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      body: row.body,
      rules: asRulesRecord(row.rules),
      status: row.status,
      noIndex: row.noIndex,
      navVisible: row.navVisible,
      sortOrder: row.sortOrder,
      version: row.version,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      pinnedProductIds: row.pinnedProducts.map((link) => link.productId),
      excludedProductIds: row.excludedProducts.map((link) => link.productId),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toPublicDto(row: LandingRow): SeoLandingPagePublicDto {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      h1: row.h1,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      body: row.body,
      noIndex: row.noIndex,
    };
  }

  private async assertProductsExist(
    tx: Prisma.TransactionClient,
    ids: string[],
  ): Promise<void> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return;
    const count = await tx.product.count({ where: { id: { in: unique } } });
    if (count !== unique.length) {
      throw new BadRequestException('Указан несуществующий товар');
    }
  }

  private async pingStorefront(slug: string, previousSlug?: string): Promise<void> {
    const paths = [`/catalog/${slug}`, '/sitemap.xml'];
    if (previousSlug && previousSlug !== slug) {
      paths.push(`/catalog/${previousSlug}`);
    }
    await this.revalidate.ping({
      tags: ['catalog', 'sitemap', 'seo-landings'],
      paths,
    });
  }
}

function trimOrNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

function assertNoOverlap(pinned: string[], excluded: string[]): void {
  const excludedSet = new Set(excluded);
  if (pinned.some((id) => excludedSet.has(id))) {
    throw new BadRequestException('Товар нельзя одновременно закрепить и исключить');
  }
}

function asRulesRecord(value: Prisma.JsonValue): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function sanitizeRules(input: Record<string, unknown>): Prisma.InputJsonValue {
  const out: Record<string, unknown> = {};
  for (const key of RULE_KEYS) {
    if (!(key in input)) continue;
    const value = input[key];
    if (value === undefined || value === null || value === '') continue;

    if (SCALAR_STRING_KEYS.has(key)) {
      const text = String(value).trim();
      if (!text) continue;
      if (
        (key === 'minPriceMinor' || key === 'maxPriceMinor') &&
        !/^\d+$/.test(text)
      ) {
        throw new BadRequestException(`${key} must be integer minor units as a string`);
      }
      if (
        (key === 'flowerTypeQuantitySlug' || key === 'dominantFlowerTypeSlug') &&
        text.length > 120
      ) {
        throw new BadRequestException(`${key} слишком длинный`);
      }
      out[key] = text;
      continue;
    }

    if (SCALAR_INT_KEYS.has(key)) {
      const n = typeof value === 'number' ? value : Number(String(value).trim());
      if (!Number.isInteger(n) || n < 1) {
        throw new BadRequestException(`${key} must be a positive integer`);
      }
      out[key] = n;
      continue;
    }

    if (key === 'compositionKinds' || key === 'compositionType') {
      const list = asStringArray(value);
      if (!list || list.some((item) => !COMPOSITION_KINDS.has(item))) {
        throw new BadRequestException(`${key} содержит недопустимое значение`);
      }
      if (list.length > 0) out[key] = list;
      continue;
    }

    if (key === 'productKinds') {
      const list = asStringArray(value);
      if (!list || list.some((item) => !PRODUCT_KINDS.has(item))) {
        throw new BadRequestException('productKinds содержит недопустимое значение');
      }
      if (list.length > 0) out[key] = list;
      continue;
    }

    const list = asStringArray(value);
    if (list && list.length > 0) out[key] = list;
  }

  if (out.minFlowerTypeQuantity != null && !out.flowerTypeQuantitySlug) {
    throw new BadRequestException(
      'Для минимального количества укажите вид цветка (flowerTypeQuantitySlug)',
    );
  }

  return out as Prisma.InputJsonValue;
}

function asStringArray(value: unknown): string[] | null {
  if (typeof value === 'string') {
    const parts = value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    return parts.length > 0 ? [...new Set(parts)] : null;
  }
  if (Array.isArray(value)) {
    const parts = value.map((item) => String(item).trim()).filter(Boolean);
    return parts.length > 0 ? [...new Set(parts)] : null;
  }
  return null;
}

/**
 * Parse rules JSON into list filters (slug passthrough, no taxonomy lookup).
 * Prefer CatalogMatchService.resolveRulesToFilters for public/admin/placement
 * so flowerTypeIds win and page slugs like «rozy» resolve via aliases.
 */
export function rulesToFilters(rules: Prisma.JsonValue): ProductListFilters {
  return toProductListFilters(parseCatalogPageRules(rules));
}

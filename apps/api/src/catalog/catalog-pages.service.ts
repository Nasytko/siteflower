import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  categoryPublicHref,
  evaluateCatalogPageDeleteImpact,
  isCatalogListingKind,
  isCatalogPageKind,
  normalizeSlug,
  type CatalogPageDeleteImpactDto,
  type CatalogListingKind,
  type CatalogPageDto,
  type CatalogPageKind,
  type CatalogPageProductMatchDto,
  type CatalogPageMatchReasonDto,
  type PaginatedResponse,
  type ProductListItemDto,
  type ProductTraitDefinitionDto,
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
import { CatalogCategoriesService } from './catalog-categories.service';
import { CatalogMatchService } from './catalog-match.service';
import {
  mergeListingIntoFilters,
  resolveCategoryListingFilters,
} from './catalog-listing.util';
import { isEffectivelyPublished } from './catalog.logic';
import { toProductListItemDto } from './catalog.mapper';
import { describeSeoLandingRules } from './placement-match.util';
import { ProductsRepository } from './products.repository';
import { SlugRedirectsService } from './slug-redirects.service';

const PAGE_INCLUDE = {
  pinnedProducts: { select: { productId: true, sortOrder: true } },
  excludedProducts: { select: { productId: true } },
} as const;

type PageRow = Prisma.CatalogCategoryGetPayload<{ include: typeof PAGE_INCLUDE }>;

@Injectable()
export class CatalogPagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsRepository,
    private readonly audit: AuditService,
    private readonly appConfig: AppConfigService,
    private readonly revalidate: StorefrontRevalidateService,
    private readonly slugRedirects: SlugRedirectsService,
    private readonly catalogMatch: CatalogMatchService,
    private readonly media: MediaService,
    private readonly categories: CatalogCategoriesService,
  ) {}

  private readonly urlFor = (storageKey: string) => this.media.getPublicUrl(storageKey);

  async listAdmin(opts?: {
    pageKind?: CatalogPageKind;
    status?: string;
    q?: string;
    withCounts?: boolean;
  }): Promise<CatalogPageDto[]> {
    const where: Prisma.CatalogCategoryWhereInput = {
      pageKind: { not: 'LEGACY' },
    };
    if (opts?.pageKind) where.pageKind = opts.pageKind;
    if (opts?.status === 'PUBLISHED' || opts?.status === 'DRAFT' || opts?.status === 'ARCHIVED') {
      where.OR = [
        { pageKind: 'SYSTEM_HUB', visibility: 'VISIBLE' },
        { pageKind: 'GIFT_SUBTYPE' },
        { pageKind: 'THEMATIC', pageStatus: opts.status },
      ];
    }
    if (opts?.q?.trim()) {
      const q = opts.q.trim();
      where.AND = [
        {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { slug: { contains: q, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const rows = await this.prisma.client.catalogCategory.findMany({
      where,
      include: PAGE_INCLUDE,
      orderBy: [{ pageKind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });

    const dtos = rows.map((row) => this.toDto(row));
    if (!opts?.withCounts) return dtos;

    const now = new Date();
    await Promise.all(
      dtos.map(async (dto) => {
        if (dto.pageKind === 'SYSTEM_HUB' || dto.pageKind === 'THEMATIC') {
          dto.productsCount = await this.countMatching(dto, now);
        }
      }),
    );
    return dtos;
  }

  async getAdmin(id: string): Promise<CatalogPageDto> {
    const row = await this.prisma.client.catalogCategory.findUnique({
      where: { id },
      include: PAGE_INCLUDE,
    });
    if (!row) throw new NotFoundException('Страница не найдена');
    const dto = this.toDto(row);
    dto.productsCount = await this.countMatching(dto, new Date());
    return dto;
  }

  async createThematic(
    input: {
      name: string;
      slug?: string;
      h1?: string;
      rules?: Record<string, unknown>;
      seoTitle?: string | null;
      seoDescription?: string | null;
      body?: string | null;
      listingKind?: string | null;
      parentId?: string | null;
      pinnedProductIds?: string[];
      excludedProductIds?: string[];
    },
    actor: ActorContext,
  ): Promise<CatalogPageDto> {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Укажите название');
    const slug = normalizeSlug(input.slug ?? name);
    if (!slug) throw new BadRequestException('Не удалось сформировать URL');
    const rules = (input.rules ?? {}) as Prisma.InputJsonValue;

    const created = await this.prisma.client.$transaction(async (tx) => {
      const taken = await tx.catalogCategory.findUnique({ where: { slug } });
      if (taken) throw new ConflictException('Такой URL уже занят');
      const row = await tx.catalogCategory.create({
        data: {
          name,
          slug,
          h1: (input.h1 ?? name).trim(),
          pageKind: 'THEMATIC',
          pageStatus: 'DRAFT',
          rules,
          listingKind: input.listingKind ?? 'BOUQUETS',
          parentId: input.parentId ?? null,
          seoTitle: input.seoTitle?.trim() || null,
          seoDescription: input.seoDescription?.trim() || null,
          body: input.body?.trim() || null,
          pinnedProducts: {
            create: (input.pinnedProductIds ?? []).map((productId, index) => ({
              productId,
              sortOrder: index * 10,
            })),
          },
          excludedProducts: {
            create: (input.excludedProductIds ?? []).map((productId) => ({ productId })),
          },
        },
        include: PAGE_INCLUDE,
      });
      await this.audit.record(
        {
          actorAdminUserId: actor.actorId,
          action: 'SEO_UPDATED',
          entityType: 'CatalogPage',
          entityId: row.id,
          metadata: { created: true, slug },
          requestId: actor.requestId,
          ipHash: hashIp(actor.ip, this.appConfig.sessionHmacSecret),
          userAgent: actor.userAgent,
        },
        tx,
      );
      return row as PageRow;
    });
    await this.revalidate.ping({ tags: ['catalog', 'sitemap'] });
    return this.toDto(created);
  }

  async updateThematic(
    id: string,
    input: {
      expectedVersion: number;
      name?: string;
      slug?: string;
      h1?: string | null;
      rules?: Record<string, unknown>;
      seoTitle?: string | null;
      seoDescription?: string | null;
      body?: string | null;
      noIndex?: boolean;
      navVisible?: boolean;
      sortOrder?: number;
      pinnedProductIds?: string[];
      excludedProductIds?: string[];
    },
    actor: ActorContext,
  ): Promise<CatalogPageDto> {
    const existing = await this.prisma.client.catalogCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Страница не найдена');
    if (existing.isSystem || existing.pageKind === 'SYSTEM_HUB') {
      throw new BadRequestException('Системный раздел нельзя изменить таким образом');
    }
    if (existing.version !== input.expectedVersion) {
      throw new ConflictException('Страница изменена в другом окне');
    }

    const updated = await this.prisma.client.$transaction(async (tx) => {
      if (input.slug && input.slug !== existing.slug) {
        const slug = normalizeSlug(input.slug);
        const taken = await tx.catalogCategory.findFirst({
          where: { slug, NOT: { id } },
        });
        if (taken) throw new ConflictException('Такой URL уже занят');
      }
      if (input.pinnedProductIds || input.excludedProductIds) {
        await tx.catalogPageProduct.deleteMany({ where: { pageId: id } });
        await tx.catalogPageExclude.deleteMany({ where: { pageId: id } });
        const pins = input.pinnedProductIds ?? [];
        const excludes = input.excludedProductIds ?? [];
        if (pins.length) {
          await tx.catalogPageProduct.createMany({
            data: pins.map((productId, index) => ({
              pageId: id,
              productId,
              sortOrder: index * 10,
            })),
          });
        }
        if (excludes.length) {
          await tx.catalogPageExclude.createMany({
            data: excludes.map((productId) => ({ pageId: id, productId })),
          });
        }
      }
      const bumped = await tx.catalogCategory.updateMany({
        where: { id, version: input.expectedVersion },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.slug !== undefined ? { slug: normalizeSlug(input.slug) } : {}),
          ...(input.h1 !== undefined ? { h1: input.h1?.trim() || null } : {}),
          ...(input.rules !== undefined
            ? { rules: input.rules as Prisma.InputJsonValue }
            : {}),
          ...(input.seoTitle !== undefined ? { seoTitle: input.seoTitle?.trim() || null } : {}),
          ...(input.seoDescription !== undefined
            ? { seoDescription: input.seoDescription?.trim() || null }
            : {}),
          ...(input.body !== undefined ? { body: input.body?.trim() || null } : {}),
          ...(input.noIndex !== undefined ? { noIndex: input.noIndex } : {}),
          ...(input.navVisible !== undefined ? { navVisible: input.navVisible } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          version: { increment: 1 },
        },
      });
      if (bumped.count === 0) throw new ConflictException('Страница изменена в другом окне');
      await this.audit.record(
        {
          actorAdminUserId: actor.actorId,
          action: 'SEO_UPDATED',
          entityType: 'CatalogPage',
          entityId: id,
          metadata: { fields: Object.keys(input).filter((k) => k !== 'expectedVersion') },
          requestId: actor.requestId,
          ipHash: hashIp(actor.ip, this.appConfig.sessionHmacSecret),
          userAgent: actor.userAgent,
        },
        tx,
      );
      return tx.catalogCategory.findUniqueOrThrow({ where: { id }, include: PAGE_INCLUDE });
    });
    await this.revalidate.ping({ tags: ['catalog', 'sitemap'] });
    return this.toDto(updated);
  }

  async publish(id: string, expectedVersion: number, actor: ActorContext): Promise<CatalogPageDto> {
    const row = await this.prisma.client.catalogCategory.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Страница не найдена');
    if (row.pageKind !== 'THEMATIC') {
      throw new BadRequestException('Публиковать можно только тематические страницы');
    }
    if (row.version !== expectedVersion) {
      throw new ConflictException('Страница изменена в другом окне');
    }
    await this.prisma.client.catalogCategory.updateMany({
      where: { id, version: expectedVersion },
      data: {
        pageStatus: 'PUBLISHED',
        publishedAt: new Date(),
        visibility: 'VISIBLE',
        version: { increment: 1 },
      },
    });
    await this.audit.record({
      actorAdminUserId: actor.actorId,
      action: 'SEO_UPDATED',
      entityType: 'CatalogPage',
      entityId: id,
      metadata: { published: true },
      requestId: actor.requestId,
      ipHash: hashIp(actor.ip, this.appConfig.sessionHmacSecret),
      userAgent: actor.userAgent,
    });
    await this.revalidate.ping({ tags: ['catalog', 'sitemap'] });
    return this.getAdmin(id);
  }

  async unpublish(id: string, expectedVersion: number, actor: ActorContext): Promise<CatalogPageDto> {
    const row = await this.prisma.client.catalogCategory.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Страница не найдена');
    if (row.pageKind !== 'THEMATIC') {
      throw new BadRequestException('Снимать с публикации можно только тематические страницы');
    }
    if (row.version !== expectedVersion) {
      throw new ConflictException('Страница изменена в другом окне');
    }
    await this.prisma.client.catalogCategory.updateMany({
      where: { id, version: expectedVersion },
      data: {
        pageStatus: 'ARCHIVED',
        visibility: 'HIDDEN',
        navVisible: false,
        version: { increment: 1 },
      },
    });
    await this.audit.record({
      actorAdminUserId: actor.actorId,
      action: 'SEO_UPDATED',
      entityType: 'CatalogPage',
      entityId: id,
      metadata: { unpublished: true, slug: row.slug },
      requestId: actor.requestId,
      ipHash: hashIp(actor.ip, this.appConfig.sessionHmacSecret),
      userAgent: actor.userAgent,
    });
    await this.revalidate.ping({
      tags: ['catalog', 'sitemap'],
      paths: ['/', '/catalog/bouquets', categoryPublicHref(row.slug)],
    });
    return this.getAdmin(id);
  }

  async deleteImpact(id: string): Promise<CatalogPageDeleteImpactDto> {
    const dto = await this.getAdmin(id);
    const [childrenCount, navigationCount, assignedProductsCount] = await Promise.all([
      this.prisma.client.catalogCategory.count({ where: { parentId: id } }),
      this.prisma.client.navigationMenuItem.count({
        where: { targetType: 'CATEGORY', targetId: id },
      }),
      this.prisma.client.product.count({ where: { catalogCategoryId: id } }),
    ]);
    return evaluateCatalogPageDeleteImpact({
      pageKind: dto.pageKind,
      isSystem: dto.isSystem,
      status: dto.status,
      childrenCount,
      navigationCount,
      assignedProductsCount,
    });
  }

  async deletePage(
    id: string,
    expectedVersion: number,
    actor: ActorContext,
  ): Promise<{ deleted: true; id: string; slug: string }> {
    const existing = await this.prisma.client.catalogCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Страница не найдена');
    if (existing.version !== expectedVersion) {
      throw new ConflictException('Страница изменена в другом окне');
    }
    const impact = await this.deleteImpact(id);
    if (!impact.canDelete) {
      throw new BadRequestException({
        message: impact.blockers[0]?.message ?? 'Страницу нельзя удалить',
        error: 'CatalogDeleteBlocked',
        code: impact.blockers[0]?.code ?? 'IN_USE',
        blockers: impact.blockers,
      });
    }

    await this.prisma.client.$transaction(async (tx) => {
      if (existing.publishedAt) {
        await this.slugRedirects.record(tx, 'CATALOG_CATEGORY', existing.slug, 'bouquets');
      }
      const deleted = await tx.catalogCategory.deleteMany({
        where: { id, version: expectedVersion },
      });
      if (deleted.count === 0) throw new ConflictException('Страница изменена в другом окне');
      await this.audit.record(
        {
          actorAdminUserId: actor.actorId,
          action: 'SEO_UPDATED',
          entityType: 'CatalogPage',
          entityId: id,
          metadata: { deleted: true, slug: existing.slug },
          requestId: actor.requestId,
          ipHash: hashIp(actor.ip, this.appConfig.sessionHmacSecret),
          userAgent: actor.userAgent,
        },
        tx,
      );
    });
    await this.revalidate.ping({
      tags: ['catalog', 'sitemap'],
      paths: ['/', '/catalog/bouquets', categoryPublicHref(existing.slug)],
    });
    return { deleted: true, id, slug: existing.slug };
  }

  async listTraitDefinitions(): Promise<ProductTraitDefinitionDto[]> {
    const rows = await this.prisma.client.productTraitDefinition.findMany({
      where: { visibility: 'VISIBLE' },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      sortOrder: row.sortOrder,
    }));
  }

  /** Whether product matches page (same engine as public listing). */
  async productMatchesPage(pageId: string, productId: string): Promise<boolean> {
    const result = await this.diagnoseProductOnPage(pageId, productId);
    return result.matches;
  }

  /**
   * Admin: explain why a product does / does not appear on a catalog page.
   * Uses the same filters as public listing + step-wise human reasons.
   */
  async diagnoseProductOnPage(
    pageId: string,
    productId: string,
  ): Promise<CatalogPageProductMatchDto> {
    const page = await this.getAdmin(pageId);
    const product = await this.products.findById(productId);
    if (!product) throw new NotFoundException('Товар не найден');

    const reasons: CatalogPageMatchReasonDto[] = [];
    const listing = await this.listingForPage(page);
    const ruleDiagnostics = listing.match?.diagnostics ?? [];

    if (page.excludedProductIds.includes(productId)) {
      return {
        pageId: page.id,
        pageSlug: page.slug,
        productId,
        matches: false,
        publishedMatches: false,
        reasons: [
          {
            code: 'EXCLUDED',
            message: 'Товар вручную исключён из этой страницы',
          },
        ],
        ruleDiagnostics,
      };
    }

    if (page.pinnedProductIds.includes(productId)) {
      const published = isEffectivelyPublished(product);
      return {
        pageId: page.id,
        pageSlug: page.slug,
        productId,
        matches: true,
        publishedMatches: published,
        reasons: [
          {
            code: 'PINNED',
            message: published
              ? 'Товар закреплён на странице и попадает в выдачу'
              : 'Товар закреплён, но не опубликован — на витрине не виден',
          },
        ],
        ruleDiagnostics,
      };
    }

    if (listing.match?.blocking) {
      reasons.push({
        code: 'RULES_BLOCKING',
        message:
          'Правила страницы ссылаются на неизвестный или неоднозначный справочник — выдача закрыта',
        detail: ruleDiagnostics.map((d) => d.message).join('; ') || undefined,
      });
      return {
        pageId: page.id,
        pageSlug: page.slug,
        productId,
        matches: false,
        publishedMatches: false,
        reasons,
        ruleDiagnostics,
      };
    }

    const pageFilters = mergeListingIntoFilters(listing);
    if (
      Object.keys(pageFilters).length === 0 &&
      page.pageKind !== 'SYSTEM_HUB' &&
      page.pageKind !== 'GIFT_SUBTYPE'
    ) {
      reasons.push({
        code: 'NO_RULES',
        message: 'У страницы нет правил отбора товаров',
      });
    }

    const now = new Date();
    const { total: rawTotal } = await this.products.list({
      filters: { ...pageFilters, includeProductIds: [productId] },
      skip: 0,
      take: 1,
      sort: 'recommended',
      now,
    });
    const matches = rawTotal > 0;

    const { total: pubTotal } = await this.products.list({
      filters: {
        ...pageFilters,
        includeProductIds: [productId],
        publishedAt: now,
      },
      skip: 0,
      take: 1,
      sort: 'recommended',
      now,
    });
    const publishedMatches = pubTotal > 0;

    if (matches) {
      reasons.push({
        code: 'MATCHES',
        message: publishedMatches
          ? 'Товар соответствует правилам страницы и опубликован'
          : 'Товар соответствует правилам, но не опубликован — на витрине не виден',
      });
      if (!publishedMatches) {
        reasons.push({
          code: 'NOT_PUBLISHED',
          message: 'Опубликуйте товар, чтобы он появился в публичной выдаче',
        });
      }
      return {
        pageId: page.id,
        pageSlug: page.slug,
        productId,
        matches: true,
        publishedMatches,
        reasons,
        ruleDiagnostics,
      };
    }

    // Step-wise mismatch explanations (admin-facing).
    if (pageFilters.productKinds?.length) {
      if (!pageFilters.productKinds.includes(product.productKind)) {
        reasons.push({
          code: 'PRODUCT_KIND',
          message: `Тип товара «${product.productKind}» не подходит для этой страницы (нужно: ${pageFilters.productKinds.join(', ')})`,
          detail: `productKind=${product.productKind}`,
        });
      }
    }
    if (pageFilters.compositionKinds?.length) {
      if (!pageFilters.compositionKinds.includes(product.compositionKind)) {
        reasons.push({
          code: 'COMPOSITION_KIND',
          message: `Состав «${product.compositionKind}» не подходит (страница ждёт: ${pageFilters.compositionKinds.join(', ')})`,
          detail: `compositionKind=${product.compositionKind}`,
        });
      }
    }
    if (pageFilters.onlyFlowerTypeIds?.length || pageFilters.onlyFlowerTypeSlugs?.length) {
      reasons.push({
        code: 'ONLY_FLOWER_TYPE',
        message:
          'Страница требует монобукет только из указанного вида (PRIMARY). Зелень допускается, другие основные виды — нет',
      });
    } else if (pageFilters.flowerTypeIds?.length || pageFilters.flowerTypeSlugs?.length) {
      reasons.push({
        code: 'FLOWER_TYPE',
        message: 'В составе нет нужного вида цветка (по справочнику FlowerType)',
      });
    }
    if (pageFilters.flowerFormIds?.length || pageFilters.flowerFormSlugs?.length) {
      reasons.push({
        code: 'FLOWER_FORM',
        message: 'Нет нужной формы цветка (например кустовая) в справочнике FlowerForm',
      });
    }
    if (pageFilters.traitKeys?.length) {
      reasons.push({
        code: 'TRAIT',
        message: `Нужен признак: ${pageFilters.traitKeys.join(', ')}`,
      });
    }
    if (reasons.length === 0) {
      reasons.push({
        code: 'UNKNOWN',
        message: 'Товар не проходит фильтры страницы (проверьте состав, цену и признаки)',
      });
    }

    return {
      pageId: page.id,
      pageSlug: page.slug,
      productId,
      matches: false,
      publishedMatches: false,
      reasons,
      ruleDiagnostics,
    };
  }

  /** Live preview for unsaved constructor rules (same engine as public PLP). */
  async previewRules(
    input: {
      rules?: Record<string, unknown>;
      pinnedProductIds?: string[];
      excludedProductIds?: string[];
    },
    query: { page?: number; pageSize?: number },
  ): Promise<PaginatedResponse<ProductListItemDto> & { diagnostics: unknown[]; blocking: boolean }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 24;
    const now = new Date();
    const match = await this.catalogMatch.previewRulesFilters(input.rules ?? {}, {
      pinnedProductIds: input.pinnedProductIds,
      excludedProductIds: input.excludedProductIds,
    });
    const pinned = [...new Set(input.pinnedProductIds ?? [])];
    const { items, total } = await this.products.list({
      filters: {
        ...match.filters,
        publishedAt: now,
        excludeProductIds: match.excludeProductIds.length
          ? match.excludeProductIds
          : undefined,
      },
      skip: Math.max(0, (page - 1) * pageSize),
      take: pageSize,
      sort: 'recommended',
      now,
    });

    let pinnedItems: ProductListItemDto[] = [];
    if (pinned.length > 0) {
      const rows = await this.products.findManyByIds(pinned);
      const byId = new Map(rows.map((row) => [row.id, row]));
      pinnedItems = pinned
        .map((id) => byId.get(id))
        .filter((row): row is NonNullable<typeof row> => Boolean(row) && isEffectivelyPublished(row!, now))
        .map((row) => toProductListItemDto(row!, this.urlFor, now));
    }

    const pinnedIds = new Set(pinnedItems.map((i) => i.id));
    const rest = items
      .filter((row) => !pinnedIds.has(row.id))
      .map((row) => toProductListItemDto(row, this.urlFor, now));
    const merged = [...pinnedItems, ...rest].slice(0, pageSize);

    return {
      items: merged,
      total: total + pinnedItems.length,
      page,
      pageSize,
      diagnostics: match.diagnostics,
      blocking: match.blocking,
    };
  }

  private async countMatching(page: CatalogPageDto, now: Date): Promise<number> {
    const listing = await this.listingForPage(page);
    const pageFilters = mergeListingIntoFilters(listing);
    const { total } = await this.products.list({
      filters: {
        ...pageFilters,
        publishedAt: now,
        excludeProductIds: page.excludedProductIds.length
          ? page.excludedProductIds
          : undefined,
      },
      skip: 0,
      take: 1,
      sort: 'recommended',
      now,
    });
    return total;
  }

  /** Same resolve path as PublicCatalogService / admin product list. */
  private async listingForPage(page: CatalogPageDto) {
    return resolveCategoryListingFilters({
      category: {
        id: page.id,
        slug: page.slug,
        parentId: page.parentId,
        listingKind: page.listingKind,
        pageKind: page.pageKind,
        rules: page.rules,
      },
      catalogMatch: this.catalogMatch,
      expandCategoryIds: (id, opts) => this.categories.expandCategoryIds(id, opts),
      loadExcludeProductIds: async () => page.excludedProductIds,
    });
  }

  private async filtersForPage(page: CatalogPageDto) {
    return mergeListingIntoFilters(await this.listingForPage(page));
  }

  private toDto(row: PageRow): CatalogPageDto {
    const pageKind: CatalogPageKind = isCatalogPageKind(row.pageKind) ? row.pageKind : 'LEGACY';
    const listingKind =
      row.listingKind && isCatalogListingKind(row.listingKind)
        ? (row.listingKind as CatalogListingKind)
        : null;
    const rules =
      row.rules && typeof row.rules === 'object' && !Array.isArray(row.rules)
        ? (row.rules as Record<string, unknown>)
        : {};
    const status: SeoLandingStatus | 'LIVE' =
      pageKind === 'SYSTEM_HUB'
        ? 'LIVE'
        : ((row.pageStatus as SeoLandingStatus | null) ?? 'DRAFT');
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      h1: row.h1,
      pageKind,
      isSystem: row.isSystem,
      listingKind,
      parentId: row.parentId,
      rules,
      status,
      visibility: row.visibility,
      noIndex: row.noIndex,
      navVisible: row.navVisible,
      sortOrder: row.sortOrder,
      version: row.version,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      body: row.body,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      publicPath: categoryPublicHref(row.slug),
      pinnedProductIds: [...row.pinnedProducts]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((p) => p.productId),
      excludedProductIds: row.excludedProducts.map((p) => p.productId),
      rulesSummary:
        pageKind === 'SYSTEM_HUB'
          ? `Основной раздел · ${row.name}`
          : describeSeoLandingRules(rules as Prisma.JsonValue),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

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
  type ProductTraitDefinitionDto,
  type SeoLandingStatus,
} from '@bouquet-one/contracts';
import type { Prisma } from '@bouquet-one/database';
import { AuditService } from '../audit/audit.service';
import { hashIp } from '../auth/crypto.util';
import type { ActorContext } from '../common/actor.util';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../database/prisma.service';
import { StorefrontRevalidateService } from '../storefront/storefront-revalidate.service';
import { describeSeoLandingRules } from './placement-match.util';
import { ProductsRepository } from './products.repository';
import { rulesToFilters } from './seo-landings.service';
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
  ) {}

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
      paths: ['/', '/bukety', categoryPublicHref(row.slug)],
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
        await this.slugRedirects.record(tx, 'CATALOG_CATEGORY', existing.slug, 'bukety');
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
      paths: ['/', '/bukety', categoryPublicHref(existing.slug)],
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
    const page = await this.getAdmin(pageId);
    if (page.excludedProductIds.includes(productId)) return false;
    if (page.pinnedProductIds.includes(productId)) return true;
    const { total } = await this.products.list({
      filters: {
        ...this.filtersForPage(page),
        includeProductIds: [productId],
      },
      skip: 0,
      take: 1,
      sort: 'recommended',
      now: new Date(),
    });
    return total > 0;
  }

  private async countMatching(page: CatalogPageDto, now: Date): Promise<number> {
    const { total } = await this.products.list({
      filters: {
        ...this.filtersForPage(page),
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

  private filtersForPage(page: CatalogPageDto) {
    if (page.pageKind === 'SYSTEM_HUB') {
      const kinds =
        page.listingKind === 'BOUQUETS'
          ? (['BOUQUET'] as const)
          : page.listingKind === 'COMPOSITIONS'
            ? (['COMPOSITION'] as const)
            : page.listingKind === 'FLOWERS'
              ? (['STEM'] as const)
              : page.listingKind === 'GIFTS'
                ? (['GIFT'] as const)
                : undefined;
      return { productKinds: kinds ? [...kinds] : undefined };
    }
    return rulesToFilters(page.rules as Prisma.JsonValue);
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

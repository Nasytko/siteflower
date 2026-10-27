import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  catalogSourceDefaultViewAllHref,
  defaultHomepageConfig,
  defaultHomepageDiscoveryTiles,
  defaultHomepageHeroSlides,
  defaultHomepagePerks,
  HOMEPAGE_SECTION_KINDS,
  inferCatalogSourceFromSlug,
  inferLinkDestinationFromHref,
  normalizeCatalogSource,
  normalizeLinkDestination,
  resolveCatalogSourceSlug,
  resolveLinkDestinationHref,
  type HomepageConfigAdminDto,
  type HomepageConfigDto,
  type HomepageDiscoveryTileDto,
  type HomepageHeroSlideDto,
  type HomepagePerkDto,
  type HomepageSectionDto,
  type HomepageSectionKind,
  type UpdateHomepageConfigDto,
  validateCustomHref,
} from '@bouquet-one/contracts';
import type { Prisma } from '@bouquet-one/database';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { hashIp } from '../auth/crypto.util';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../database/prisma.service';
import type { ActorContext } from '../common/actor.util';
import { StorefrontRevalidateService } from './storefront-revalidate.service';

const SINGLETON_ID = 1;
const OCC_CONFLICT_MESSAGE =
  'Данные изменены другим пользователем. Обновите страницу и сохраните снова.';

type HomepageConfigRow = Prisma.HomepageConfigGetPayload<object>;

const linkDestinationSchema = z
  .object({
    kind: z.enum(['system', 'catalog_page', 'category', 'product', 'custom']),
    ref: z.string().trim().max(80).nullable().optional(),
    href: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .nullable()
  .optional();

const catalogSourceSchema = z
  .object({
    kind: z.enum(['auto', 'promotions', 'catalog_page', 'bestseller_group']),
    id: z.string().trim().max(80).nullable().optional(),
    slug: z.string().trim().max(160).nullable().optional(),
  })
  .strict()
  .nullable()
  .optional();

const heroSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    // Allow empty: slides often have optional subtitle; primary hero mirrors them.
    subtitle: z.string().trim().max(500).default(''),
    imageUrl: z.string().trim().min(1).max(500).nullable(),
    ctaLabel: z.string().trim().min(1).max(80),
    ctaHref: z.string().trim().min(1).max(500),
  })
  .strict();

const heroSlideSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(200),
    subtitle: z.string().trim().max(500).default(''),
    imageUrl: z.string().trim().min(1).max(500).nullable(),
    mobileImageUrl: z.string().trim().min(1).max(500).nullable().optional(),
    ctaLabel: z.string().trim().min(1).max(80),
    ctaHref: z.string().trim().min(1).max(500),
    ctaDestination: linkDestinationSchema,
    enabled: z.boolean(),
    sortOrder: z.number().int().min(0).max(10_000),
    startsAt: z.string().trim().max(40).nullable().optional(),
    endsAt: z.string().trim().max(40).nullable().optional(),
  })
  .strict();

const sectionSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    kind: z.enum(HOMEPAGE_SECTION_KINDS),
    enabled: z.boolean(),
    heading: z.string().trim().min(1).max(200),
    sortOrder: z.number().int().min(0).max(10_000),
    body: z.string().trim().max(500).nullable().optional(),
    viewAllHref: z.string().trim().max(500).nullable().optional(),
    viewAllDestination: linkDestinationSchema,
    viewAllMode: z.enum(['auto', 'destination']).nullable().optional(),
    limit: z.number().int().min(1).max(48).nullable().optional(),
    sourceSlug: z.string().trim().max(160).nullable().optional(),
    productSource: catalogSourceSchema,
    theme: z.enum(['default', 'autumn']).nullable().optional(),
    imageUrl: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

const discoveryTileSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(120),
    href: z.string().trim().min(1).max(500),
    destination: linkDestinationSchema,
    imageUrl: z.string().trim().max(500).default(''),
    imageAlt: z.string().trim().min(1).max(200),
    enabled: z.boolean(),
    sortOrder: z.number().int().min(0).max(10_000),
  })
  .strict()
  .superRefine((tile, ctx) => {
    if (tile.enabled && !tile.imageUrl.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'У включённой плитки должно быть изображение',
        path: ['imageUrl'],
      });
    }
  });

const perkSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(200),
    enabled: z.boolean(),
    sortOrder: z.number().int().min(0).max(10_000),
  })
  .strict();

const homepageConfigSchema = z
  .object({
    hero: heroSchema,
    heroSlides: z.array(heroSlideSchema).max(12),
    sections: z.array(sectionSchema).max(40),
    discoveryTiles: z.array(discoveryTileSchema).max(24),
    perks: z.array(perkSchema).max(12),
  })
  .strict();

/**
 * Catalog simplification retired the rule-based collections and the `featured`
 * flag, so stored configs may still name sections that no longer exist.
 */
const LEGACY_SECTION_KINDS: Record<string, HomepageSectionKind> = {
  featured: 'bestsellers',
  collection: 'promotions',
  collections: 'promotions',
};

export type MigrateHomepageMode = 'read' | 'write';

/**
 * Normalize legacy homepage JSON.
 * - `read`: fill missing defaults so the admin UI / storefront never crash.
 * - `write`: do NOT re-inflate deleted slides or force-add sections the admin removed.
 */
export function migrateLegacyHomepageConfig(
  value: unknown,
  mode: MigrateHomepageMode = 'read',
): unknown {
  if (!value || typeof value !== 'object') return value;
  const raw = value as {
    sections?: unknown;
    discoveryTiles?: unknown;
    hero?: unknown;
    heroSlides?: unknown;
    perks?: unknown;
  };
  const base = { ...(value as Record<string, unknown>) };

  if (Array.isArray(raw.sections)) {
    const migratedKinds = new Set<HomepageSectionKind>();
    const ids = new Set<string>();
    const sections: Array<Record<string, unknown>> = [];

    for (const entry of raw.sections) {
      if (!entry || typeof entry !== 'object') continue;
      const rest = { ...(entry as Record<string, unknown>) };
      delete rest.collectionSlug;
      const originalKind = typeof rest.kind === 'string' ? rest.kind : '';
      const replacement = LEGACY_SECTION_KINDS[originalKind];
      if (replacement) {
        if (migratedKinds.has(replacement)) continue;
        migratedKinds.add(replacement);
        rest.kind = replacement;
        rest.id = replacement;
      }
      const id = typeof rest.id === 'string' ? rest.id : '';
      if (!id || ids.has(id)) continue;
      ids.add(id);
      sections.push(rest);
      if (typeof rest.kind === 'string') {
        migratedKinds.add(rest.kind as HomepageSectionKind);
      }
    }

    // Do NOT force-add autumn/popular/roses/gifts on read — that resurrected
    // blocks the admin intentionally deleted. Missing `sections` key is handled below.
    base.sections = sections;
  } else if (mode === 'read') {
    base.sections = defaultHomepageConfig().sections;
  } else {
    base.sections = [];
  }

  if (!Array.isArray(raw.discoveryTiles)) {
    base.discoveryTiles = defaultHomepageDiscoveryTiles();
  }

  if (!Array.isArray(raw.perks)) {
    base.perks = defaultHomepagePerks();
  }

  // Synthesize slides only when the key is missing (pre-multi-slide legacy).
  // An explicit empty array means the admin cleared the hero — keep it empty.
  if (mode === 'read' && !Array.isArray(raw.heroSlides)) {
    const hero =
      raw.hero && typeof raw.hero === 'object'
        ? (raw.hero as Record<string, unknown>)
        : null;
    if (hero && typeof hero.title === 'string') {
      base.heroSlides = [
        {
          id: 'main',
          title: hero.title,
          subtitle: typeof hero.subtitle === 'string' ? hero.subtitle : '',
          imageUrl: typeof hero.imageUrl === 'string' ? hero.imageUrl : null,
          mobileImageUrl: null,
          ctaLabel: typeof hero.ctaLabel === 'string' ? hero.ctaLabel : 'Смотреть',
          ctaHref: typeof hero.ctaHref === 'string' ? hero.ctaHref : '/catalog/bouquets',
          enabled: true,
          sortOrder: 10,
          startsAt: null,
          endsAt: null,
        },
      ];
    } else {
      base.heroSlides = defaultHomepageHeroSlides();
    }
  } else if (!Array.isArray(raw.heroSlides)) {
    base.heroSlides = [];
  }

  const slides = (base.heroSlides as Array<Record<string, unknown>>) ?? [];
  const firstEnabled =
    slides.find((s) => s.enabled !== false) ?? slides[0] ?? null;
  if (firstEnabled) {
    base.hero = {
      title: firstEnabled.title,
      subtitle: firstEnabled.subtitle ?? '',
      imageUrl: firstEnabled.imageUrl ?? null,
      ctaLabel: firstEnabled.ctaLabel,
      ctaHref: firstEnabled.ctaHref,
    };
  } else if (mode === 'write' && (!base.hero || typeof base.hero !== 'object')) {
    base.hero = {
      title: 'Букеты',
      subtitle: ' ',
      imageUrl: null,
      ctaLabel: 'Смотреть',
      ctaHref: '/catalog/bouquets',
    };
  }

  return base;
}

function assertCustomHref(href: string, label: string): void {
  const check = validateCustomHref(href);
  if (!check.ok) {
    throw new BadRequestException(`${label}: ${check.message}`);
  }
}

export type HomepageResolveContext = {
  catalogSlugById?: ReadonlyMap<string, string> | Record<string, string>;
  productSlugById?: ReadonlyMap<string, string> | Record<string, string>;
};

/** Constrained homepage JSON — known fields only, no HTML blobs. */
export function parseHomepageConfig(
  value: unknown,
  mode: MigrateHomepageMode = 'read',
  resolveCtx?: HomepageResolveContext,
): HomepageConfigDto {
  const result = homepageConfigSchema.safeParse(migrateLegacyHomepageConfig(value, mode));
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues.map(
        (issue) =>
          `config${issue.path.length ? `.${issue.path.join('.')}` : ''}: ${issue.message}`,
      ),
    );
  }

  const ids = result.data.sections.map((section) => section.id);
  if (new Set(ids).size !== ids.length) {
    throw new BadRequestException('sections[].id must be unique');
  }

  const tileIds = result.data.discoveryTiles.map((tile) => tile.id);
  if (new Set(tileIds).size !== tileIds.length) {
    throw new BadRequestException('discoveryTiles[].id must be unique');
  }

  const slideIds = result.data.heroSlides.map((slide) => slide.id);
  if (new Set(slideIds).size !== slideIds.length) {
    throw new BadRequestException('heroSlides[].id must be unique');
  }

  const perkIds = result.data.perks.map((perk) => perk.id);
  if (new Set(perkIds).size !== perkIds.length) {
    throw new BadRequestException('perks[].id must be unique');
  }

  // Empty heroSlides is allowed: storefront hides the hero. Write-mode migrate
  // must not re-inflate slides (that previously undid admin deletes → 500/conflict).

  const sections: HomepageSectionDto[] = result.data.sections.map((section) => {
    const productSource =
      normalizeCatalogSource(section.productSource, section.sourceSlug, section.kind) ??
      inferCatalogSourceFromSlug(section.sourceSlug, section.kind);
    const sourceSlug = resolveCatalogSourceSlug(productSource, section.sourceSlug, {
      slugById: resolveCtx?.catalogSlugById,
    });
    const productSourceResolved = {
      ...productSource,
      slug: sourceSlug,
    };

    const viewAllMode = section.viewAllMode ?? (section.viewAllHref ? 'destination' : 'auto');
    let viewAllDestination = normalizeLinkDestination(
      section.viewAllDestination,
      section.viewAllHref,
    );
    let viewAllHref = section.viewAllHref ?? null;

    if (viewAllMode === 'auto') {
      viewAllHref = catalogSourceDefaultViewAllHref(productSourceResolved, sourceSlug);
      viewAllDestination = viewAllHref ? inferLinkDestinationFromHref(viewAllHref) : null;
    } else if (viewAllDestination) {
      viewAllHref = resolveLinkDestinationHref(viewAllDestination, viewAllHref, resolveCtx);
      viewAllDestination = { ...viewAllDestination, href: viewAllHref };
      if (viewAllDestination.kind === 'custom' && viewAllHref) {
        assertCustomHref(viewAllHref, `sections.${section.id}.viewAllHref`);
      }
    } else if (viewAllHref) {
      viewAllDestination = inferLinkDestinationFromHref(viewAllHref);
      if (viewAllHref.startsWith('http')) {
        assertCustomHref(viewAllHref, `sections.${section.id}.viewAllHref`);
      }
    }

    return {
      id: section.id,
      kind: section.kind,
      enabled: section.enabled,
      heading: section.heading,
      sortOrder: section.sortOrder,
      body: section.body ?? null,
      viewAllHref,
      viewAllDestination,
      viewAllMode,
      limit: section.limit ?? null,
      sourceSlug,
      productSource: productSourceResolved,
      theme: section.theme ?? null,
      imageUrl: section.imageUrl?.trim() ? section.imageUrl.trim() : null,
    };
  });

  const discoveryTiles: HomepageDiscoveryTileDto[] = result.data.discoveryTiles.map((tile) => {
    const destination =
      normalizeLinkDestination(tile.destination, tile.href) ??
      inferLinkDestinationFromHref(tile.href);
    const href = resolveLinkDestinationHref(destination, tile.href, resolveCtx);
    if (destination.kind === 'custom') {
      assertCustomHref(href, `discoveryTiles.${tile.id}.href`);
    }
    return {
      id: tile.id,
      label: tile.label,
      href,
      destination: { ...destination, href },
      imageUrl: tile.imageUrl.trim(),
      imageAlt: tile.imageAlt,
      enabled: tile.enabled,
      sortOrder: tile.sortOrder,
    };
  });

  const heroSlides: HomepageHeroSlideDto[] = result.data.heroSlides.map((slide) => {
    const ctaDestination =
      normalizeLinkDestination(slide.ctaDestination, slide.ctaHref) ??
      inferLinkDestinationFromHref(slide.ctaHref);
    const ctaHref = resolveLinkDestinationHref(ctaDestination, slide.ctaHref, resolveCtx);
    if (ctaDestination.kind === 'custom') {
      assertCustomHref(ctaHref, `heroSlides.${slide.id}.ctaHref`);
    }
    return {
      id: slide.id,
      title: slide.title,
      subtitle: slide.subtitle,
      imageUrl: slide.imageUrl,
      mobileImageUrl: slide.mobileImageUrl ?? null,
      ctaLabel: slide.ctaLabel,
      ctaHref,
      ctaDestination: { ...ctaDestination, href: ctaHref },
      enabled: slide.enabled,
      sortOrder: slide.sortOrder,
      startsAt: slide.startsAt ?? null,
      endsAt: slide.endsAt ?? null,
    };
  });

  const perks: HomepagePerkDto[] = result.data.perks.map((perk) => ({
    id: perk.id,
    title: perk.title,
    enabled: perk.enabled,
    sortOrder: perk.sortOrder,
  }));

  const sortedSlides = [...heroSlides].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
  );
  const primary = sortedSlides.find((s) => s.enabled) ?? sortedSlides[0];

  const heroSubtitle = (primary?.subtitle ?? result.data.hero.subtitle ?? '').trim();

  return {
    hero: primary
      ? {
          title: primary.title,
          // Nest DTO still requires MinLength(1) on hero.subtitle — keep a space if empty.
          subtitle: heroSubtitle.length > 0 ? heroSubtitle : ' ',
          imageUrl: primary.imageUrl,
          ctaLabel: primary.ctaLabel,
          ctaHref: primary.ctaHref,
        }
      : {
          ...result.data.hero,
          subtitle:
            result.data.hero.subtitle.trim().length > 0
              ? result.data.hero.subtitle.trim()
              : ' ',
        },
    heroSlides: sortedSlides,
    sections: [...sections].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
    discoveryTiles: [...discoveryTiles].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
    ),
    perks: [...perks].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
  };
}

@Injectable()
export class HomepageConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly appConfig: AppConfigService,
    private readonly revalidate: StorefrontRevalidateService,
  ) {}

  async getPublic(): Promise<HomepageConfigDto> {
    const row = await this.getOrCreate();
    return this.configFromRow(row);
  }

  async getAdmin(): Promise<HomepageConfigAdminDto> {
    const row = await this.getOrCreate();
    const config = await this.configFromRow(row);
    return {
      ...config,
      version: row.version,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async update(
    input: UpdateHomepageConfigDto,
    actor: ActorContext,
  ): Promise<HomepageConfigAdminDto> {
    await this.getOrCreate();
    const incoming = {
      hero: input.hero,
      heroSlides: input.heroSlides,
      sections: input.sections,
      discoveryTiles: input.discoveryTiles,
      perks: input.perks,
    };
    const resolveCtx = await this.loadResolveContext(incoming);
    let config: HomepageConfigDto;
    try {
      config = parseHomepageConfig(incoming, 'write', resolveCtx);
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Некорректная конфигурация главной',
      );
    }

    try {
      await this.prisma.client.$transaction(async (tx) => {
        const result = await tx.homepageConfig.updateMany({
          where: { id: SINGLETON_ID, version: input.expectedVersion },
          data: {
            config: config as Prisma.InputJsonValue,
            version: { increment: 1 },
          },
        });
        if (result.count === 0) {
          throw new ConflictException(OCC_CONFLICT_MESSAGE);
        }

        await this.audit.record(
          {
            actorAdminUserId: actor.actorId,
            action: 'HOMEPAGE_CONFIG_UPDATED',
            entityType: 'HomepageConfig',
            entityId: String(SINGLETON_ID),
            metadata: {
              sectionCount: config.sections.length,
              slideCount: config.heroSlides.length,
              discoveryTileCount: config.discoveryTiles.length,
              perkCount: config.perks.length,
            },
            requestId: actor.requestId,
            ipHash: hashIp(actor.ip, this.appConfig.sessionHmacSecret),
            userAgent: actor.userAgent,
          },
          tx,
        );
      });
    } catch (err) {
      if (err instanceof ConflictException || err instanceof BadRequestException) throw err;
      throw err;
    }

    const dto = await this.getAdmin();
    await this.revalidate.ping({ tags: ['storefront', 'homepage'], paths: ['/'] });
    return dto;
  }

  private async getOrCreate(): Promise<HomepageConfigRow> {
    const existing = await this.prisma.client.homepageConfig.findUnique({
      where: { id: SINGLETON_ID },
    });
    if (existing) {
      return existing;
    }

    const defaults = defaultHomepageConfig();
    try {
      return await this.prisma.client.homepageConfig.create({
        data: {
          id: SINGLETON_ID,
          config: defaults as Prisma.InputJsonValue,
        },
      });
    } catch {
      const raced = await this.prisma.client.homepageConfig.findUnique({
        where: { id: SINGLETON_ID },
      });
      if (raced) {
        return raced;
      }
      throw new ConflictException('Unable to initialize homepage config');
    }
  }

  private async configFromRow(row: HomepageConfigRow): Promise<HomepageConfigDto> {
    try {
      // Resolve kind+id → current slug on every read so storefront links stay fresh
      // after catalog slug renames without requiring a homepage re-save.
      const resolveCtx = await this.loadResolveContext(row.config);
      return parseHomepageConfig(row.config, 'read', resolveCtx);
    } catch {
      return defaultHomepageConfig();
    }
  }

  /** Collect product destination refs so we only query those rows. */
  private collectProductIds(config: unknown): string[] {
    if (!config || typeof config !== 'object') return [];
    const raw = config as {
      heroSlides?: Array<{ ctaDestination?: { kind?: string; ref?: string | null } }>;
      discoveryTiles?: Array<{ destination?: { kind?: string; ref?: string | null } }>;
      sections?: Array<{ viewAllDestination?: { kind?: string; ref?: string | null } }>;
    };
    const ids = new Set<string>();
    const take = (dest: { kind?: string; ref?: string | null } | undefined) => {
      if (dest?.kind === 'product' && dest.ref?.trim()) ids.add(dest.ref.trim());
    };
    for (const slide of raw.heroSlides ?? []) take(slide.ctaDestination);
    for (const tile of raw.discoveryTiles ?? []) take(tile.destination);
    for (const section of raw.sections ?? []) take(section.viewAllDestination);
    return [...ids];
  }

  /**
   * Resolve stable destination/source ids → current public slugs.
   * Used on both save and read (public + admin).
   */
  private async loadResolveContext(config?: unknown): Promise<HomepageResolveContext> {
    // Catalog pages are CatalogCategory rows (pageKind); categories share the same table.
    const productIds = this.collectProductIds(config);
    const [categories, groups, products] = await Promise.all([
      this.prisma.client.catalogCategory.findMany({ select: { id: true, slug: true } }),
      this.prisma.client.bestsellerGroup.findMany({ select: { id: true, slug: true } }),
      productIds.length > 0
        ? this.prisma.client.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, slug: true },
          })
        : Promise.resolve([] as Array<{ id: string; slug: string }>),
    ]);
    const catalogSlugById: Record<string, string> = {};
    for (const row of [...categories, ...groups]) {
      catalogSlugById[row.id] = row.slug;
    }
    const productSlugById: Record<string, string> = {};
    for (const row of products) {
      productSlugById[row.id] = row.slug;
    }
    return { catalogSlugById, productSlugById };
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  defaultHomepageConfig,
  defaultHomepageDiscoveryTiles,
  defaultHomepageHeroSlides,
  defaultHomepagePerks,
  HOMEPAGE_SECTION_KINDS,
  type HomepageConfigAdminDto,
  type HomepageConfigDto,
  type HomepageDiscoveryTileDto,
  type HomepageHeroSlideDto,
  type HomepagePerkDto,
  type HomepageSectionDto,
  type HomepageSectionKind,
  type UpdateHomepageConfigDto,
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

const heroSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    subtitle: z.string().trim().min(1).max(500),
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
    limit: z.number().int().min(1).max(48).nullable().optional(),
    sourceSlug: z.string().trim().max(160).nullable().optional(),
    theme: z.enum(['default', 'autumn']).nullable().optional(),
    imageUrl: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

const discoveryTileSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(120),
    href: z.string().trim().min(1).max(500),
    imageUrl: z.string().trim().min(1).max(500),
    imageAlt: z.string().trim().min(1).max(200),
    enabled: z.boolean(),
    sortOrder: z.number().int().min(0).max(10_000),
  })
  .strict();

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

export function migrateLegacyHomepageConfig(value: unknown): unknown {
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

    const ensureSection = (
      kind: HomepageSectionKind,
      defaults: Record<string, unknown>,
    ) => {
      if (migratedKinds.has(kind) || ids.has(kind)) return;
      sections.push({ id: kind, kind, enabled: true, ...defaults });
      migratedKinds.add(kind);
      ids.add(kind);
    };

    ensureSection('autumn', {
      heading: 'Вдохновение осени',
      body: 'Тёплые букеты сезона',
      sortOrder: 20,
      viewAllHref: '/katalog/bukety-s-rozami',
      sourceSlug: 'bukety-s-rozami',
      limit: 5,
      theme: 'autumn',
    });
    ensureSection('popular', {
      heading: 'Популярные букеты',
      sortOrder: 30,
      viewAllHref: '/bukety',
      limit: 10,
    });
    ensureSection('roses', {
      heading: 'Розы',
      sortOrder: 40,
      viewAllHref: '/katalog/rozy',
      sourceSlug: 'rozy',
      limit: 5,
    });

    if (!migratedKinds.has('gifts') && !ids.has('gifts')) {
      sections.push({
        id: 'gifts',
        kind: 'gifts',
        enabled: false,
        heading: 'Подарки',
        sortOrder: 91,
      });
    }

    base.sections = sections;
  }

  if (!Array.isArray(raw.discoveryTiles)) {
    base.discoveryTiles = defaultHomepageDiscoveryTiles();
  }

  if (!Array.isArray(raw.perks)) {
    base.perks = defaultHomepagePerks();
  }

  if (!Array.isArray(raw.heroSlides) || raw.heroSlides.length === 0) {
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
          ctaHref: typeof hero.ctaHref === 'string' ? hero.ctaHref : '/bukety',
          enabled: true,
          sortOrder: 10,
          startsAt: null,
          endsAt: null,
        },
      ];
    } else {
      base.heroSlides = defaultHomepageHeroSlides();
    }
  }

  const slides = base.heroSlides as Array<Record<string, unknown>>;
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
  }

  return base;
}

/** Constrained homepage JSON — known fields only, no HTML blobs. */
export function parseHomepageConfig(value: unknown): HomepageConfigDto {
  const result = homepageConfigSchema.safeParse(migrateLegacyHomepageConfig(value));
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

  const sections: HomepageSectionDto[] = result.data.sections.map((section) => ({
    id: section.id,
    kind: section.kind,
    enabled: section.enabled,
    heading: section.heading,
    sortOrder: section.sortOrder,
    body: section.body ?? null,
    viewAllHref: section.viewAllHref ?? null,
    limit: section.limit ?? null,
    sourceSlug: section.sourceSlug ?? null,
    theme: section.theme ?? null,
    imageUrl: section.imageUrl ?? null,
  }));

  const discoveryTiles: HomepageDiscoveryTileDto[] = result.data.discoveryTiles.map(
    (tile) => ({
      id: tile.id,
      label: tile.label,
      href: tile.href,
      imageUrl: tile.imageUrl,
      imageAlt: tile.imageAlt,
      enabled: tile.enabled,
      sortOrder: tile.sortOrder,
    }),
  );

  const heroSlides: HomepageHeroSlideDto[] = result.data.heroSlides.map((slide) => ({
    id: slide.id,
    title: slide.title,
    subtitle: slide.subtitle,
    imageUrl: slide.imageUrl,
    mobileImageUrl: slide.mobileImageUrl ?? null,
    ctaLabel: slide.ctaLabel,
    ctaHref: slide.ctaHref,
    enabled: slide.enabled,
    sortOrder: slide.sortOrder,
    startsAt: slide.startsAt ?? null,
    endsAt: slide.endsAt ?? null,
  }));

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

  return {
    hero: primary
      ? {
          title: primary.title,
          subtitle: primary.subtitle,
          imageUrl: primary.imageUrl,
          ctaLabel: primary.ctaLabel,
          ctaHref: primary.ctaHref,
        }
      : result.data.hero,
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
    return {
      ...this.configFromRow(row),
      version: row.version,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async update(
    input: UpdateHomepageConfigDto,
    actor: ActorContext,
  ): Promise<HomepageConfigAdminDto> {
    await this.getOrCreate();
    const config = parseHomepageConfig({
      hero: input.hero,
      heroSlides: input.heroSlides,
      sections: input.sections,
      discoveryTiles: input.discoveryTiles,
      perks: input.perks,
    });

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

    return this.getAdmin().then(async (dto) => {
      await this.revalidate.ping({ tags: ['storefront', 'homepage'], paths: ['/'] });
      return dto;
    });
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

  private configFromRow(row: HomepageConfigRow): HomepageConfigDto {
    try {
      return parseHomepageConfig(row.config);
    } catch {
      return defaultHomepageConfig();
    }
  }
}

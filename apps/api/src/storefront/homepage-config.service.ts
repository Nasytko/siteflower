import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  defaultHomepageConfig,
  HOMEPAGE_SECTION_KINDS,
  type HomepageConfigAdminDto,
  type HomepageConfigDto,
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

const sectionSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    kind: z.enum(HOMEPAGE_SECTION_KINDS),
    enabled: z.boolean(),
    heading: z.string().trim().min(1).max(200),
    sortOrder: z.number().int().min(0).max(10_000),
  })
  .strict();

const homepageConfigSchema = z
  .object({
    hero: heroSchema,
    sections: z.array(sectionSchema).max(40),
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
  const raw = value as { sections?: unknown };
  if (!Array.isArray(raw.sections)) return value;

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
      // Several collection sections collapse into a single promotions section.
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

  // Ensure gifts shelf exists for configs created before catalog simplification.
  if (!migratedKinds.has('gifts') && !ids.has('gifts')) {
    const bestsellers = sections.find((section) => section.kind === 'bestsellers');
    const sortOrder =
      typeof bestsellers?.sortOrder === 'number' ? bestsellers.sortOrder + 5 : 30;
    sections.push({
      id: 'gifts',
      kind: 'gifts',
      enabled: true,
      heading: 'Подарки',
      sortOrder,
    });
  }

  return { ...(value as Record<string, unknown>), sections };
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

  const sections: HomepageSectionDto[] = result.data.sections.map((section) => ({
    id: section.id,
    kind: section.kind,
    enabled: section.enabled,
    heading: section.heading,
    sortOrder: section.sortOrder,
  }));

  return {
    hero: {
      title: result.data.hero.title,
      subtitle: result.data.hero.subtitle,
      imageUrl: result.data.hero.imageUrl,
      ctaLabel: result.data.hero.ctaLabel,
      ctaHref: result.data.hero.ctaHref,
    },
    sections: [...sections].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
  };
}

@Injectable()
export class HomepageConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly appConfig: AppConfigService,
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
      sections: input.sections,
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
            sectionIds: config.sections.map((section) => section.id),
          },
          requestId: actor.requestId,
          ipHash: hashIp(actor.ip, this.appConfig.sessionHmacSecret),
          userAgent: actor.userAgent,
        },
        tx,
      );
    });

    return this.getAdmin();
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

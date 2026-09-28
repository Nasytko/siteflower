import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  normalizeSlug,
  type BouquetSizeAdminDto,
  type ColorAdminDto,
  type PaginatedResponse,
  type SlugEntityType,
  type TaxonomyAdminDto,
  type TaxonomyVisibility,
} from '@bouquet-one/contracts';
import type { Prisma } from '@bouquet-one/database';
import { AuditService } from '../audit/audit.service';
import { hashIp } from '../auth/crypto.util';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../database/prisma.service';
import type { ActorContext } from '../common/actor.util';
import { OCC_CONFLICT_MESSAGE } from './catalog.logic';
import {
  toBouquetSizeAdminDto,
  toColorAdminDto,
  toTaxonomyAdminDto,
  type TaxonomyRecord,
} from './catalog.mapper';
import { SlugRedirectsService } from './slug-redirects.service';

/** Discovery dimensions only — categories and styles are gone by design. */
export const TAXONOMY_KINDS = [
  'flowers',
  'occasions',
  'recipients',
  'colors',
  'bouquet-sizes',
  'product-lines',
] as const;

export type TaxonomyKind = (typeof TAXONOMY_KINDS)[number];

export type TaxonomyEntryDto = TaxonomyAdminDto | ColorAdminDto | BouquetSizeAdminDto;

/** ProductLine has no SEO landings yet — slug redirects are skipped for it. */
const SLUG_ENTITY_BY_KIND: Partial<Record<TaxonomyKind, SlugEntityType>> = {
  flowers: 'FLOWER',
  occasions: 'OCCASION',
  recipients: 'RECIPIENT',
  colors: 'COLOR',
  'bouquet-sizes': 'BOUQUET_SIZE',
};

const ENTITY_TYPE_BY_KIND: Record<TaxonomyKind, string> = {
  flowers: 'Flower',
  occasions: 'Occasion',
  recipients: 'Recipient',
  colors: 'Color',
  'bouquet-sizes': 'BouquetSize',
  'product-lines': 'ProductLine',
};

/** BouquetSize / ProductLine are filter facets, not landing pages — no SEO columns. */
function hasSeoColumns(kind: TaxonomyKind): boolean {
  return kind !== 'bouquet-sizes' && kind !== 'product-lines';
}

type TaxonomyWhere = {
  visibility?: TaxonomyVisibility;
  OR?: Array<{
    name?: { contains: string; mode: 'insensitive' };
    slug?: { contains: string; mode: 'insensitive' };
  }>;
};

type TaxonomyRow = Omit<TaxonomyRecord, 'seoTitle' | 'seoDescription' | 'noIndex'> & {
  seoTitle?: string | null;
  seoDescription?: string | null;
  noIndex?: boolean;
  swatch?: string | null;
};

type TaxonomyWriteData = {
  slug?: string;
  name?: string;
  description?: string | null;
  sortOrder?: number;
  visibility?: TaxonomyVisibility;
  seoTitle?: string | null;
  seoDescription?: string | null;
  noIndex?: boolean;
  swatch?: string | null;
};

/**
 * Every taxonomy table shares this column set, so one structural delegate type
 * keeps the CRUD generic without per-model duplication.
 */
type TaxonomyDelegate = {
  findUnique(args: { where: { id: string } }): Promise<TaxonomyRow | null>;
  findFirst(args: { where: { slug: string; NOT?: { id: string } } }): Promise<TaxonomyRow | null>;
  findMany(args: {
    where?: TaxonomyWhere;
    orderBy?: Array<{ sortOrder?: 'asc' | 'desc'; name?: 'asc' | 'desc' }>;
    skip?: number;
    take?: number;
  }): Promise<TaxonomyRow[]>;
  count(args?: { where?: TaxonomyWhere }): Promise<number>;
  create(args: { data: TaxonomyWriteData & { slug: string; name: string } }): Promise<TaxonomyRow>;
  updateMany(args: {
    where: { id: string; version: number };
    data: TaxonomyWriteData & { version: { increment: number } };
  }): Promise<{ count: number }>;
};

export type TaxonomyListQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  visibility?: TaxonomyVisibility;
};

export type CreateTaxonomyInput = {
  name: string;
  slug?: string;
  description?: string;
  sortOrder?: number;
  visibility?: TaxonomyVisibility;
  seoTitle?: string;
  seoDescription?: string;
  noIndex?: boolean;
  /** Colors only: optional CSS color for swatch UI. */
  swatch?: string | null;
};

export type UpdateTaxonomyInput = Partial<CreateTaxonomyInput> & { expectedVersion: number };

@Injectable()
export class TaxonomyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slugRedirects: SlugRedirectsService,
    private readonly audit: AuditService,
    private readonly appConfig: AppConfigService,
  ) {}

  async list(
    kind: TaxonomyKind,
    query: TaxonomyListQuery,
  ): Promise<PaginatedResponse<TaxonomyEntryDto>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where: TaxonomyWhere = {
      ...(query.visibility ? { visibility: query.visibility } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { slug: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const delegate = this.delegate(kind);
    const [items, total] = await Promise.all([
      delegate.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      delegate.count({ where }),
    ]);

    return {
      items: items.map((row) => this.toDto(kind, row)),
      total,
      page,
      pageSize,
    };
  }

  async getById(kind: TaxonomyKind, id: string): Promise<TaxonomyEntryDto> {
    const row = await this.delegate(kind).findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('Taxonomy entry not found');
    }
    return this.toDto(kind, row);
  }

  async create(
    kind: TaxonomyKind,
    input: CreateTaxonomyInput,
    actor: ActorContext,
  ): Promise<TaxonomyEntryDto> {
    const name = input.name.trim();
    const slug = normalizeSlug(input.slug ?? name);
    if (!slug) {
      throw new BadRequestException('Slug could not be derived from the name');
    }

    const created = await this.prisma.client.$transaction(async (tx) => {
      const delegate = this.delegate(kind, tx);
      const taken = await delegate.findFirst({ where: { slug } });
      if (taken) {
        throw new ConflictException('Slug already in use');
      }
      const row = await delegate.create({
        data: {
          slug,
          name,
          description: input.description?.trim() ?? null,
          ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
          ...(input.visibility ? { visibility: input.visibility } : {}),
          ...(hasSeoColumns(kind)
            ? {
                seoTitle: input.seoTitle?.trim() ?? null,
                seoDescription: input.seoDescription?.trim() ?? null,
                ...(input.noIndex === undefined ? {} : { noIndex: input.noIndex }),
              }
            : {}),
          ...(kind === 'colors' ? { swatch: input.swatch?.trim() || null } : {}),
        },
      });
      await this.recordAudit(tx, kind, actor, 'TAXONOMY_CREATED', row.id, { slug, name });
      return row;
    });

    return this.toDto(kind, created);
  }

  async update(
    kind: TaxonomyKind,
    id: string,
    input: UpdateTaxonomyInput,
    actor: ActorContext,
  ): Promise<TaxonomyEntryDto> {
    const current = await this.delegate(kind).findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException('Taxonomy entry not found');
    }

    const nextSlug = input.slug === undefined ? current.slug : normalizeSlug(input.slug);
    if (!nextSlug) {
      throw new BadRequestException('Slug cannot be empty');
    }
    const slugChanged = nextSlug !== current.slug;

    await this.prisma.client.$transaction(async (tx) => {
      const delegate = this.delegate(kind, tx);
      if (slugChanged) {
        const taken = await delegate.findFirst({ where: { slug: nextSlug, NOT: { id } } });
        if (taken) {
          throw new ConflictException('Slug already in use');
        }
        const slugEntity = SLUG_ENTITY_BY_KIND[kind];
        if (slugEntity) {
          await this.slugRedirects.record(tx, slugEntity, current.slug, nextSlug);
        }
      }

      const data: TaxonomyWriteData = {
        ...(input.name === undefined ? {} : { name: input.name.trim() }),
        ...(slugChanged ? { slug: nextSlug } : {}),
        ...(input.description === undefined
          ? {}
          : { description: input.description.trim() || null }),
        ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
        ...(input.visibility === undefined ? {} : { visibility: input.visibility }),
        ...(hasSeoColumns(kind)
          ? {
              ...(input.seoTitle === undefined ? {} : { seoTitle: input.seoTitle.trim() || null }),
              ...(input.seoDescription === undefined
                ? {}
                : { seoDescription: input.seoDescription.trim() || null }),
              ...(input.noIndex === undefined ? {} : { noIndex: input.noIndex }),
            }
          : {}),
        ...(kind === 'colors' && input.swatch !== undefined
          ? { swatch: input.swatch?.trim() || null }
          : {}),
      };

      const result = await delegate.updateMany({
        where: { id, version: input.expectedVersion },
        data: { ...data, version: { increment: 1 } },
      });
      if (result.count === 0) {
        throw new ConflictException(OCC_CONFLICT_MESSAGE);
      }

      await this.recordAudit(tx, kind, actor, 'TAXONOMY_UPDATED', id, {
        fields: Object.keys(data),
        ...(slugChanged ? { previousSlug: current.slug, slug: nextSlug } : {}),
      });
    });

    return this.getById(kind, id);
  }

  private toDto(kind: TaxonomyKind, row: TaxonomyRow): TaxonomyEntryDto {
    if (kind === 'bouquet-sizes' || kind === 'product-lines') {
      return toBouquetSizeAdminDto(row);
    }
    const withSeo: TaxonomyRecord = {
      ...row,
      seoTitle: row.seoTitle ?? null,
      seoDescription: row.seoDescription ?? null,
      noIndex: row.noIndex ?? false,
    };
    if (kind === 'colors') {
      return toColorAdminDto({ ...withSeo, swatch: row.swatch ?? null });
    }
    return toTaxonomyAdminDto(withSeo);
  }

  private delegate(kind: TaxonomyKind, tx?: Prisma.TransactionClient): TaxonomyDelegate {
    const db = tx ?? this.prisma.client;
    const delegates = {
      flowers: db.flower,
      occasions: db.occasion,
      recipients: db.recipient,
      colors: db.color,
      'bouquet-sizes': db.bouquetSize,
      'product-lines': db.productLine,
    };
    return delegates[kind] as unknown as TaxonomyDelegate;
  }

  private recordAudit(
    tx: Prisma.TransactionClient,
    kind: TaxonomyKind,
    actor: ActorContext,
    action: 'TAXONOMY_CREATED' | 'TAXONOMY_UPDATED',
    entityId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.record(
      {
        actorAdminUserId: actor.actorId,
        action,
        entityType: ENTITY_TYPE_BY_KIND[kind],
        entityId,
        metadata: { kind, ...metadata },
        requestId: actor.requestId,
        ipHash: hashIp(actor.ip, this.appConfig.sessionHmacSecret),
        userAgent: actor.userAgent,
      },
      tx,
    );
  }
}

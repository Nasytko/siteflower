import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  normalizeSlug,
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
import type { ActorContext } from './catalog.actor';
import { OCC_CONFLICT_MESSAGE } from './catalog.logic';
import { toTaxonomyAdminDto, type TaxonomyRecord } from './catalog.mapper';
import { SlugRedirectsService } from './slug-redirects.service';

export const TAXONOMY_KINDS = [
  'flowers',
  'categories',
  'occasions',
  'recipients',
  'styles',
  'colors',
] as const;

export type TaxonomyKind = (typeof TAXONOMY_KINDS)[number];

const SLUG_ENTITY_BY_KIND: Record<TaxonomyKind, SlugEntityType> = {
  flowers: 'FLOWER',
  categories: 'CATEGORY',
  occasions: 'OCCASION',
  recipients: 'RECIPIENT',
  styles: 'STYLE',
  colors: 'COLOR',
};

const ENTITY_TYPE_BY_KIND: Record<TaxonomyKind, string> = {
  flowers: 'Flower',
  categories: 'Category',
  occasions: 'Occasion',
  recipients: 'Recipient',
  styles: 'Style',
  colors: 'Color',
};

type TaxonomyWhere = {
  visibility?: TaxonomyVisibility;
  OR?: Array<{
    name?: { contains: string; mode: 'insensitive' };
    slug?: { contains: string; mode: 'insensitive' };
  }>;
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
};

/**
 * All six taxonomy tables share this column set, so one structural delegate
 * type keeps the CRUD generic without per-model duplication.
 */
type TaxonomyDelegate = {
  findUnique(args: { where: { id: string } }): Promise<TaxonomyRecord | null>;
  findFirst(args: {
    where: { slug: string; NOT?: { id: string } };
  }): Promise<TaxonomyRecord | null>;
  findMany(args: {
    where?: TaxonomyWhere;
    orderBy?: Array<{ sortOrder?: 'asc' | 'desc'; name?: 'asc' | 'desc' }>;
    skip?: number;
    take?: number;
  }): Promise<TaxonomyRecord[]>;
  count(args?: { where?: TaxonomyWhere }): Promise<number>;
  create(args: { data: TaxonomyWriteData & { slug: string; name: string } }): Promise<TaxonomyRecord>;
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
  ): Promise<PaginatedResponse<TaxonomyAdminDto>> {
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

    return { items: items.map(toTaxonomyAdminDto), total, page, pageSize };
  }

  async getById(kind: TaxonomyKind, id: string): Promise<TaxonomyAdminDto> {
    const row = await this.delegate(kind).findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('Taxonomy entry not found');
    }
    return toTaxonomyAdminDto(row);
  }

  async create(
    kind: TaxonomyKind,
    input: CreateTaxonomyInput,
    actor: ActorContext,
  ): Promise<TaxonomyAdminDto> {
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
          seoTitle: input.seoTitle?.trim() ?? null,
          seoDescription: input.seoDescription?.trim() ?? null,
          ...(input.noIndex === undefined ? {} : { noIndex: input.noIndex }),
        },
      });
      await this.recordAudit(tx, kind, actor, 'TAXONOMY_CREATED', row.id, { slug, name });
      return row;
    });

    return toTaxonomyAdminDto(created);
  }

  async update(
    kind: TaxonomyKind,
    id: string,
    input: UpdateTaxonomyInput,
    actor: ActorContext,
  ): Promise<TaxonomyAdminDto> {
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
        await this.slugRedirects.record(
          tx,
          SLUG_ENTITY_BY_KIND[kind],
          current.slug,
          nextSlug,
        );
      }

      const data: TaxonomyWriteData = {
        ...(input.name === undefined ? {} : { name: input.name.trim() }),
        ...(slugChanged ? { slug: nextSlug } : {}),
        ...(input.description === undefined
          ? {}
          : { description: input.description.trim() || null }),
        ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
        ...(input.visibility === undefined ? {} : { visibility: input.visibility }),
        ...(input.seoTitle === undefined ? {} : { seoTitle: input.seoTitle.trim() || null }),
        ...(input.seoDescription === undefined
          ? {}
          : { seoDescription: input.seoDescription.trim() || null }),
        ...(input.noIndex === undefined ? {} : { noIndex: input.noIndex }),
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

  private delegate(kind: TaxonomyKind, tx?: Prisma.TransactionClient): TaxonomyDelegate {
    const db = tx ?? this.prisma.client;
    const delegates = {
      flowers: db.flower,
      categories: db.category,
      occasions: db.occasion,
      recipients: db.recipient,
      styles: db.style,
      colors: db.color,
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

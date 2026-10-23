import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  evaluateTaxonomyDeleteImpact,
  normalizeSlug,
  type ColorAdminDto,
  type TaxonomyDeleteImpactDto,
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
import { trimmedOrNull } from '../common/string.util';
import { StorefrontRevalidateService } from '../storefront/storefront-revalidate.service';
import { OCC_CONFLICT_MESSAGE } from './catalog.logic';
import {
  toColorAdminDto,
  toTaxonomyAdminDto,
  type TaxonomyRecord,
} from './catalog.mapper';
import { SlugRedirectsService } from './slug-redirects.service';

/** Discovery facets only — flowers / bouquet sizes / product lines are gone. */
export const TAXONOMY_KINDS = ['occasions', 'recipients', 'colors'] as const;

export type TaxonomyKind = (typeof TAXONOMY_KINDS)[number];

export type TaxonomyEntryDto = TaxonomyAdminDto | ColorAdminDto;

const SLUG_ENTITY_BY_KIND: Record<TaxonomyKind, SlugEntityType> = {
  occasions: 'OCCASION',
  recipients: 'RECIPIENT',
  colors: 'COLOR',
};

const ENTITY_TYPE_BY_KIND: Record<TaxonomyKind, string> = {
  occasions: 'Occasion',
  recipients: 'Recipient',
  colors: 'Color',
};

type TaxonomyWhere = {
  visibility?: TaxonomyVisibility;
  OR?: Array<{
    name?: { contains: string; mode: 'insensitive' };
    slug?: { contains: string; mode: 'insensitive' };
  }>;
};

type TaxonomyRow = TaxonomyRecord & {
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
  deleteMany(args: { where: { id: string; version: number } }): Promise<{ count: number }>;
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
  description?: string | null;
  sortOrder?: number;
  visibility?: TaxonomyVisibility;
  seoTitle?: string | null;
  seoDescription?: string | null;
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
    private readonly revalidate: StorefrontRevalidateService,
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

    const usage = await this.usageByIds(kind, items.map((row) => row.id));
    return {
      items: items.map((row) => this.toDto(kind, row, usage.get(row.id))),
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
    const usage = await this.usageByIds(kind, [id]);
    return this.toDto(kind, row, usage.get(id));
  }

  async deleteImpact(kind: TaxonomyKind, id: string): Promise<TaxonomyDeleteImpactDto> {
    const row = await this.delegate(kind).findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('Taxonomy entry not found');
    }
    const usage = await this.usageByIds(kind, [id]);
    const counts = usage.get(id) ?? { productsCount: 0, flowerItemsCount: 0, componentsCount: 0 };
    return evaluateTaxonomyDeleteImpact(counts);
  }

  async deleteEmpty(
    kind: TaxonomyKind,
    id: string,
    expectedVersion: number,
    actor: ActorContext,
  ): Promise<{ deleted: true; id: string }> {
    const current = await this.delegate(kind).findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException('Taxonomy entry not found');
    }
    if (current.version !== expectedVersion) {
      throw new ConflictException(OCC_CONFLICT_MESSAGE);
    }
    const impact = await this.deleteImpact(kind, id);
    if (!impact.canDelete) {
      throw new BadRequestException({
        message: impact.blockers[0]?.message ?? 'Запись используется и не может быть удалена',
        error: 'CatalogDeleteBlocked',
        code: impact.blockers[0]?.code ?? 'IN_USE',
        blockers: impact.blockers,
        productsCount: impact.productsCount,
        flowerItemsCount: impact.flowerItemsCount,
        componentsCount: impact.componentsCount,
      });
    }

    await this.prisma.client.$transaction(async (tx) => {
      const delegate = this.delegate(kind, tx);
      const result = await delegate.deleteMany({ where: { id, version: expectedVersion } });
      if (result.count === 0) {
        throw new ConflictException(OCC_CONFLICT_MESSAGE);
      }
      await this.recordAudit(tx, kind, actor, 'TAXONOMY_DELETED', id, {
        slug: current.slug,
        name: current.name,
      });
    });

    await this.revalidate.ping({ tags: ['catalog'], paths: ['/', '/bukety'] });
    return { deleted: true, id };
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
          description: trimmedOrNull(input.description),
          ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
          ...(input.visibility ? { visibility: input.visibility } : {}),
          seoTitle: trimmedOrNull(input.seoTitle),
          seoDescription: trimmedOrNull(input.seoDescription),
          ...(input.noIndex === undefined ? {} : { noIndex: input.noIndex }),
          ...(kind === 'colors' ? { swatch: trimmedOrNull(input.swatch) } : {}),
        },
      });
      await this.recordAudit(tx, kind, actor, 'TAXONOMY_CREATED', row.id, { slug, name });
      return row;
    });

    await this.revalidate.ping({ tags: ['catalog'], paths: ['/', '/bukety'] });
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
        await this.slugRedirects.record(tx, SLUG_ENTITY_BY_KIND[kind], current.slug, nextSlug);
      }

      const data: TaxonomyWriteData = {
        ...(input.name === undefined ? {} : { name: input.name.trim() }),
        ...(slugChanged ? { slug: nextSlug } : {}),
        ...(input.description === undefined
          ? {}
          : { description: trimmedOrNull(input.description) }),
        ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
        ...(input.visibility === undefined ? {} : { visibility: input.visibility }),
        ...(input.seoTitle === undefined ? {} : { seoTitle: trimmedOrNull(input.seoTitle) }),
        ...(input.seoDescription === undefined
          ? {}
          : { seoDescription: trimmedOrNull(input.seoDescription) }),
        ...(input.noIndex === undefined ? {} : { noIndex: input.noIndex }),
        ...(kind === 'colors' && input.swatch !== undefined
          ? { swatch: trimmedOrNull(input.swatch) }
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

    const dto = await this.getById(kind, id);
    await this.revalidate.ping({ tags: ['catalog'], paths: ['/', '/bukety'] });
    return dto;
  }

  private toDto(
    kind: TaxonomyKind,
    row: TaxonomyRow,
    usage?: { productsCount: number; flowerItemsCount: number; componentsCount: number },
  ): TaxonomyEntryDto {
    const counts = {
      productsCount: usage?.productsCount ?? 0,
      flowerItemsCount: usage?.flowerItemsCount ?? 0,
      componentsCount: usage?.componentsCount ?? 0,
    };
    if (kind === 'colors') {
      return { ...toColorAdminDto({ ...row, swatch: row.swatch ?? null }), ...counts };
    }
    return { ...toTaxonomyAdminDto(row), ...counts };
  }

  private async usageByIds(
    kind: TaxonomyKind,
    ids: string[],
  ): Promise<Map<string, { productsCount: number; flowerItemsCount: number; componentsCount: number }>> {
    const empty = {
      productsCount: 0,
      flowerItemsCount: 0,
      componentsCount: 0,
    };
    const map = new Map(ids.map((id) => [id, { ...empty }]));
    if (ids.length === 0) return map;

    if (kind === 'occasions') {
      const rows = await this.prisma.client.productOccasion.groupBy({
        by: ['occasionId'],
        where: { occasionId: { in: ids } },
        _count: { _all: true },
      });
      for (const row of rows) {
        const current = map.get(row.occasionId) ?? { ...empty };
        current.productsCount = row._count._all;
        map.set(row.occasionId, current);
      }
    } else if (kind === 'recipients') {
      const rows = await this.prisma.client.productRecipient.groupBy({
        by: ['recipientId'],
        where: { recipientId: { in: ids } },
        _count: { _all: true },
      });
      for (const row of rows) {
        const current = map.get(row.recipientId) ?? { ...empty };
        current.productsCount = row._count._all;
        map.set(row.recipientId, current);
      }
    } else {
      const [products, flowerItems, components] = await Promise.all([
        this.prisma.client.productColor.groupBy({
          by: ['colorId'],
          where: { colorId: { in: ids } },
          _count: { _all: true },
        }),
        this.prisma.client.flowerItem.groupBy({
          by: ['colorId'],
          where: { colorId: { in: ids } },
          _count: { _all: true },
        }),
        this.prisma.client.productComponent.groupBy({
          by: ['colorId'],
          where: { colorId: { in: ids } },
          _count: { _all: true },
        }),
      ]);
      for (const row of products) {
        const current = map.get(row.colorId) ?? { ...empty };
        current.productsCount = row._count._all;
        map.set(row.colorId, current);
      }
      for (const row of flowerItems) {
        if (!row.colorId) continue;
        const current = map.get(row.colorId) ?? { ...empty };
        current.flowerItemsCount = row._count._all;
        map.set(row.colorId, current);
      }
      for (const row of components) {
        if (!row.colorId) continue;
        const current = map.get(row.colorId) ?? { ...empty };
        current.componentsCount = row._count._all;
        map.set(row.colorId, current);
      }
    }
    return map;
  }

  private delegate(kind: TaxonomyKind, tx?: Prisma.TransactionClient): TaxonomyDelegate {
    const db = tx ?? this.prisma.client;
    const delegates = {
      occasions: db.occasion,
      recipients: db.recipient,
      colors: db.color,
    };
    return delegates[kind] as unknown as TaxonomyDelegate;
  }

  private recordAudit(
    tx: Prisma.TransactionClient,
    kind: TaxonomyKind,
    actor: ActorContext,
    action: 'TAXONOMY_CREATED' | 'TAXONOMY_UPDATED' | 'TAXONOMY_DELETED',
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

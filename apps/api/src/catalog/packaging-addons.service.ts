import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PackagingAddonDto, PackagingAddonKind } from '@bouquet-one/contracts';
import { normalizeErpSku, PACKAGING_ADDON_KINDS } from '@bouquet-one/contracts';
import type { Prisma } from '@bouquet-one/database';
import { AuditService } from '../audit/audit.service';
import { hashIp } from '../auth/crypto.util';
import type { ActorContext } from '../common/actor.util';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../database/prisma.service';
import {
  erpSkuConflict,
  isErpSkuUniqueViolation,
  syncPackagingAddonErpSkuRegistry,
} from './erp-sku-registry';

export type PackagingAddonWriteInput = {
  name?: string;
  kind?: PackagingAddonKind;
  surchargeMinor?: string;
  erpSku?: string | null;
  active?: boolean;
  sortOrder?: number;
  expectedVersion?: number;
};

@Injectable()
export class PackagingAddonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly appConfig: AppConfigService,
  ) {}

  async list(options?: { includeInactive?: boolean }): Promise<PackagingAddonDto[]> {
    const rows = await this.prisma.client.packagingAddon.findMany({
      where: options?.includeInactive ? undefined : { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toDto);
  }

  async get(id: string): Promise<PackagingAddonDto> {
    const row = await this.prisma.client.packagingAddon.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Позиция ленты/упаковки не найдена');
    return toDto(row);
  }

  async create(input: PackagingAddonWriteInput, actor: ActorContext): Promise<PackagingAddonDto> {
    const name = input.name?.trim() ?? '';
    if (!name) throw new ConflictException('Укажите название');
    const kind = normalizeKind(input.kind);
    const surchargeMinor = parseNonNegativeMinor(input.surchargeMinor ?? '0');
    const erpSku =
      input.erpSku === undefined || input.erpSku === null
        ? null
        : normalizeErpSku(input.erpSku);

    const created = await this.prisma.client
      .$transaction(async (tx) => {
        const row = await tx.packagingAddon.create({
          data: {
            name,
            kind,
            surchargeMinor,
            erpSku,
            active: input.active ?? true,
            sortOrder: input.sortOrder ?? 0,
          },
        });
        await syncPackagingAddonErpSkuRegistry(tx, row.id, null, erpSku);
        await this.recordAudit(tx, actor, 'PACKAGING_ADDON_CREATED', row.id, {
          name,
          kind,
          erpSku,
        });
        return row;
      })
      .catch((err: unknown) => {
        if (isErpSkuUniqueViolation(err)) throw erpSkuConflict(erpSku);
        throw err;
      });

    return toDto(created);
  }

  async update(
    id: string,
    input: PackagingAddonWriteInput,
    actor: ActorContext,
  ): Promise<PackagingAddonDto> {
    const updated = await this.prisma.client
      .$transaction(async (tx) => {
        const existing = await tx.packagingAddon.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Позиция ленты/упаковки не найдена');
        if (
          input.expectedVersion != null &&
          existing.version !== input.expectedVersion
        ) {
          throw new ConflictException('Позиция изменена в другом окне — обновите страницу');
        }

        const name = (input.name ?? existing.name).trim();
        if (!name) throw new ConflictException('Укажите название');
        const kind = normalizeKind(input.kind ?? existing.kind);
        const surchargeMinor = parseNonNegativeMinor(
          input.surchargeMinor ?? existing.surchargeMinor.toString(),
        );
        const nextErpSku =
          input.erpSku === undefined
            ? existing.erpSku
            : input.erpSku === null
              ? null
              : normalizeErpSku(input.erpSku);

        const row = await tx.packagingAddon.update({
          where: { id },
          data: {
            name,
            kind,
            surchargeMinor,
            erpSku: nextErpSku,
            active: input.active ?? existing.active,
            sortOrder: input.sortOrder ?? existing.sortOrder,
            version: { increment: 1 },
          },
        });

        await syncPackagingAddonErpSkuRegistry(
          tx,
          id,
          existing.erpSku ?? null,
          nextErpSku,
        );

        await tx.productOptionValue.updateMany({
          where: { addonId: id },
          data: {
            name: row.name,
            surchargeMinor: row.surchargeMinor,
            erpSku: null,
          },
        });

        await this.recordAudit(tx, actor, 'PACKAGING_ADDON_UPDATED', id, {
          name,
          kind,
          erpSku: nextErpSku,
        });
        return row;
      })
      .catch((err: unknown) => {
        if (err instanceof ConflictException || err instanceof NotFoundException) throw err;
        if (isErpSkuUniqueViolation(err)) throw erpSkuConflict();
        throw err;
      });

    return toDto(updated);
  }

  async remove(id: string, actor: ActorContext): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      const existing = await tx.packagingAddon.findUnique({
        where: { id },
        include: { _count: { select: { optionValues: true } } },
      });
      if (!existing) throw new NotFoundException('Позиция ленты/упаковки не найдена');
      if (existing._count.optionValues > 0) {
        throw new ConflictException(
          'Позиция используется в товарах. Сначала уберите её из карточек или отметьте «Не показывать».',
        );
      }
      await syncPackagingAddonErpSkuRegistry(tx, id, existing.erpSku ?? null, null);
      await tx.packagingAddon.delete({ where: { id } });
      await this.recordAudit(tx, actor, 'PACKAGING_ADDON_DELETED', id, { name: existing.name });
    });
  }

  /** Resolve option-value write rows against the packaging directory. */
  async resolveOptionValuesForSave(
    tx: Prisma.TransactionClient,
    values: Array<{
      name: string;
      addonId?: string | null;
      erpSku?: string | null;
      surchargeMinor: bigint;
      chargeMode: 'PER_LINE' | 'PER_UNIT';
      sortOrder: number;
      active: boolean;
      variantSurcharges: Array<{ variantId: string; surchargeMinor: bigint }>;
    }>,
  ): Promise<
    Array<{
      name: string;
      addonId: string | null;
      erpSku: string | null;
      surchargeMinor: bigint;
      chargeMode: 'PER_LINE' | 'PER_UNIT';
      sortOrder: number;
      active: boolean;
      variantSurcharges: Array<{ variantId: string; surchargeMinor: bigint }>;
    }>
  > {
    const addonIds = [
      ...new Set(
        values
          .map((value) => value.addonId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ];
    const addons =
      addonIds.length === 0
        ? []
        : await tx.packagingAddon.findMany({
            where: { id: { in: addonIds } },
          });
    const byId = new Map(addons.map((row) => [row.id, row]));

    return values.map((value) => {
      if (!value.addonId) {
        return {
          ...value,
          addonId: null,
          erpSku: value.erpSku ?? null,
        };
      }
      const addon = byId.get(value.addonId);
      if (!addon) {
        throw new ConflictException('Выбранная лента/упаковка не найдена в справочнике');
      }
      return {
        ...value,
        addonId: addon.id,
        name: addon.name,
        surchargeMinor: addon.surchargeMinor < 0n ? 0n : addon.surchargeMinor,
        erpSku: null,
      };
    });
  }

  private recordAudit(
    tx: Prisma.TransactionClient,
    actor: ActorContext,
    action: 'PACKAGING_ADDON_CREATED' | 'PACKAGING_ADDON_UPDATED' | 'PACKAGING_ADDON_DELETED',
    entityId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.record(
      {
        actorAdminUserId: actor.actorId,
        action,
        entityType: 'PackagingAddon',
        entityId,
        metadata,
        requestId: actor.requestId,
        ipHash: hashIp(actor.ip, this.appConfig.sessionHmacSecret),
        userAgent: actor.userAgent,
      },
      tx,
    );
  }
}

function toDto(row: {
  id: string;
  name: string;
  kind: PackagingAddonKind;
  surchargeMinor: bigint;
  erpSku: string | null;
  active: boolean;
  sortOrder: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}): PackagingAddonDto {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    surchargeMinor: row.surchargeMinor.toString(),
    erpSku: row.erpSku ?? null,
    active: row.active,
    sortOrder: row.sortOrder,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function normalizeKind(kind: string | null | undefined): PackagingAddonKind {
  if (kind && (PACKAGING_ADDON_KINDS as readonly string[]).includes(kind)) {
    return kind as PackagingAddonKind;
  }
  return 'OTHER';
}

function parseNonNegativeMinor(raw: string): bigint {
  const value = BigInt(raw);
  return value < 0n ? 0n : value;
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { BudgetRangeDto, BudgetRangePublicDto } from '@bouquet-one/contracts';
import type { Prisma } from '@bouquet-one/database';
import { AuditService } from '../audit/audit.service';
import { hashIp } from '../auth/crypto.util';
import type { ActorContext } from '../common/actor.util';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../database/prisma.service';
import { OCC_CONFLICT_MESSAGE } from './catalog.logic';
import { toBudgetRangeAdminDto, toBudgetRangePublicDto } from './catalog.mapper';
import type { BudgetBound } from './products.repository';

export type CreateBudgetRangeInput = {
  label: string;
  minMinor?: string | null;
  maxMinor?: string | null;
  sortOrder?: number;
  active?: boolean;
};

export type UpdateBudgetRangeInput = Partial<CreateBudgetRangeInput> & { expectedVersion: number };

function toBigIntOrNull(value: string | null | undefined): bigint | null {
  if (value === null || value === undefined || value === '') return null;
  return BigInt(value);
}

/**
 * Admin-managed budget filter chips ("до 100 BYN", "100–200 BYN", …).
 * Bounds are inclusive; an open bound is expressed as null.
 */
@Injectable()
export class BudgetRangesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly appConfig: AppConfigService,
  ) {}

  async list(): Promise<BudgetRangeDto[]> {
    const rows = await this.prisma.client.budgetRange.findMany({
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    return rows.map(toBudgetRangeAdminDto);
  }

  async listPublic(): Promise<BudgetRangePublicDto[]> {
    const rows = await this.prisma.client.budgetRange.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    return rows.map(toBudgetRangePublicDto);
  }

  async getById(id: string): Promise<BudgetRangeDto> {
    const row = await this.prisma.client.budgetRange.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('Budget range not found');
    }
    return toBudgetRangeAdminDto(row);
  }

  /** Active ranges only — a disabled chip must never silently filter the catalog. */
  async resolveBounds(ids: string[]): Promise<BudgetBound[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    const rows = await this.prisma.client.budgetRange.findMany({
      where: { id: { in: unique }, active: true },
      select: { minMinor: true, maxMinor: true },
    });
    return rows.map((row) => ({ minMinor: row.minMinor, maxMinor: row.maxMinor }));
  }

  async create(input: CreateBudgetRangeInput, actor: ActorContext): Promise<BudgetRangeDto> {
    const label = input.label.trim();
    if (!label) {
      throw new BadRequestException('Укажите название диапазона');
    }
    const minMinor = toBigIntOrNull(input.minMinor);
    const maxMinor = toBigIntOrNull(input.maxMinor);
    this.assertBounds(minMinor, maxMinor);

    const created = await this.prisma.client.$transaction(async (tx) => {
      const row = await tx.budgetRange.create({
        data: {
          label,
          minMinor,
          maxMinor,
          ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
          ...(input.active === undefined ? {} : { active: input.active }),
        },
      });
      await this.recordAudit(tx, actor, row.id, { created: true, label });
      return row;
    });

    return toBudgetRangeAdminDto(created);
  }

  async update(
    id: string,
    input: UpdateBudgetRangeInput,
    actor: ActorContext,
  ): Promise<BudgetRangeDto> {
    const current = await this.prisma.client.budgetRange.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException('Budget range not found');
    }

    const minMinor =
      input.minMinor === undefined ? current.minMinor : toBigIntOrNull(input.minMinor);
    const maxMinor =
      input.maxMinor === undefined ? current.maxMinor : toBigIntOrNull(input.maxMinor);
    this.assertBounds(minMinor, maxMinor);

    await this.prisma.client.$transaction(async (tx) => {
      const data: Prisma.BudgetRangeUpdateManyMutationInput = {
        ...(input.label === undefined ? {} : { label: input.label.trim() }),
        ...(input.minMinor === undefined ? {} : { minMinor }),
        ...(input.maxMinor === undefined ? {} : { maxMinor }),
        ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
        ...(input.active === undefined ? {} : { active: input.active }),
      };
      const result = await tx.budgetRange.updateMany({
        where: { id, version: input.expectedVersion },
        data: { ...data, version: { increment: 1 } },
      });
      if (result.count === 0) {
        throw new ConflictException(OCC_CONFLICT_MESSAGE);
      }
      await this.recordAudit(tx, actor, id, { fields: Object.keys(data) });
    });

    return this.getById(id);
  }

  async remove(id: string, expectedVersion: number, actor: ActorContext): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      const deleted = await tx.budgetRange.deleteMany({ where: { id, version: expectedVersion } });
      if (deleted.count === 0) {
        const exists = await tx.budgetRange.findUnique({ where: { id }, select: { id: true } });
        if (exists) {
          throw new ConflictException(OCC_CONFLICT_MESSAGE);
        }
        throw new NotFoundException('Budget range not found');
      }
      await this.recordAudit(tx, actor, id, { deleted: true });
    });
  }

  async reorder(ids: string[], actor: ActorContext): Promise<BudgetRangeDto[]> {
    const unique = [...new Set(ids)];
    if (unique.length !== ids.length) {
      throw new BadRequestException('ids не должны повторяться');
    }
    await this.prisma.client.$transaction(async (tx) => {
      const found = await tx.budgetRange.count({ where: { id: { in: unique } } });
      if (found !== unique.length) {
        throw new BadRequestException('Указан несуществующий диапазон');
      }
      for (const [index, id] of unique.entries()) {
        await tx.budgetRange.update({
          where: { id },
          data: { sortOrder: index * 10, version: { increment: 1 } },
        });
      }
      await this.recordAudit(tx, actor, unique[0]!, { reordered: unique });
    });
    return this.list();
  }

  private assertBounds(minMinor: bigint | null, maxMinor: bigint | null): void {
    if (minMinor === null && maxMinor === null) {
      throw new BadRequestException('Укажите хотя бы одну границу диапазона');
    }
    if (minMinor !== null && minMinor < 0n) {
      throw new BadRequestException('Нижняя граница не может быть отрицательной');
    }
    if (minMinor !== null && maxMinor !== null && minMinor > maxMinor) {
      throw new BadRequestException('Нижняя граница должна быть меньше верхней');
    }
  }

  private recordAudit(
    tx: Prisma.TransactionClient,
    actor: ActorContext,
    entityId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.record(
      {
        actorAdminUserId: actor.actorId,
        action: 'BUDGET_RANGE_UPDATED',
        entityType: 'BudgetRange',
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

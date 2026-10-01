import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  defaultTimeWindows,
  type FulfillmentSettingsAdminDto,
  type FulfillmentSettingsPublicDto,
  type TimeWindowDto,
  type UpdateFulfillmentSettingsDto,
} from '@bouquet-one/contracts';
import type { Prisma } from '@bouquet-one/database';
import { AuditService } from '../audit/audit.service';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../database/prisma.service';
import { businessDateString } from './business-time.util';

const SINGLETON_ID = 1;

function parseWindows(raw: unknown): TimeWindowDto[] {
  if (!Array.isArray(raw)) return defaultTimeWindows();
  return raw as TimeWindowDto[];
}

@Injectable()
export class FulfillmentSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly appConfig: AppConfigService,
  ) {}

  private toPublic(row: {
    deliveryEnabled: boolean;
    pickupEnabled: boolean;
    deliveryFeeMinor: bigint;
    minLeadTimeMinutes: number;
    maxAdvanceDays: number;
    timeWindows: unknown;
    pickupInstructions: string | null;
  }): FulfillmentSettingsPublicDto {
    return {
      deliveryEnabled: row.deliveryEnabled,
      pickupEnabled: row.pickupEnabled,
      deliveryFeeMinor: row.deliveryFeeMinor.toString(),
      currency: 'BYN',
      minLeadTimeMinutes: row.minLeadTimeMinutes,
      maxAdvanceDays: row.maxAdvanceDays,
      timeWindows: parseWindows(row.timeWindows)
        .filter((w) => w.active)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
      pickupInstructions: row.pickupInstructions,
      businessTimezone: this.appConfig.businessTimezone,
      todayBusinessDate: businessDateString(new Date(), this.appConfig.businessTimezone),
    };
  }

  async getOrCreate(tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma.client;
    const existing = await db.fulfillmentSettings.findUnique({ where: { id: SINGLETON_ID } });
    if (existing) return existing;
    return db.fulfillmentSettings.create({
      data: {
        id: SINGLETON_ID,
        timeWindows: defaultTimeWindows() as unknown as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });
  }

  async getPublic(): Promise<FulfillmentSettingsPublicDto> {
    const row = await this.getOrCreate();
    return this.toPublic(row);
  }

  async getAdmin(): Promise<FulfillmentSettingsAdminDto> {
    const row = await this.getOrCreate();
    const pub = this.toPublic(row);
    // Admin sees all windows including inactive
    pub.timeWindows = parseWindows(row.timeWindows).sort(
      (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
    );
    return {
      ...pub,
      version: row.version,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async update(
    dto: UpdateFulfillmentSettingsDto,
    actor: { id: string; requestId?: string },
  ): Promise<FulfillmentSettingsAdminDto> {
    if (dto.timeWindows) {
      for (const w of dto.timeWindows) {
        if (w.endMinutes <= w.startMinutes) {
          throw new BadRequestException(`Invalid time window ${w.id}`);
        }
      }
    }

    return this.prisma.client.$transaction(async (tx) => {
      const current = await this.getOrCreate(tx);
      if (current.version !== dto.expectedVersion) {
        throw new ConflictException(
          'Данные изменены другим пользователем. Обновите страницу и сохраните снова.',
        );
      }

      const data: Prisma.FulfillmentSettingsUpdateManyMutationInput = {
        version: { increment: 1 },
      };
      if (dto.deliveryEnabled != null) data.deliveryEnabled = dto.deliveryEnabled;
      if (dto.pickupEnabled != null) data.pickupEnabled = dto.pickupEnabled;
      if (dto.deliveryFeeMinor != null) data.deliveryFeeMinor = BigInt(dto.deliveryFeeMinor);
      if (dto.minLeadTimeMinutes != null) data.minLeadTimeMinutes = dto.minLeadTimeMinutes;
      if (dto.maxAdvanceDays != null) data.maxAdvanceDays = dto.maxAdvanceDays;
      if (dto.timeWindows != null) {
        data.timeWindows = dto.timeWindows as unknown as Prisma.InputJsonValue;
      }
      if (dto.pickupInstructions !== undefined) {
        data.pickupInstructions = dto.pickupInstructions;
      }

      const updated = await tx.fulfillmentSettings.updateMany({
        where: { id: SINGLETON_ID, version: dto.expectedVersion },
        data,
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          'Данные изменены другим пользователем. Обновите страницу и сохраните снова.',
        );
      }

      await this.audit.record(
        {
          actorAdminUserId: actor.id,
          action: 'FULFILLMENT_SETTINGS_UPDATED',
          entityType: 'FulfillmentSettings',
          entityId: null,
          requestId: actor.requestId ?? null,
          metadata: { expectedVersion: dto.expectedVersion },
        },
        tx,
      );

      const row = await tx.fulfillmentSettings.findUniqueOrThrow({ where: { id: SINGLETON_ID } });
      const pub = this.toPublic(row);
      pub.timeWindows = parseWindows(row.timeWindows).sort(
        (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
      );
      return {
        ...pub,
        version: row.version,
        updatedAt: row.updatedAt.toISOString(),
      };
    });
  }
}

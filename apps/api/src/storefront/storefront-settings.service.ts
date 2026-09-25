import { ConflictException, Injectable } from '@nestjs/common';
import {
  defaultStorefrontSettings,
  type StorefrontSettingsAdminDto,
  type StorefrontSettingsPublicDto,
  type UpdateStorefrontSettingsDto,
} from '@bouquet-one/contracts';
import type { Prisma } from '@bouquet-one/database';
import { AuditService } from '../audit/audit.service';
import { hashIp } from '../auth/crypto.util';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../database/prisma.service';
import type { ActorContext } from '../common/actor.util';

const SINGLETON_ID = 1;
const OCC_CONFLICT_MESSAGE =
  'This item was changed by another user. Reload before saving.';

type StorefrontSettingsRow = Prisma.StorefrontSettingsGetPayload<object>;

@Injectable()
export class StorefrontSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly appConfig: AppConfigService,
  ) {}

  async getPublic(): Promise<StorefrontSettingsPublicDto> {
    const row = await this.getOrCreate();
    return this.toPublicDto(row);
  }

  async getAdmin(): Promise<StorefrontSettingsAdminDto> {
    const row = await this.getOrCreate();
    return this.toAdminDto(row);
  }

  async update(
    input: UpdateStorefrontSettingsDto,
    actor: ActorContext,
  ): Promise<StorefrontSettingsAdminDto> {
    await this.getOrCreate();

    const data: Prisma.StorefrontSettingsUpdateManyMutationInput = {
      ...(input.brandName === undefined ? {} : { brandName: input.brandName.trim() }),
      ...(input.city === undefined ? {} : { city: input.city.trim() }),
      ...(input.phone === undefined ? {} : { phone: this.nullableTrim(input.phone) }),
      ...(input.email === undefined ? {} : { email: this.nullableTrim(input.email) }),
      ...(input.address === undefined ? {} : { address: this.nullableTrim(input.address) }),
      ...(input.workingHours === undefined
        ? {}
        : { workingHours: this.nullableTrim(input.workingHours) }),
      ...(input.deliverySummary === undefined
        ? {}
        : { deliverySummary: this.nullableTrim(input.deliverySummary) }),
      ...(input.aboutSummary === undefined
        ? {}
        : { aboutSummary: this.nullableTrim(input.aboutSummary) }),
      ...(input.instagramUrl === undefined
        ? {}
        : { instagramUrl: this.nullableTrim(input.instagramUrl) }),
      ...(input.telegramUrl === undefined
        ? {}
        : { telegramUrl: this.nullableTrim(input.telegramUrl) }),
      ...(input.substitutionNote === undefined
        ? {}
        : { substitutionNote: this.nullableTrim(input.substitutionNote) }),
    };

    await this.prisma.client.$transaction(async (tx) => {
      const result = await tx.storefrontSettings.updateMany({
        where: { id: SINGLETON_ID, version: input.expectedVersion },
        data: { ...data, version: { increment: 1 } },
      });
      if (result.count === 0) {
        throw new ConflictException(OCC_CONFLICT_MESSAGE);
      }

      await this.audit.record(
        {
          actorAdminUserId: actor.actorId,
          action: 'STOREFRONT_SETTINGS_UPDATED',
          entityType: 'StorefrontSettings',
          entityId: String(SINGLETON_ID),
          metadata: { fields: Object.keys(data) },
          requestId: actor.requestId,
          ipHash: hashIp(actor.ip, this.appConfig.sessionHmacSecret),
          userAgent: actor.userAgent,
        },
        tx,
      );
    });

    return this.getAdmin();
  }

  private async getOrCreate(): Promise<StorefrontSettingsRow> {
    const existing = await this.prisma.client.storefrontSettings.findUnique({
      where: { id: SINGLETON_ID },
    });
    if (existing) {
      return existing;
    }

    const defaults = defaultStorefrontSettings();
    try {
      return await this.prisma.client.storefrontSettings.create({
        data: {
          id: SINGLETON_ID,
          brandName: defaults.brandName,
          city: defaults.city,
          phone: defaults.phone,
          email: defaults.email,
          address: defaults.address,
          workingHours: defaults.workingHours,
          deliverySummary: defaults.deliverySummary,
          aboutSummary: defaults.aboutSummary,
          instagramUrl: defaults.instagramUrl,
          telegramUrl: defaults.telegramUrl,
          substitutionNote: defaults.substitutionNote,
        },
      });
    } catch {
      const raced = await this.prisma.client.storefrontSettings.findUnique({
        where: { id: SINGLETON_ID },
      });
      if (raced) {
        return raced;
      }
      throw new ConflictException('Unable to initialize storefront settings');
    }
  }

  private toPublicDto(row: StorefrontSettingsRow): StorefrontSettingsPublicDto {
    return {
      brandName: row.brandName,
      city: row.city,
      phone: row.phone,
      email: row.email,
      address: row.address,
      workingHours: row.workingHours,
      deliverySummary: row.deliverySummary,
      aboutSummary: row.aboutSummary,
      instagramUrl: row.instagramUrl,
      telegramUrl: row.telegramUrl,
      substitutionNote: row.substitutionNote,
    };
  }

  private toAdminDto(row: StorefrontSettingsRow): StorefrontSettingsAdminDto {
    return {
      ...this.toPublicDto(row),
      version: row.version,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private nullableTrim(value: string | null): string | null {
    if (value === null) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
}

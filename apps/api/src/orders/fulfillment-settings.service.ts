import { Injectable } from '@nestjs/common';
import {
  defaultTimeWindows,
  FULFILLMENT_MAX_ADVANCE_DAYS,
  FULFILLMENT_MIN_LEAD_MINUTES,
  type FulfillmentSettingsAdminDto,
  type FulfillmentSettingsPublicDto,
} from '@bouquet-one/contracts';
import type { Prisma } from '@bouquet-one/database';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../database/prisma.service';
import { businessDateString } from './business-time.util';

const SINGLETON_ID = 1;

const FIXED_PICKUP_INSTRUCTIONS =
  'Самовывоз по адресу магазина в рабочие часы 9:00–21:00. Точное время можно согласовать с менеджером при подтверждении заказа.';

/**
 * Fulfillment rules are fixed in code (hourly 09–21, +1h lead, manager slot).
 * DB row is kept only so order creation still has a singleton to attach fee history to.
 */
@Injectable()
export class FulfillmentSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
  ) {}

  private fixedPublic(): FulfillmentSettingsPublicDto {
    return {
      deliveryEnabled: true,
      pickupEnabled: true,
      deliveryFeeMinor: '0',
      currency: 'BYN',
      minLeadTimeMinutes: FULFILLMENT_MIN_LEAD_MINUTES,
      maxAdvanceDays: FULFILLMENT_MAX_ADVANCE_DAYS,
      timeWindows: defaultTimeWindows().filter((w) => w.active),
      pickupInstructions: FIXED_PICKUP_INSTRUCTIONS,
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
        deliveryEnabled: true,
        pickupEnabled: true,
        deliveryFeeMinor: 0n,
        minLeadTimeMinutes: FULFILLMENT_MIN_LEAD_MINUTES,
        maxAdvanceDays: FULFILLMENT_MAX_ADVANCE_DAYS,
        timeWindows: defaultTimeWindows() as unknown as Prisma.InputJsonValue,
        pickupInstructions: FIXED_PICKUP_INSTRUCTIONS,
        updatedAt: new Date(),
      },
    });
  }

  async getPublic(): Promise<FulfillmentSettingsPublicDto> {
    await this.getOrCreate();
    return this.fixedPublic();
  }

  /** @deprecated Admin editor removed — returns the same fixed template. */
  async getAdmin(): Promise<FulfillmentSettingsAdminDto> {
    const row = await this.getOrCreate();
    const pub = this.fixedPublic();
    return {
      ...pub,
      version: row.version,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

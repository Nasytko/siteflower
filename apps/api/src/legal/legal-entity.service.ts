import { ConflictException, Injectable } from '@nestjs/common';
import {
  defaultLegalEntitySettings,
  type LegalBankPublicDto,
  type LegalEntitySettingsDto,
  type LegalSellerPublicDto,
  type UpdateLegalEntitySettingsDto,
} from '@bouquet-one/contracts';
import type { AuditAction, Prisma } from '@bouquet-one/database';
import { AuditService } from '../audit/audit.service';
import { hashIp } from '../auth/crypto.util';
import type { ActorContext } from '../common/actor.util';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../database/prisma.service';
import { StorefrontSettingsService } from '../storefront/storefront-settings.service';

const SINGLETON_ID = 1;
const OCC_CONFLICT_MESSAGE =
  'This item was changed by another user. Reload before saving.';

type LegalEntityRow = Prisma.LegalEntitySettingsGetPayload<object>;

const BANK_FIELDS = [
  'bankAccountIban',
  'bankName',
  'bankAddress',
  'bankSwift',
  'bankUnp',
] as const;

const TRADE_REGISTER_FIELDS = ['tradeRegisterNumber', 'tradeRegisterDate'] as const;

const SELLER_FIELDS = [
  'sellerType',
  'legalName',
  'unp',
  'legalAddress',
  'postalCode',
  'stateRegistrationDate',
  'stateRegistrationNumber',
  'registeringAuthority',
  'sellerPhone',
  'sellerEmail',
  'businessHours',
  'consumerClaimsContactName',
  'consumerClaimsPhone',
  'consumerClaimsEmail',
  'physicalStoreAddress',
  'pickupAddress',
  'actualOfflinePaymentDescription',
  'failedDeliveryPolicy',
] as const;

@Injectable()
export class LegalEntityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly appConfig: AppConfigService,
    private readonly storefront: StorefrontSettingsService,
  ) {}

  async getOrCreate(): Promise<LegalEntityRow> {
    const existing = await this.prisma.client.legalEntitySettings.findUnique({
      where: { id: SINGLETON_ID },
    });
    if (existing) {
      return existing;
    }

    const defaults = defaultLegalEntitySettings();
    try {
      return await this.prisma.client.legalEntitySettings.create({
        data: {
          id: SINGLETON_ID,
          sellerType: defaults.sellerType,
          legalName: defaults.legalName,
          unp: defaults.unp,
          legalAddress: defaults.legalAddress,
          postalCode: defaults.postalCode,
          bankAccountIban: defaults.bankAccountIban,
          bankName: defaults.bankName,
          bankAddress: defaults.bankAddress,
          bankSwift: defaults.bankSwift,
          bankUnp: defaults.bankUnp,
        },
      });
    } catch {
      const raced = await this.prisma.client.legalEntitySettings.findUnique({
        where: { id: SINGLETON_ID },
      });
      if (raced) {
        return raced;
      }
      throw new ConflictException('Unable to initialize legal entity settings');
    }
  }

  async getAdmin(): Promise<LegalEntitySettingsDto> {
    const row = await this.getOrCreate();
    return this.toAdminDto(row);
  }

  async update(
    input: UpdateLegalEntitySettingsDto,
    actor: ActorContext,
  ): Promise<LegalEntitySettingsDto> {
    await this.getOrCreate();

    const data: Prisma.LegalEntitySettingsUpdateManyMutationInput = {
      ...(input.sellerType === undefined
        ? {}
        : { sellerType: input.sellerType.trim() }),
      ...(input.legalName === undefined ? {} : { legalName: input.legalName.trim() }),
      ...(input.unp === undefined ? {} : { unp: input.unp.trim() }),
      ...(input.legalAddress === undefined
        ? {}
        : { legalAddress: input.legalAddress.trim() }),
      ...(input.postalCode === undefined
        ? {}
        : { postalCode: this.nullableTrim(input.postalCode) }),
      ...(input.stateRegistrationDate === undefined
        ? {}
        : { stateRegistrationDate: this.parseOptionalDate(input.stateRegistrationDate) }),
      ...(input.stateRegistrationNumber === undefined
        ? {}
        : {
            stateRegistrationNumber: this.nullableTrim(input.stateRegistrationNumber),
          }),
      ...(input.registeringAuthority === undefined
        ? {}
        : { registeringAuthority: this.nullableTrim(input.registeringAuthority) }),
      ...(input.tradeRegisterNumber === undefined
        ? {}
        : { tradeRegisterNumber: this.nullableTrim(input.tradeRegisterNumber) }),
      ...(input.tradeRegisterDate === undefined
        ? {}
        : { tradeRegisterDate: this.parseOptionalDate(input.tradeRegisterDate) }),
      ...(input.sellerPhone === undefined
        ? {}
        : { sellerPhone: this.nullableTrim(input.sellerPhone) }),
      ...(input.sellerEmail === undefined
        ? {}
        : { sellerEmail: this.nullableTrim(input.sellerEmail) }),
      ...(input.businessHours === undefined
        ? {}
        : { businessHours: this.nullableTrim(input.businessHours) }),
      ...(input.consumerClaimsContactName === undefined
        ? {}
        : {
            consumerClaimsContactName: this.nullableTrim(input.consumerClaimsContactName),
          }),
      ...(input.consumerClaimsPhone === undefined
        ? {}
        : { consumerClaimsPhone: this.nullableTrim(input.consumerClaimsPhone) }),
      ...(input.consumerClaimsEmail === undefined
        ? {}
        : { consumerClaimsEmail: this.nullableTrim(input.consumerClaimsEmail) }),
      ...(input.physicalStoreAddress === undefined
        ? {}
        : { physicalStoreAddress: this.nullableTrim(input.physicalStoreAddress) }),
      ...(input.pickupAddress === undefined
        ? {}
        : { pickupAddress: this.nullableTrim(input.pickupAddress) }),
      ...(input.actualOfflinePaymentDescription === undefined
        ? {}
        : {
            actualOfflinePaymentDescription: this.nullableTrim(
              input.actualOfflinePaymentDescription,
            ),
          }),
      ...(input.failedDeliveryPolicy === undefined
        ? {}
        : { failedDeliveryPolicy: this.nullableTrim(input.failedDeliveryPolicy) }),
      ...(input.bankAccountIban === undefined
        ? {}
        : { bankAccountIban: this.nullableTrim(input.bankAccountIban) }),
      ...(input.bankName === undefined
        ? {}
        : { bankName: this.nullableTrim(input.bankName) }),
      ...(input.bankAddress === undefined
        ? {}
        : { bankAddress: this.nullableTrim(input.bankAddress) }),
      ...(input.bankSwift === undefined
        ? {}
        : { bankSwift: this.nullableTrim(input.bankSwift) }),
      ...(input.bankUnp === undefined
        ? {}
        : { bankUnp: this.nullableTrim(input.bankUnp) }),
    };

    const sellerChanged = SELLER_FIELDS.some((field) => input[field] !== undefined);
    const bankChanged = BANK_FIELDS.some((field) => input[field] !== undefined);
    const tradeChanged = TRADE_REGISTER_FIELDS.some((field) => input[field] !== undefined);

    await this.prisma.client.$transaction(async (tx) => {
      const result = await tx.legalEntitySettings.updateMany({
        where: { id: SINGLETON_ID, version: input.expectedVersion },
        data: { ...data, version: { increment: 1 } },
      });
      if (result.count === 0) {
        throw new ConflictException(OCC_CONFLICT_MESSAGE);
      }

      const auditBase = {
        actorAdminUserId: actor.actorId,
        entityType: 'LegalEntitySettings',
        entityId: String(SINGLETON_ID),
        requestId: actor.requestId,
        ipHash: hashIp(actor.ip, this.appConfig.sessionHmacSecret),
        userAgent: actor.userAgent,
      };

      if (sellerChanged) {
        await this.audit.record(
          {
            ...auditBase,
            action: 'SELLER_LEGAL_DETAILS_UPDATED' satisfies AuditAction,
            metadata: {
              fields: SELLER_FIELDS.filter((field) => input[field] !== undefined),
            },
          },
          tx,
        );
      }
      if (bankChanged) {
        await this.audit.record(
          {
            ...auditBase,
            action: 'BANK_DETAILS_UPDATED' satisfies AuditAction,
            metadata: {
              fields: BANK_FIELDS.filter((field) => input[field] !== undefined),
            },
          },
          tx,
        );
      }
      if (tradeChanged) {
        await this.audit.record(
          {
            ...auditBase,
            action: 'TRADE_REGISTER_DETAILS_UPDATED' satisfies AuditAction,
            metadata: {
              fields: TRADE_REGISTER_FIELDS.filter((field) => input[field] !== undefined),
            },
          },
          tx,
        );
      }
    });

    return this.getAdmin();
  }

  async toPublicSeller(): Promise<LegalSellerPublicDto> {
    const [entity, storefront] = await Promise.all([
      this.getOrCreate(),
      this.storefront.getPublic(),
    ]);

    return {
      brandName: storefront.brandName,
      city: storefront.city,
      siteUrl: this.appConfig.corsOrigins[0] ?? null,
      legalName: entity.legalName,
      unp: entity.unp,
      legalAddress: entity.legalAddress,
      postalCode: entity.postalCode,
      stateRegistrationDate: this.dateOnly(entity.stateRegistrationDate),
      stateRegistrationNumber: entity.stateRegistrationNumber,
      registeringAuthority: entity.registeringAuthority,
      tradeRegisterNumber: entity.tradeRegisterNumber,
      tradeRegisterDate: this.dateOnly(entity.tradeRegisterDate),
      phone: entity.sellerPhone?.trim() || storefront.phone || null,
      email: entity.sellerEmail?.trim() || storefront.email || null,
      businessHours: entity.businessHours?.trim() || storefront.workingHours || null,
      physicalStoreAddress: entity.physicalStoreAddress,
      pickupAddress: entity.pickupAddress,
      consumerClaimsContactName: entity.consumerClaimsContactName,
      consumerClaimsPhone: entity.consumerClaimsPhone,
      consumerClaimsEmail: entity.consumerClaimsEmail,
      actualOfflinePaymentDescription: entity.actualOfflinePaymentDescription,
      failedDeliveryPolicy: entity.failedDeliveryPolicy,
      substitutionNote: storefront.substitutionNote,
    };
  }

  async toPublicBank(): Promise<LegalBankPublicDto> {
    const entity = await this.getOrCreate();
    return {
      legalName: entity.legalName,
      unp: entity.unp,
      bankAccountIban: entity.bankAccountIban,
      bankName: entity.bankName,
      bankAddress: entity.bankAddress,
      bankSwift: entity.bankSwift,
      bankUnp: entity.bankUnp,
    };
  }

  toAdminDto(row: LegalEntityRow): LegalEntitySettingsDto {
    return {
      sellerType: row.sellerType,
      legalName: row.legalName,
      unp: row.unp,
      legalAddress: row.legalAddress,
      postalCode: row.postalCode,
      stateRegistrationDate: this.dateOnly(row.stateRegistrationDate),
      stateRegistrationNumber: row.stateRegistrationNumber,
      registeringAuthority: row.registeringAuthority,
      tradeRegisterNumber: row.tradeRegisterNumber,
      tradeRegisterDate: this.dateOnly(row.tradeRegisterDate),
      sellerPhone: row.sellerPhone,
      sellerEmail: row.sellerEmail,
      businessHours: row.businessHours,
      consumerClaimsContactName: row.consumerClaimsContactName,
      consumerClaimsPhone: row.consumerClaimsPhone,
      consumerClaimsEmail: row.consumerClaimsEmail,
      physicalStoreAddress: row.physicalStoreAddress,
      pickupAddress: row.pickupAddress,
      actualOfflinePaymentDescription: row.actualOfflinePaymentDescription,
      failedDeliveryPolicy: row.failedDeliveryPolicy,
      bankAccountIban: row.bankAccountIban,
      bankName: row.bankName,
      bankAddress: row.bankAddress,
      bankSwift: row.bankSwift,
      bankUnp: row.bankUnp,
      version: row.version,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private dateOnly(value: Date | null): string | null {
    if (!value) {
      return null;
    }
    return value.toISOString().slice(0, 10);
  }

  private parseOptionalDate(value: string | null): Date | null {
    if (value === null) {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    return new Date(trimmed);
  }

  private nullableTrim(value: string | null): string | null {
    if (value === null) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
}

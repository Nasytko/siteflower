/**
 * Production readiness: Belarus commerce compliance gates.
 * Exit 1 if mandatory configuration / published legal docs are missing.
 *
 * Usage (from apps/api): pnpm exec tsx scripts/compliance-check.ts
 * Or root: pnpm compliance:check
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import {
  LEGAL_DOCUMENT_KINDS,
  buildComplianceStatus,
  type LegalDocumentKind,
  type LegalEntitySettingsDto,
} from '@bouquet-one/contracts';
import { createPrismaClient } from '@bouquet-one/database';

config({ path: resolve(process.cwd(), '../../.env') });
config({ path: resolve(process.cwd(), '.env') });

function dateOnly(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL required');
    process.exit(2);
  }

  const prisma = await Promise.resolve(createPrismaClient({ connectionString: databaseUrl }));
  try {
    const [entity, storefront, fulfillment, documents] = await Promise.all([
      prisma.legalEntitySettings.findUnique({ where: { id: 1 } }),
      prisma.storefrontSettings.findUnique({ where: { id: 1 } }),
      prisma.fulfillmentSettings.findUnique({ where: { id: 1 } }),
      prisma.legalDocument.findMany({
        include: {
          versions: {
            where: { status: 'PUBLISHED' },
            take: 1,
          },
        },
      }),
    ]);

    if (!entity) {
      console.error('FAIL: legal_entity_settings row missing (run migrations)');
      process.exit(1);
    }

    const dto: LegalEntitySettingsDto = {
      sellerType: entity.sellerType,
      legalName: entity.legalName,
      unp: entity.unp,
      legalAddress: entity.legalAddress,
      postalCode: entity.postalCode,
      stateRegistrationDate: dateOnly(entity.stateRegistrationDate),
      stateRegistrationNumber: entity.stateRegistrationNumber,
      registeringAuthority: entity.registeringAuthority,
      tradeRegisterNumber: entity.tradeRegisterNumber,
      tradeRegisterDate: dateOnly(entity.tradeRegisterDate),
      sellerPhone: entity.sellerPhone,
      sellerEmail: entity.sellerEmail,
      businessHours: entity.businessHours,
      consumerClaimsContactName: entity.consumerClaimsContactName,
      consumerClaimsPhone: entity.consumerClaimsPhone,
      consumerClaimsEmail: entity.consumerClaimsEmail,
      physicalStoreAddress: entity.physicalStoreAddress,
      pickupAddress: entity.pickupAddress,
      actualOfflinePaymentDescription: entity.actualOfflinePaymentDescription,
      failedDeliveryPolicy: entity.failedDeliveryPolicy,
      bankAccountIban: entity.bankAccountIban,
      bankName: entity.bankName,
      bankAddress: entity.bankAddress,
      bankSwift: entity.bankSwift,
      bankUnp: entity.bankUnp,
      version: entity.version,
      updatedAt: entity.updatedAt.toISOString(),
    };

    const byKind = new Map(documents.map((d) => [d.kind as LegalDocumentKind, d]));
    const status = buildComplianceStatus({
      entity: dto,
      storefrontPhone: storefront?.phone ?? null,
      storefrontEmail: storefront?.email ?? null,
      storefrontHours: storefront?.workingHours ?? null,
      pickupEnabled: fulfillment?.pickupEnabled ?? true,
      documents: LEGAL_DOCUMENT_KINDS.map((kind) => {
        const row = byKind.get(kind);
        return {
          kind,
          hasPublished: Boolean(row?.versions?.length),
          hasDraft: false,
        };
      }),
    });

    console.log('Belarus commerce compliance check');
    console.log('--------------------------------');
    for (const item of status.items) {
      const mark =
        item.status === 'ok' ? 'OK ' : item.status === 'draft' ? 'DRF' : 'MIS';
      console.log(`[${mark}] ${item.label}${item.detail ? ` — ${item.detail}` : ''}`);
    }
    console.log('--------------------------------');
    console.log(
      status.readyForProduction
        ? 'PASS: ready for production (configuration complete)'
        : `FAIL: ${status.missingRequiredCount} item(s) require owner/legal action`,
    );

    if (!status.readyForProduction) {
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});

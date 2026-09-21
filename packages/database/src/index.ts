import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaClient,
  Prisma,
  AdminRole,
  AdminUserStatus,
  AuditAction,
  ProductLifecycle,
  CommercialAvailability,
  VariantStatus,
  TaxonomyVisibility,
  CollectionType,
  ComponentUnit,
  SlugEntityType,
  MediaFormat,
  FulfillmentType,
  OrderStatus,
  OrderEventType,
} from './generated/prisma/client.js';

export type { PrismaClient };
export {
  Prisma,
  AdminRole,
  AdminUserStatus,
  AuditAction,
  ProductLifecycle,
  CommercialAvailability,
  VariantStatus,
  TaxonomyVisibility,
  CollectionType,
  ComponentUnit,
  SlugEntityType,
  MediaFormat,
  FulfillmentType,
  OrderStatus,
  OrderEventType,
};

export type CreatePrismaClientOptions = {
  connectionString: string;
};

/**
 * Creates a Prisma 7 client bound to the PostgreSQL driver adapter.
 * Callers own lifecycle (connect/disconnect) — typically NestJS module providers.
 * Always async so CJS bridge and ESM consumers share one awaitable contract.
 */
export async function createPrismaClient(
  options: CreatePrismaClientOptions,
): Promise<PrismaClient> {
  const adapter = new PrismaPg({ connectionString: options.connectionString });
  return new PrismaClient({ adapter });
}

export * from './money.js';

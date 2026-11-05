/**
 * Transactional ERP SKU claim/release against erp_sku_registry.
 * Registry PK is the PostgreSQL-level global uniqueness gate (Task 04A).
 * Order snapshots never touch this table.
 */
import { ConflictException } from '@nestjs/common';
import type { ErpSkuOwnerKind, Prisma } from '@bouquet-one/database';

export const ERP_SKU_OWNER = {
  PRODUCT: 'PRODUCT' as const satisfies ErpSkuOwnerKind,
  OPTION_VALUE: 'OPTION_VALUE' as const satisfies ErpSkuOwnerKind,
  PACKAGING_ADDON: 'PACKAGING_ADDON' as const satisfies ErpSkuOwnerKind,
};

/**
 * Assign/replace/release a packaging-addon ERP SKU inside an open transaction.
 */
export async function syncPackagingAddonErpSkuRegistry(
  tx: Prisma.TransactionClient,
  addonId: string,
  previousSku: string | null,
  nextSku: string | null,
): Promise<void> {
  const plan = planErpSkuChange(previousSku, nextSku);
  if (plan.action === 'noop') return;
  if (plan.action === 'release' || plan.action === 'reassign') {
    await releaseOwner(tx, ERP_SKU_OWNER.PACKAGING_ADDON, addonId);
  }
  if (plan.next) {
    await claimSku(tx, ERP_SKU_OWNER.PACKAGING_ADDON, addonId, plan.next);
  }
}

export type ErpSkuClaim = {
  ownerKind: ErpSkuOwnerKind;
  ownerId: string;
  sku: string | null;
};

/** Pure plan: whether a save keeps, changes, or clears a SKU. */
export function planErpSkuChange(
  previous: string | null | undefined,
  next: string | null | undefined,
): { action: 'noop' | 'claim' | 'release' | 'reassign'; previous: string | null; next: string | null } {
  const prev = previous ?? null;
  const nxt = next ?? null;
  if (prev === nxt) return { action: 'noop', previous: prev, next: nxt };
  if (prev && !nxt) return { action: 'release', previous: prev, next: null };
  if (!prev && nxt) return { action: 'claim', previous: null, next: nxt };
  return { action: 'reassign', previous: prev, next: nxt };
}

function isPrismaP2002(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { code?: string }).code === 'P2002');
}

/** Duck-typed P2002 on ERP SKU targets (registry PK or denormalized erp_sku columns). */
export function isErpSkuUniqueViolation(err: unknown): boolean {
  if (!isPrismaP2002(err)) return false;
  const e = err as {
    meta?: { target?: unknown; modelName?: unknown };
    message?: string;
  };
  const target = e.meta?.target;
  const haystack = Array.isArray(target)
    ? target.join(',')
    : String(target ?? e.meta?.modelName ?? e.message ?? '');
  if (
    haystack.includes('erp_sku') ||
    haystack.includes('erp_sku_registry') ||
    haystack.includes('ErpSkuRegistry')
  ) {
    return true;
  }
  // Registry primary key is the column `sku` alone.
  if (Array.isArray(target) && target.length === 1 && target[0] === 'sku') return true;
  if (haystack === 'sku') return true;
  return false;
}

export function erpSkuConflict(sku?: string | null): ConflictException {
  return new ConflictException(
    sku
      ? `Артикул ERP «${sku}» уже используется`
      : 'Артикул ERP уже используется',
  );
}

async function releaseOwner(
  tx: Prisma.TransactionClient,
  ownerKind: ErpSkuOwnerKind,
  ownerId: string,
): Promise<void> {
  await tx.erpSkuRegistry.deleteMany({ where: { ownerKind, ownerId } });
}

async function claimSku(
  tx: Prisma.TransactionClient,
  ownerKind: ErpSkuOwnerKind,
  ownerId: string,
  sku: string,
): Promise<void> {
  try {
    await tx.erpSkuRegistry.create({
      data: { sku, ownerKind, ownerId },
    });
  } catch (err) {
    // Any unique violation on registry insert = SKU already claimed (concurrent save).
    if (isPrismaP2002(err) || isErpSkuUniqueViolation(err)) {
      throw erpSkuConflict(sku);
    }
    throw err;
  }
}

/**
 * Assign/replace/release a product ERP SKU inside an open transaction.
 * Re-saving the same SKU is a no-op (keeps registry row).
 */
export async function syncProductErpSkuRegistry(
  tx: Prisma.TransactionClient,
  productId: string,
  previousSku: string | null,
  nextSku: string | null,
): Promise<void> {
  const plan = planErpSkuChange(previousSku, nextSku);
  if (plan.action === 'noop') return;
  if (plan.action === 'release' || plan.action === 'reassign') {
    await releaseOwner(tx, ERP_SKU_OWNER.PRODUCT, productId);
  }
  if (plan.next) {
    await claimSku(tx, ERP_SKU_OWNER.PRODUCT, productId, plan.next);
  }
}

/** Drop registry rows for the given option-value owners (before replace/delete). */
export async function releaseOptionValueErpSkus(
  tx: Prisma.TransactionClient,
  optionValueIds: readonly string[],
): Promise<void> {
  if (optionValueIds.length === 0) return;
  await tx.erpSkuRegistry.deleteMany({
    where: {
      ownerKind: ERP_SKU_OWNER.OPTION_VALUE,
      ownerId: { in: [...optionValueIds] },
    },
  });
}

/** Claim registry rows for newly created option values (null sku skipped). */
export async function claimOptionValueErpSkus(
  tx: Prisma.TransactionClient,
  claims: ReadonlyArray<{ ownerId: string; sku: string | null }>,
): Promise<void> {
  for (const claim of claims) {
    if (!claim.sku) continue;
    await claimSku(tx, ERP_SKU_OWNER.OPTION_VALUE, claim.ownerId, claim.sku);
  }
}

/** Release every registry row owned by a product or its current option values. */
export async function releaseAllErpSkusForProduct(
  tx: Prisma.TransactionClient,
  productId: string,
  optionValueIds: readonly string[],
): Promise<void> {
  await releaseOwner(tx, ERP_SKU_OWNER.PRODUCT, productId);
  await releaseOptionValueErpSkus(tx, optionValueIds);
}

/**
 * Pure helpers for atomic product-editor save.
 * FIXED sale prices bind to the same variant input object that was just created —
 * never remapped by array index across separate HTTP steps.
 */
import type { PromotionType } from '@bouquet-one/contracts';

export type EditorVariantSaleBindInput = {
  createdId: string;
  status: 'ACTIVE' | 'INACTIVE';
  salePriceMinor?: string | null;
};

export function collectFixedSalePricesFromCreatedVariants(
  rows: EditorVariantSaleBindInput[],
): Array<{ variantId: string; salePriceMinor: bigint }> {
  const prices: Array<{ variantId: string; salePriceMinor: bigint }> = [];
  for (const row of rows) {
    if (row.status !== 'ACTIVE') continue;
    if (row.salePriceMinor == null || row.salePriceMinor === '') continue;
    prices.push({
      variantId: row.createdId,
      salePriceMinor: BigInt(row.salePriceMinor),
    });
  }
  return prices;
}

/**
 * Mirrors admin editor persistence rules: DB requires PERCENT ⇒ percent_off NOT NULL.
 * When disabled without a valid percent, persist FIXED + null.
 */
export function resolveEditorPromotionType(input: {
  enabled: boolean;
  type: PromotionType;
  percentOff: number | null | undefined;
}): PromotionType {
  const percentValue = input.percentOff ?? null;
  const hasValidPercent =
    percentValue !== null &&
    Number.isInteger(percentValue) &&
    percentValue >= 1 &&
    percentValue <= 99;

  if (input.type === 'PERCENT' && (input.enabled || hasValidPercent)) {
    return 'PERCENT';
  }
  if (input.type === 'FIXED') {
    return 'FIXED';
  }
  return hasValidPercent ? 'PERCENT' : 'FIXED';
}

export type VariantSyncStatus = 'ACTIVE' | 'INACTIVE';

export type VariantSyncExisting = {
  id: string;
  sortOrder: number;
};

export type VariantSyncIncoming = {
  /** Omitted, null, or blank means "not claimed by the client". */
  id?: string | null;
  name: string;
  priceMinor: bigint;
  sortOrder: number;
  status: VariantSyncStatus;
};

export type VariantSyncWrite = {
  name: string;
  priceMinor: bigint;
  sortOrder: number;
  status: VariantSyncStatus;
};

export type VariantSyncPlan = {
  updates: Array<VariantSyncWrite & { id: string }>;
  creates: VariantSyncWrite[];
  /** Populated only in `replace` mode. Editor save uses `keep-unmentioned`. */
  deleteIds: string[];
};

export class VariantSyncError extends Error {
  constructor(readonly code: 'FOREIGN_VARIANT' | 'DUPLICATE_VARIANT') {
    super(code);
    this.name = 'VariantSyncError';
  }
}

/**
 * Match an incoming variant list onto rows that already belong to the product.
 *
 * Identity is the variant id. A client id that is not in `existing` is rejected.
 * Rows without an id bind, in order, onto existing rows that were not claimed,
 * so a legacy payload that replaces the single default variant keeps that id.
 * Further unbound rows are created. `keep-unmentioned` never deletes hidden or
 * extra rows the simplified editor did not send.
 */
export function planVariantSync(
  existing: readonly VariantSyncExisting[],
  incoming: readonly VariantSyncIncoming[],
  mode: 'keep-unmentioned' | 'replace',
): VariantSyncPlan {
  const existingIds = new Set(existing.map((row) => row.id));
  const claimed = new Set<string>();
  const updates: Array<VariantSyncWrite & { id: string }> = [];
  const unbound: VariantSyncIncoming[] = [];

  for (const row of incoming) {
    const id = row.id?.trim() || null;
    if (!id) {
      unbound.push(row);
      continue;
    }
    if (!existingIds.has(id)) {
      throw new VariantSyncError('FOREIGN_VARIANT');
    }
    if (claimed.has(id)) {
      throw new VariantSyncError('DUPLICATE_VARIANT');
    }
    claimed.add(id);
    updates.push({
      id,
      name: row.name,
      priceMinor: row.priceMinor,
      sortOrder: row.sortOrder,
      status: row.status,
    });
  }

  const remaining = [...existing]
    .filter((row) => !claimed.has(row.id))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));

  const creates: VariantSyncWrite[] = [];
  for (const row of unbound) {
    const match = remaining.shift();
    if (match) {
      updates.push({
        id: match.id,
        name: row.name,
        priceMinor: row.priceMinor,
        sortOrder: row.sortOrder,
        status: row.status,
      });
      continue;
    }
    creates.push({
      name: row.name,
      priceMinor: row.priceMinor,
      sortOrder: row.sortOrder,
      status: row.status,
    });
  }

  return {
    updates,
    creates,
    deleteIds: mode === 'replace' ? remaining.map((row) => row.id) : [],
  };
}

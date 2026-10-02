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

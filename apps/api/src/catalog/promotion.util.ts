/**
 * Server-authoritative promotion pricing (Europe/Minsk schedule interpretation).
 * Browser never computes commercial truth — these helpers are used by API/checkout.
 */
import {
  applyPercentOff,
  deriveDisplayPercentOff,
  derivePriceRange,
  type PriceRangeDto,
  type ProductPromotionPublicDto,
  type PromotionType,
} from '@bouquet-one/contracts';

export type PromotionRow = {
  enabled: boolean;
  type: PromotionType;
  percentOff: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  variantPrices: Array<{ variantId: string; salePriceMinor: bigint }>;
};

export type VariantPriceInput = {
  id: string;
  priceMinor: bigint;
  status: string;
};

/** Business "now" — callers should pass Instant from Europe/Minsk wall clock when needed. */
export function isPromotionEffective(promo: PromotionRow | null | undefined, now: Date): boolean {
  if (!promo || !promo.enabled) return false;
  if (promo.startsAt && promo.startsAt.getTime() > now.getTime()) return false;
  if (promo.endsAt && promo.endsAt.getTime() <= now.getTime()) return false;
  if (promo.type === 'PERCENT') {
    return promo.percentOff != null && promo.percentOff >= 1 && promo.percentOff <= 99;
  }
  return promo.variantPrices.length > 0;
}

export function effectiveVariantPriceMinor(
  variant: VariantPriceInput,
  promo: PromotionRow | null | undefined,
  now: Date,
): bigint {
  if (!isPromotionEffective(promo, now) || !promo) return variant.priceMinor;
  if (promo.type === 'PERCENT' && promo.percentOff != null) {
    return applyPercentOff(variant.priceMinor, promo.percentOff);
  }
  const fixed = promo.variantPrices.find((v) => v.variantId === variant.id);
  if (fixed) return fixed.salePriceMinor;
  return variant.priceMinor;
}

export function buildPublicPromotionDto(
  currency: string,
  variants: VariantPriceInput[],
  promo: PromotionRow | null | undefined,
  now: Date,
): ProductPromotionPublicDto | null {
  if (!isPromotionEffective(promo, now) || !promo) return null;
  const active = variants.filter((v) => v.status === 'ACTIVE');
  if (active.length === 0) return null;

  const originalPrices = active.map((v) => v.priceMinor);
  const salePrices = active.map((v) => effectiveVariantPriceMinor(v, promo, now));

  // Only treat as promotional if at least one variant actually discounted
  const anyDiscount = active.some((v, i) => salePrices[i]! < v.priceMinor);
  if (!anyDiscount) return null;

  const originalPrice = derivePriceRange(currency, originalPrices);
  const salePrice = derivePriceRange(currency, salePrices);
  if (!originalPrice || !salePrice) return null;

  let percentOff: number | null = null;
  if (promo.type === 'PERCENT') {
    percentOff = promo.percentOff;
  } else {
    // Derive from cheapest active variant for badge display
    const cheapest = active.reduce((a, b) => (a.priceMinor <= b.priceMinor ? a : b));
    const sale = effectiveVariantPriceMinor(cheapest, promo, now);
    percentOff = deriveDisplayPercentOff(cheapest.priceMinor, sale);
  }

  return {
    type: promo.type,
    percentOff,
    originalPrice,
    salePrice,
  };
}

export type PromotionValidationIssue = { code: string; message: string; field?: string };

export function validatePromotionInput(input: {
  enabled: boolean;
  type: PromotionType;
  percentOff: number | null | undefined;
  startsAt: Date | null | undefined;
  endsAt: Date | null | undefined;
  variantSalePrices: Array<{ variantId: string; salePriceMinor: bigint }>;
  activeVariantIds: string[];
  variantRegularPrices: Map<string, bigint>;
}): PromotionValidationIssue[] {
  const issues: PromotionValidationIssue[] = [];
  if (!input.enabled) return issues;

  if (input.type === 'PERCENT') {
    if (input.percentOff == null || input.percentOff < 1 || input.percentOff > 99) {
      issues.push({
        code: 'INVALID_PERCENT',
        message: 'Процент скидки должен быть от 1 до 99',
        field: 'percentOff',
      });
    }
    if (input.variantSalePrices.length > 0) {
      issues.push({
        code: 'CONTRADICTORY_MODE',
        message: 'При процентной скидке фиксированные цены вариантов не задаются',
        field: 'variantSalePrices',
      });
    }
  } else {
    if (input.percentOff != null) {
      issues.push({
        code: 'CONTRADICTORY_MODE',
        message: 'При фиксированной цене процент не задаётся',
        field: 'percentOff',
      });
    }
    if (input.variantSalePrices.length === 0) {
      issues.push({
        code: 'FIXED_PRICES_REQUIRED',
        message: 'Укажите акционную цену хотя бы для одного варианта',
        field: 'variantSalePrices',
      });
    }
    for (const row of input.variantSalePrices) {
      if (!input.activeVariantIds.includes(row.variantId)) {
        issues.push({
          code: 'UNKNOWN_VARIANT',
          message: 'Акционная цена задана для несуществующего или неактивного варианта',
          field: 'variantSalePrices',
        });
        continue;
      }
      if (row.salePriceMinor <= 0n) {
        issues.push({
          code: 'NEGATIVE_PRICE',
          message: 'Акционная цена должна быть больше нуля',
          field: 'variantSalePrices',
        });
      }
      const regular = input.variantRegularPrices.get(row.variantId);
      if (regular != null && row.salePriceMinor >= regular) {
        issues.push({
          code: 'SALE_NOT_LOWER',
          message: 'Акционная цена должна быть ниже обычной',
          field: 'variantSalePrices',
        });
      }
    }
  }

  if (input.startsAt && input.endsAt && input.startsAt.getTime() >= input.endsAt.getTime()) {
    issues.push({
      code: 'INVALID_SCHEDULE',
      message: 'Дата начала акции должна быть раньше даты окончания',
      field: 'endsAt',
    });
  }

  return issues;
}

/** Re-export for callers that need PriceRangeDto typing nearby. */
export type { PriceRangeDto };

import {
  computeLinePriceMinor,
  type ProductOptionGroupDto,
  type ProductOptionValueDto,
  type PricedOptionSelection,
} from '@bouquet-one/contracts';

/** Resolve surcharge for a value, preferring per-variant override. */
export function resolveOptionSurchargeMinor(
  value: ProductOptionValueDto,
  variantId: string | undefined,
): bigint {
  if (variantId) {
    const override = value.variantSurcharges[variantId];
    if (override != null && override !== '') {
      try {
        const n = BigInt(override);
        return n < 0n ? 0n : n;
      } catch {
        /* fall through */
      }
    }
  }
  try {
    const n = BigInt(value.surchargeMinor);
    return n < 0n ? 0n : n;
  } catch {
    return 0n;
  }
}

/** Flatten selected value ids against product option groups for pricing/cart. */
export function buildPricedOptionSelections(input: {
  groups: ProductOptionGroupDto[];
  variantId: string | undefined;
  selectedByGroup: Record<string, string[]>;
}): PricedOptionSelection[] {
  const selections: PricedOptionSelection[] = [];
  for (const group of input.groups) {
    const picked = input.selectedByGroup[group.id] ?? [];
    for (const valueId of picked) {
      const value = group.values.find((row) => row.id === valueId && row.active);
      if (!value) continue;
      selections.push({
        groupId: group.id,
        groupName: group.name,
        valueId: value.id,
        valueName: value.name,
        surchargeMinor: resolveOptionSurchargeMinor(value, input.variantId),
        chargeMode: value.chargeMode,
      });
    }
  }
  return selections;
}

/** Client display estimate — server re-quotes at checkout. */
export function estimateOptionsTotalMinor(input: {
  groups: ProductOptionGroupDto[];
  variantId: string | undefined;
  selectedByGroup: Record<string, string[]>;
  quantity: number;
  baseUnitPriceMinor: string;
}): { optionValueIds: string[]; optionsTotalMinor: string; lineTotalMinor: string } {
  const selections = buildPricedOptionSelections(input);
  const priced = computeLinePriceMinor({
    quantity: input.quantity,
    baseUnitPriceMinor: BigInt(input.baseUnitPriceMinor),
    options: selections,
  });
  return {
    optionValueIds: selections.map((row) => row.valueId),
    optionsTotalMinor: priced.optionsTotalMinor.toString(),
    lineTotalMinor: priced.lineTotalMinor.toString(),
  };
}

export function requiredOptionsMissing(
  groups: ProductOptionGroupDto[],
  selectedByGroup: Record<string, string[]>,
): boolean {
  return groups.some((group) => {
    if (!group.required) return false;
    return (selectedByGroup[group.id] ?? []).length === 0;
  });
}

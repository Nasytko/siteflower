import {
  computeLinePriceMinor,
  resolvePackagingAddonSurchargeMinor,
  type ProductOptionGroupDto,
  type ProductOptionValueDto,
  type PricedOptionSelection,
} from '@bouquet-one/contracts';

/** Resolve surcharge for a value; TIERED uses flower/stem line total. */
export function resolveOptionSurchargeMinor(
  value: ProductOptionValueDto,
  variantId: string | undefined,
  baseLineMinor: bigint = 0n,
): bigint {
  if (value.pricingMode === 'TIERED') {
    return resolvePackagingAddonSurchargeMinor(
      {
        pricingMode: 'TIERED',
        surchargeMinor: value.surchargeMinor,
        tiers: value.tiers,
      },
      baseLineMinor,
    );
  }
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
  baseLineMinor?: bigint;
}): PricedOptionSelection[] {
  const baseLineMinor = input.baseLineMinor ?? 0n;
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
        surchargeMinor: resolveOptionSurchargeMinor(value, input.variantId, baseLineMinor),
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
  const unit = BigInt(input.baseUnitPriceMinor);
  const baseLineMinor = unit * BigInt(input.quantity);
  const selections = buildPricedOptionSelections({
    ...input,
    baseLineMinor,
  });
  const priced = computeLinePriceMinor({
    quantity: input.quantity,
    baseUnitPriceMinor: unit,
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

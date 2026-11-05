/**
 * Resolve selected product option values to priced selections for cart/order.
 */
import type {
  PackagingAddonPricingMode,
  PackagingAddonPriceTierDto,
  ProductOptionChargeMode,
  PricedOptionSelection,
} from '@bouquet-one/contracts';
import { resolvePackagingAddonSurchargeMinor } from '@bouquet-one/contracts';

export type OptionValueRow = {
  id: string;
  name: string;
  erpSku?: string | null;
  surchargeMinor: bigint;
  pricingMode: PackagingAddonPricingMode;
  tiers: PackagingAddonPriceTierDto[];
  chargeMode: ProductOptionChargeMode;
  active: boolean;
  group: {
    id: string;
    name: string;
    productId: string;
    selection: 'SINGLE' | 'MULTI';
    required: boolean;
  };
  variantPrices: Array<{ variantId: string; surchargeMinor: bigint }>;
};

export type ResolveOptionsResult =
  | { ok: true; selections: PricedOptionSelection[] }
  | { ok: false; message: string };

/**
 * Validate optionValueIds against loaded rows for a product+variant.
 * Enforces required groups and SINGLE selection cardinality.
 * `baseLineMinor` = effective unit × qty (flowers/stems only) for TIERED packaging.
 */
export function resolvePricedOptions(input: {
  productId: string;
  variantId: string;
  optionValueIds: string[] | undefined;
  values: OptionValueRow[];
  /** Flower/stem line total after promo, before options. */
  baseLineMinor?: bigint;
}): ResolveOptionsResult {
  const requested = [...new Set((input.optionValueIds ?? []).filter(Boolean))];
  const byId = new Map(input.values.map((row) => [row.id, row]));
  const baseLineMinor = input.baseLineMinor ?? 0n;

  const selections: PricedOptionSelection[] = [];
  const selectedByGroup = new Map<string, string[]>();

  for (const id of requested) {
    const row = byId.get(id);
    if (!row || !row.active) {
      return { ok: false, message: 'Выбрана недоступная опция товара' };
    }
    if (row.group.productId !== input.productId) {
      return { ok: false, message: 'Опция не принадлежит этому товару' };
    }
    let surcharge: bigint;
    if (row.pricingMode === 'TIERED') {
      surcharge = resolvePackagingAddonSurchargeMinor(
        {
          pricingMode: 'TIERED',
          surchargeMinor: row.surchargeMinor,
          tiers: row.tiers,
        },
        baseLineMinor,
      );
    } else {
      const override = row.variantPrices.find((v) => v.variantId === input.variantId);
      surcharge = override?.surchargeMinor ?? row.surchargeMinor;
    }
    selections.push({
      groupId: row.group.id,
      groupName: row.group.name,
      valueId: row.id,
      valueName: row.name,
      surchargeMinor: surcharge < 0n ? 0n : surcharge,
      chargeMode: row.chargeMode,
      erpSku: row.erpSku ?? null,
    });
    const list = selectedByGroup.get(row.group.id) ?? [];
    list.push(row.id);
    selectedByGroup.set(row.group.id, list);
  }

  // Group constraints from all known groups on the product
  const groups = new Map<string, OptionValueRow['group']>();
  for (const row of input.values) {
    groups.set(row.group.id, row.group);
  }
  for (const group of groups.values()) {
    const picked = selectedByGroup.get(group.id) ?? [];
    if (group.required && picked.length === 0) {
      return { ok: false, message: `Выберите опцию «${group.name}»` };
    }
    if (group.selection === 'SINGLE' && picked.length > 1) {
      return { ok: false, message: `Для «${group.name}» можно выбрать только одно значение` };
    }
  }

  return { ok: true, selections };
}

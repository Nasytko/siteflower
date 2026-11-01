/**
 * Resolve selected product option values to priced selections for cart/order.
 */
import type {
  ProductOptionChargeMode,
  PricedOptionSelection,
} from '@bouquet-one/contracts';

export type OptionValueRow = {
  id: string;
  name: string;
  surchargeMinor: bigint;
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
 */
export function resolvePricedOptions(input: {
  productId: string;
  variantId: string;
  optionValueIds: string[] | undefined;
  values: OptionValueRow[];
}): ResolveOptionsResult {
  const requested = [...new Set((input.optionValueIds ?? []).filter(Boolean))];
  const byId = new Map(input.values.map((row) => [row.id, row]));

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
    const override = row.variantPrices.find((v) => v.variantId === input.variantId);
    const surcharge = override?.surchargeMinor ?? row.surchargeMinor;
    selections.push({
      groupId: row.group.id,
      groupName: row.group.name,
      valueId: row.id,
      valueName: row.name,
      surchargeMinor: surcharge < 0n ? 0n : surcharge,
      chargeMode: row.chargeMode,
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

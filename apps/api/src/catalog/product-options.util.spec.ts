import { resolvePricedOptions, type OptionValueRow } from './product-options.util';

const baseValue = (overrides: Partial<OptionValueRow> & Pick<OptionValueRow, 'id' | 'name'>): OptionValueRow => ({
  id: overrides.id,
  name: overrides.name,
  erpSku: overrides.erpSku ?? null,
  surchargeMinor: overrides.surchargeMinor ?? 100n,
  chargeMode: overrides.chargeMode ?? 'PER_LINE',
  active: overrides.active ?? true,
  group: overrides.group ?? {
    id: 'g1',
    name: 'Упаковка',
    productId: 'p1',
    selection: 'SINGLE',
    required: false,
  },
  variantPrices: overrides.variantPrices ?? [],
});

describe('resolvePricedOptions', () => {
  it('applies variant surcharge override', () => {
    const result = resolvePricedOptions({
      productId: 'p1',
      variantId: 'v1',
      optionValueIds: ['o1'],
      values: [
        baseValue({
          id: 'o1',
          name: 'Крафт',
          surchargeMinor: 200n,
          variantPrices: [{ variantId: 'v1', surchargeMinor: 150n }],
        }),
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.selections[0]?.surchargeMinor).toBe(150n);
    }
  });

  it('rejects required group without selection', () => {
    const result = resolvePricedOptions({
      productId: 'p1',
      variantId: 'v1',
      optionValueIds: [],
      values: [
        baseValue({
          id: 'o1',
          name: 'Крафт',
          group: {
            id: 'g1',
            name: 'Упаковка',
            productId: 'p1',
            selection: 'SINGLE',
            required: true,
          },
        }),
      ],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects inactive option values', () => {
    const result = resolvePricedOptions({
      productId: 'p1',
      variantId: 'v1',
      optionValueIds: ['o1'],
      values: [baseValue({ id: 'o1', name: 'Крафт', active: false })],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects options belonging to another product', () => {
    const result = resolvePricedOptions({
      productId: 'p1',
      variantId: 'v1',
      optionValueIds: ['o1'],
      values: [
        baseValue({
          id: 'o1',
          name: 'Крафт',
          group: {
            id: 'g1',
            name: 'Упаковка',
            productId: 'p-other',
            selection: 'SINGLE',
            required: false,
          },
        }),
      ],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects SINGLE group with two selected values', () => {
    const group = {
      id: 'g1',
      name: 'Упаковка',
      productId: 'p1',
      selection: 'SINGLE' as const,
      required: false,
    };
    const result = resolvePricedOptions({
      productId: 'p1',
      variantId: 'v1',
      optionValueIds: ['o1', 'o2'],
      values: [
        baseValue({ id: 'o1', name: 'Крафт', group }),
        baseValue({ id: 'o2', name: 'Премиум', group }),
      ],
    });
    expect(result.ok).toBe(false);
  });

  it('passes option erpSku into priced selections', () => {
    const result = resolvePricedOptions({
      productId: 'p1',
      variantId: 'v1',
      optionValueIds: ['o1'],
      values: [baseValue({ id: 'o1', name: 'Крафт', erpSku: 'WRAP-01' })],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.selections[0]?.erpSku).toBe('WRAP-01');
    }
  });
});

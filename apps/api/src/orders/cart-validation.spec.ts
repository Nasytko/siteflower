import {
  validateCartLines,
  type VariantPriceSource,
} from './cart-validation';

function source(overrides?: {
  lifecycle?: string;
  availability?: VariantPriceSource['product']['availability'];
  variantStatus?: string;
  priceMinor?: bigint;
  effectivePriceMinor?: bigint;
  promotionType?: 'PERCENT' | 'FIXED' | null;
  name?: string;
}): VariantPriceSource {
  return {
    product: {
      id: 'p1',
      name: overrides?.name ?? 'Амели',
      slug: 'ameli',
      lifecycle: overrides?.lifecycle ?? 'PUBLISHED',
      availability: overrides?.availability ?? 'AVAILABLE',
      currency: 'BYN',
      publishAt: null,
      publishedAt: new Date('2026-01-01'),
      unpublishAt: null,
      primaryImageUrl: null,
    },
    variant: {
      id: 'v1',
      name: 'M',
      status: overrides?.variantStatus ?? 'ACTIVE',
      priceMinor: overrides?.priceMinor ?? 15900n,
      effectivePriceMinor: overrides?.effectivePriceMinor ?? overrides?.priceMinor ?? 15900n,
      promotionType: overrides?.promotionType ?? null,
    },
  };
}

describe('validateCartLines', () => {
  it('uses server price and reports PRICE_CHANGED for stale display', () => {
    const result = validateCartLines({
      lines: [{ productId: 'p1', variantId: 'v1', quantity: 1 }],
      resolve: () => source({ priceMinor: 15900n }),
      priorUnitPrices: new Map([['v1', 14900n]]),
    });
    expect(result.ok).toBe(true);
    expect(result.items[0]?.unitPriceMinor).toBe('15900');
    expect(result.subtotalMinor).toBe(15900n);
    expect(result.issues.some((i) => i.code === 'PRICE_CHANGED')).toBe(true);
    expect(result.issues.find((i) => i.code === 'PRICE_CHANGED')!.message).toMatch(
      /149,00 BYN.*159,00 BYN/,
    );
  });

  it('rejects archived product', () => {
    const result = validateCartLines({
      lines: [{ productId: 'p1', variantId: 'v1', quantity: 1 }],
      resolve: () => source({ lifecycle: 'ARCHIVED' }),
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'PRODUCT_UNAVAILABLE')).toBe(true);
  });

  it('rejects temporarily unavailable', () => {
    const result = validateCartLines({
      lines: [{ productId: 'p1', variantId: 'v1', quantity: 1 }],
      resolve: () => source({ availability: 'TEMPORARILY_UNAVAILABLE' }),
    });
    expect(result.ok).toBe(false);
  });

  it('rejects inactive variant', () => {
    const result = validateCartLines({
      lines: [{ productId: 'p1', variantId: 'v1', quantity: 1 }],
      resolve: () => source({ variantStatus: 'INACTIVE' }),
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'VARIANT_UNAVAILABLE')).toBe(true);
  });

  it('validates quantity bounds', () => {
    expect(
      validateCartLines({
        lines: [{ productId: 'p1', variantId: 'v1', quantity: 0 }],
        resolve: () => source(),
      }).ok,
    ).toBe(false);
    expect(
      validateCartLines({
        lines: [{ productId: 'p1', variantId: 'v1', quantity: 21 }],
        resolve: () => source(),
      }).ok,
    ).toBe(false);
  });

  it('allows PREORDER and SEASONAL', () => {
    for (const availability of ['PREORDER', 'SEASONAL'] as const) {
      const result = validateCartLines({
        lines: [{ productId: 'p1', variantId: 'v1', quantity: 2 }],
        resolve: () => source({ availability }),
      });
      expect(result.ok).toBe(true);
      expect(result.subtotalMinor).toBe(31800n);
    }
  });

  it('merges duplicate lines and computes integer totals', () => {
    const result = validateCartLines({
      lines: [
        { productId: 'p1', variantId: 'v1', quantity: 3 },
        { productId: 'p1', variantId: 'v1', quantity: 2 },
      ],
      resolve: () => source({ priceMinor: 1000n }),
    });
    expect(result.ok).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.quantity).toBe(5);
    expect(result.subtotalMinor).toBe(5000n);
  });

  it('charges effective promotional price and snapshots original', () => {
    const result = validateCartLines({
      lines: [{ productId: 'p1', variantId: 'v1', quantity: 2 }],
      resolve: () =>
        source({
          priceMinor: 20000n,
          effectivePriceMinor: 15000n,
          promotionType: 'PERCENT',
        }),
    });
    expect(result.ok).toBe(true);
    expect(result.items[0]?.unitPriceMinor).toBe('15000');
    expect(result.items[0]?.baseUnitPriceMinor).toBe('15000');
    expect(result.items[0]?.optionsTotalMinor).toBe('0');
    expect(result.items[0]?.originalUnitPriceMinor).toBe('20000');
    expect(result.items[0]?.promotionType).toBe('PERCENT');
    expect(result.subtotalMinor).toBe(30000n);
  });

  it('adds PER_LINE and PER_UNIT option surcharges server-side', () => {
    const result = validateCartLines({
      lines: [
        {
          productId: 'p1',
          variantId: 'v1',
          quantity: 2,
          optionValueIds: ['opt-wrap', 'opt-ribbon'],
        },
      ],
      resolve: () => source({ priceMinor: 1000n }),
      resolveOptions: () => ({
        ok: true as const,
        selections: [
          {
            groupId: 'g1',
            groupName: 'Упаковка',
            valueId: 'opt-wrap',
            valueName: 'Крафт',
            surchargeMinor: 300n,
            chargeMode: 'PER_LINE' as const,
          },
          {
            groupId: 'g2',
            groupName: 'Лента',
            valueId: 'opt-ribbon',
            valueName: 'Атлас',
            surchargeMinor: 50n,
            chargeMode: 'PER_UNIT' as const,
          },
        ],
      }),
    });
    expect(result.ok).toBe(true);
    // 2000 goods + 300 wrap + 100 ribbon = 2400
    expect(result.subtotalMinor).toBe(2400n);
    // unitPriceMinor stays variant unit (historical); options stay separate
    expect(result.items[0]?.unitPriceMinor).toBe('1000');
    expect(result.items[0]?.baseUnitPriceMinor).toBe('1000');
    expect(result.items[0]?.optionsTotalMinor).toBe('400');
    expect(result.items[0]?.lineTotalMinor).toBe('2400');
    expect(result.items[0]?.optionsSnapshot).toHaveLength(2);
  });

  it('charges PER_LINE option once for the line', () => {
    const result = validateCartLines({
      lines: [{ productId: 'p1', variantId: 'v1', quantity: 3, optionValueIds: ['opt-wrap'] }],
      resolve: () => source({ priceMinor: 1000n }),
      resolveOptions: () => ({
        ok: true as const,
        selections: [
          {
            groupId: 'g1',
            groupName: 'Упаковка',
            valueId: 'opt-wrap',
            valueName: 'Крафт',
            surchargeMinor: 300n,
            chargeMode: 'PER_LINE' as const,
          },
        ],
      }),
    });
    expect(result.ok).toBe(true);
    expect(result.items[0]?.unitPriceMinor).toBe('1000');
    expect(result.items[0]?.optionsTotalMinor).toBe('300');
    expect(result.items[0]?.lineTotalMinor).toBe('3300');
    expect(result.subtotalMinor).toBe(3300n);
  });

  it('charges PER_UNIT option times quantity', () => {
    const result = validateCartLines({
      lines: [{ productId: 'p1', variantId: 'v1', quantity: 4, optionValueIds: ['opt-ribbon'] }],
      resolve: () => source({ priceMinor: 2000n }),
      resolveOptions: () => ({
        ok: true as const,
        selections: [
          {
            groupId: 'g2',
            groupName: 'Лента',
            valueId: 'opt-ribbon',
            valueName: 'Атлас',
            surchargeMinor: 50n,
            chargeMode: 'PER_UNIT' as const,
          },
        ],
      }),
    });
    expect(result.ok).toBe(true);
    expect(result.items[0]?.unitPriceMinor).toBe('2000');
    expect(result.items[0]?.optionsTotalMinor).toBe('200');
    expect(result.items[0]?.lineTotalMinor).toBe('8200');
    expect(result.subtotalMinor).toBe(8200n);
  });

  it('keeps separate lines for different option sets; merges identical sets', () => {
    const resolveOptions = (
      _productId: string,
      _variantId: string,
      optionValueIds: string[] | undefined,
    ) => {
      const ids = [...(optionValueIds ?? [])].sort();
      if (ids.join(',') === 'opt-wrap') {
        return {
          ok: true as const,
          selections: [
            {
              groupId: 'g1',
              groupName: 'Упаковка',
              valueId: 'opt-wrap',
              valueName: 'Крафт',
              surchargeMinor: 300n,
              chargeMode: 'PER_LINE' as const,
            },
          ],
        };
      }
      return {
        ok: true as const,
        selections: [
          {
            groupId: 'g2',
            groupName: 'Лента',
            valueId: 'opt-ribbon',
            valueName: 'Атлас',
            surchargeMinor: 50n,
            chargeMode: 'PER_UNIT' as const,
          },
        ],
      };
    };

    const distinct = validateCartLines({
      lines: [
        { productId: 'p1', variantId: 'v1', quantity: 1, optionValueIds: ['opt-wrap'] },
        { productId: 'p1', variantId: 'v1', quantity: 1, optionValueIds: ['opt-ribbon'] },
      ],
      resolve: () => source({ priceMinor: 1000n }),
      resolveOptions,
    });
    expect(distinct.ok).toBe(true);
    expect(distinct.items).toHaveLength(2);

    const merged = validateCartLines({
      lines: [
        { productId: 'p1', variantId: 'v1', quantity: 2, optionValueIds: ['opt-wrap', 'opt-ribbon'] },
        { productId: 'p1', variantId: 'v1', quantity: 1, optionValueIds: ['opt-ribbon', 'opt-wrap'] },
      ],
      resolve: () => source({ priceMinor: 1000n }),
      resolveOptions: () => ({
        ok: true as const,
        selections: [
          {
            groupId: 'g1',
            groupName: 'Упаковка',
            valueId: 'opt-wrap',
            valueName: 'Крафт',
            surchargeMinor: 300n,
            chargeMode: 'PER_LINE' as const,
          },
          {
            groupId: 'g2',
            groupName: 'Лента',
            valueId: 'opt-ribbon',
            valueName: 'Атлас',
            surchargeMinor: 50n,
            chargeMode: 'PER_UNIT' as const,
          },
        ],
      }),
    });
    expect(merged.ok).toBe(true);
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0]?.quantity).toBe(3);
    // Server price only: 1000*3 + wrap 300 + ribbon 50*3 = 3450
    expect(merged.subtotalMinor).toBe(3450n);
  });

  it('rejects browser option ids when resolveOptions is unavailable', () => {
    const result = validateCartLines({
      lines: [
        { productId: 'p1', variantId: 'v1', quantity: 1, optionValueIds: ['opt-wrap'] },
      ],
      resolve: () => source({ priceMinor: 1000n }),
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'OPTION_INVALID')).toBe(true);
  });
});

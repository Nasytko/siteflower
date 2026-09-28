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
    expect(result.items[0]?.originalUnitPriceMinor).toBe('20000');
    expect(result.items[0]?.promotionType).toBe('PERCENT');
    expect(result.subtotalMinor).toBe(30000n);
  });
});

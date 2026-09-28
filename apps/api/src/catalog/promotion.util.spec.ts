import {
  buildPublicPromotionDto,
  effectiveVariantPriceMinor,
  isPromotionEffective,
  validatePromotionInput,
  type PromotionRow,
} from './promotion.util';

const now = new Date('2026-03-08T09:00:00.000Z');

const variants = [
  { id: 'v1', priceMinor: 9900n, status: 'ACTIVE' },
  { id: 'v2', priceMinor: 14_900n, status: 'ACTIVE' },
  { id: 'v3', priceMinor: 4900n, status: 'INACTIVE' },
];

function percentPromo(overrides: Partial<PromotionRow> = {}): PromotionRow {
  return {
    enabled: true,
    type: 'PERCENT',
    percentOff: 20,
    startsAt: null,
    endsAt: null,
    variantPrices: [],
    ...overrides,
  };
}

function fixedPromo(overrides: Partial<PromotionRow> = {}): PromotionRow {
  return {
    enabled: true,
    type: 'FIXED',
    percentOff: null,
    startsAt: null,
    endsAt: null,
    variantPrices: [{ variantId: 'v1', salePriceMinor: 7900n }],
    ...overrides,
  };
}

describe('isPromotionEffective', () => {
  it('ignores a missing or disabled promotion', () => {
    expect(isPromotionEffective(null, now)).toBe(false);
    expect(isPromotionEffective(percentPromo({ enabled: false }), now)).toBe(false);
  });

  it('respects the schedule window', () => {
    expect(
      isPromotionEffective(percentPromo({ startsAt: new Date('2026-03-09T00:00:00Z') }), now),
    ).toBe(false);
    expect(
      isPromotionEffective(percentPromo({ endsAt: new Date('2026-03-08T09:00:00Z') }), now),
    ).toBe(false);
    expect(
      isPromotionEffective(
        percentPromo({
          startsAt: new Date('2026-03-01T00:00:00Z'),
          endsAt: new Date('2026-03-09T00:00:00Z'),
        }),
        now,
      ),
    ).toBe(true);
  });

  it('requires a usable percent', () => {
    expect(isPromotionEffective(percentPromo({ percentOff: null }), now)).toBe(false);
    expect(isPromotionEffective(percentPromo({ percentOff: 0 }), now)).toBe(false);
    expect(isPromotionEffective(percentPromo({ percentOff: 100 }), now)).toBe(false);
  });

  it('requires at least one fixed price', () => {
    expect(isPromotionEffective(fixedPromo({ variantPrices: [] }), now)).toBe(false);
    expect(isPromotionEffective(fixedPromo(), now)).toBe(true);
  });
});

describe('effectiveVariantPriceMinor', () => {
  it('returns the regular price without an effective promotion', () => {
    expect(effectiveVariantPriceMinor(variants[0]!, null, now)).toBe(9900n);
    expect(effectiveVariantPriceMinor(variants[0]!, percentPromo({ enabled: false }), now)).toBe(
      9900n,
    );
  });

  it('applies a percentage to every variant', () => {
    expect(effectiveVariantPriceMinor(variants[0]!, percentPromo(), now)).toBe(7920n);
    expect(effectiveVariantPriceMinor(variants[1]!, percentPromo(), now)).toBe(11_920n);
  });

  it('applies fixed prices only to the listed variants', () => {
    expect(effectiveVariantPriceMinor(variants[0]!, fixedPromo(), now)).toBe(7900n);
    expect(effectiveVariantPriceMinor(variants[1]!, fixedPromo(), now)).toBe(14_900n);
  });
});

describe('buildPublicPromotionDto', () => {
  it('returns null when no promotion is effective', () => {
    expect(buildPublicPromotionDto('BYN', variants, null, now)).toBeNull();
  });

  it('prices the range from active variants only', () => {
    const dto = buildPublicPromotionDto('BYN', variants, percentPromo(), now);
    expect(dto).not.toBeNull();
    expect(dto!.type).toBe('PERCENT');
    expect(dto!.percentOff).toBe(20);
    expect(dto!.originalPrice.minMinor).toBe('9900');
    expect(dto!.salePrice.minMinor).toBe('7920');
    expect(dto!.salePrice.maxMinor).toBe('11920');
  });

  it('derives a display percent for fixed promotions', () => {
    const dto = buildPublicPromotionDto('BYN', variants, fixedPromo(), now);
    expect(dto!.type).toBe('FIXED');
    expect(dto!.percentOff).toBe(20);
    expect(dto!.salePrice.minMinor).toBe('7900');
  });

  it('is null when nothing is actually discounted', () => {
    const noDiscount = fixedPromo({
      variantPrices: [{ variantId: 'v3', salePriceMinor: 100n }],
    });
    expect(buildPublicPromotionDto('BYN', variants, noDiscount, now)).toBeNull();
  });

  it('is null without active variants', () => {
    expect(buildPublicPromotionDto('BYN', [variants[2]!], percentPromo(), now)).toBeNull();
  });
});

describe('validatePromotionInput', () => {
  const base = {
    activeVariantIds: ['v1', 'v2'],
    variantRegularPrices: new Map([
      ['v1', 9900n],
      ['v2', 14_900n],
    ]),
  };

  it('skips validation for a disabled promotion', () => {
    expect(
      validatePromotionInput({
        ...base,
        enabled: false,
        type: 'PERCENT',
        percentOff: null,
        startsAt: null,
        endsAt: null,
        variantSalePrices: [],
      }),
    ).toEqual([]);
  });

  it('rejects an out-of-range percent', () => {
    const issues = validatePromotionInput({
      ...base,
      enabled: true,
      type: 'PERCENT',
      percentOff: 0,
      startsAt: null,
      endsAt: null,
      variantSalePrices: [],
    });
    expect(issues.map((issue) => issue.code)).toEqual(['INVALID_PERCENT']);
  });

  it('rejects mixing percent and fixed prices', () => {
    const issues = validatePromotionInput({
      ...base,
      enabled: true,
      type: 'PERCENT',
      percentOff: 20,
      startsAt: null,
      endsAt: null,
      variantSalePrices: [{ variantId: 'v1', salePriceMinor: 7900n }],
    });
    expect(issues.map((issue) => issue.code)).toEqual(['CONTRADICTORY_MODE']);
  });

  it('requires at least one fixed price', () => {
    const issues = validatePromotionInput({
      ...base,
      enabled: true,
      type: 'FIXED',
      percentOff: null,
      startsAt: null,
      endsAt: null,
      variantSalePrices: [],
    });
    expect(issues.map((issue) => issue.code)).toEqual(['FIXED_PRICES_REQUIRED']);
  });

  it('rejects unknown variants and prices that are not lower', () => {
    const issues = validatePromotionInput({
      ...base,
      enabled: true,
      type: 'FIXED',
      percentOff: null,
      startsAt: null,
      endsAt: null,
      variantSalePrices: [
        { variantId: 'ghost', salePriceMinor: 5000n },
        { variantId: 'v2', salePriceMinor: 14_900n },
      ],
    });
    expect(issues.map((issue) => issue.code)).toEqual(['UNKNOWN_VARIANT', 'SALE_NOT_LOWER']);
  });

  it('rejects an inverted schedule', () => {
    const issues = validatePromotionInput({
      ...base,
      enabled: true,
      type: 'PERCENT',
      percentOff: 15,
      startsAt: new Date('2026-03-10T00:00:00Z'),
      endsAt: new Date('2026-03-09T00:00:00Z'),
      variantSalePrices: [],
    });
    expect(issues.map((issue) => issue.code)).toEqual(['INVALID_SCHEDULE']);
  });

  it('accepts a valid fixed promotion', () => {
    expect(
      validatePromotionInput({
        ...base,
        enabled: true,
        type: 'FIXED',
        percentOff: null,
        startsAt: new Date('2026-03-01T00:00:00Z'),
        endsAt: new Date('2026-03-31T00:00:00Z'),
        variantSalePrices: [{ variantId: 'v1', salePriceMinor: 7900n }],
      }),
    ).toEqual([]);
  });
});

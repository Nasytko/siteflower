import {
  isValidErpSkuFormat,
  normalizeErpSku,
  PRODUCT_KINDS,
  publicProductCompositionSummary,
} from '@bouquet-one/contracts';
import { planErpSkuChange } from './erp-sku-registry';

describe('ERP SKU identity (Task 04A)', () => {
  it('normalizes spaces, case, and empty input', () => {
    expect(normalizeErpSku('  bq-01 ')).toBe('BQ-01');
    expect(normalizeErpSku('pack 01')).toBe('PACK01');
    expect(normalizeErpSku('')).toBeNull();
    expect(normalizeErpSku('   ')).toBeNull();
    expect(isValidErpSkuFormat('BQ-01')).toBe(true);
    expect(isValidErpSkuFormat('WRAP.01_A')).toBe(true);
    expect(isValidErpSkuFormat('-x')).toBe(false);
  });

  it('does not derive ProductKind from SKU prefixes', () => {
    const sku = normalizeErpSku('STEM-99');
    expect(sku).toBe('STEM-99');
    expect((PRODUCT_KINDS as readonly string[]).includes(sku!)).toBe(false);
    expect(PRODUCT_KINDS).toContain('STEM');
  });

  it('treats missing SKU as allowed for legacy products', () => {
    expect(normalizeErpSku(null)).toBeNull();
    expect(normalizeErpSku(undefined)).toBeNull();
    expect(planErpSkuChange(null, null).action).toBe('noop');
  });

  it('public composition summary never embeds exact recipe quantities', () => {
    expect(
      publicProductCompositionSummary({
        productKind: 'BOUQUET',
        components: [
          { role: 'PRIMARY', typeName: 'Роза', quantity: 25 },
          { role: 'PRIMARY', typeName: 'Эустома', quantity: 9 },
        ],
      }),
    ).toBe('Розы, Эустомы');
    expect(
      publicProductCompositionSummary({
        productKind: 'BOUQUET',
        components: [{ role: 'PRIMARY', typeName: 'Роза', quantity: 25 }],
      }),
    ).not.toMatch(/\d/);
  });
});

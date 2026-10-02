import assert from 'node:assert/strict';
import {
  collectFixedSalePricesFromCreatedVariants,
  resolveEditorPromotionType,
} from './product-editor.util';

describe('product-editor.util', () => {
  describe('collectFixedSalePricesFromCreatedVariants', () => {
    it('binds sale prices to the created variant id from the same row object', () => {
      const prices = collectFixedSalePricesFromCreatedVariants([
        { createdId: 'aaa', status: 'ACTIVE', salePriceMinor: '1000' },
        { createdId: 'bbb', status: 'ACTIVE', salePriceMinor: '2000' },
      ]);
      expect(prices).toEqual([
        { variantId: 'aaa', salePriceMinor: 1000n },
        { variantId: 'bbb', salePriceMinor: 2000n },
      ]);
    });

    it('skips inactive variants and empty sale prices', () => {
      const prices = collectFixedSalePricesFromCreatedVariants([
        { createdId: 'aaa', status: 'INACTIVE', salePriceMinor: '1000' },
        { createdId: 'bbb', status: 'ACTIVE', salePriceMinor: null },
        { createdId: 'ccc', status: 'ACTIVE', salePriceMinor: '' },
        { createdId: 'ddd', status: 'ACTIVE', salePriceMinor: '500' },
      ]);
      expect(prices).toEqual([{ variantId: 'ddd', salePriceMinor: 500n }]);
    });

    it('does not invent ids or reorder by a separate list', () => {
      // Simulates create-loop binding: each sale price stays on its created row.
      const created = [
        { createdId: 'id-new-1', status: 'ACTIVE' as const, salePriceMinor: '900' },
        { createdId: 'id-new-2', status: 'ACTIVE' as const, salePriceMinor: '800' },
      ];
      const prices = collectFixedSalePricesFromCreatedVariants(created);
      assert.equal(prices[0]?.variantId, 'id-new-1');
      assert.equal(prices[1]?.variantId, 'id-new-2');
    });
  });

  describe('resolveEditorPromotionType', () => {
    it('keeps PERCENT when enabled with valid percent', () => {
      expect(
        resolveEditorPromotionType({ enabled: true, type: 'PERCENT', percentOff: 15 }),
      ).toBe('PERCENT');
    });

    it('falls back to FIXED when disabled without percent', () => {
      expect(
        resolveEditorPromotionType({ enabled: false, type: 'PERCENT', percentOff: null }),
      ).toBe('FIXED');
    });

    it('keeps FIXED when requested', () => {
      expect(
        resolveEditorPromotionType({ enabled: true, type: 'FIXED', percentOff: null }),
      ).toBe('FIXED');
    });
  });
});

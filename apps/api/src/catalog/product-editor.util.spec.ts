import assert from 'node:assert/strict';
import {
  collectFixedSalePricesFromCreatedVariants,
  mapNamedFixedSalesToVariantIds,
  planVariantSync,
  resolveEditorPromotionType,
  VariantSyncError,
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

    it('keeps FIXED sale prices on the same variant id after sortOrder changes', () => {
      // Runtime identity is variantId — reshuffling display order must not rematch sales.
      const before = collectFixedSalePricesFromCreatedVariants([
        { createdId: 'v-7', status: 'ACTIVE', salePriceMinor: '8900' },
        { createdId: 'v-15', status: 'ACTIVE', salePriceMinor: '11900' },
        { createdId: 'v-25', status: 'ACTIVE', salePriceMinor: '15900' },
      ]);
      const afterReorder = collectFixedSalePricesFromCreatedVariants([
        { createdId: 'v-25', status: 'ACTIVE', salePriceMinor: '15900' },
        { createdId: 'v-7', status: 'ACTIVE', salePriceMinor: '8900' },
        { createdId: 'v-15', status: 'ACTIVE', salePriceMinor: '11900' },
      ]);
      const byId = (rows: typeof before) =>
        new Map(rows.map((row) => [row.variantId, row.salePriceMinor]));
      expect(byId(afterReorder)).toEqual(byId(before));
      expect(byId(afterReorder).get('v-7')).toBe(8900n);
      expect(byId(afterReorder).get('v-15')).toBe(11900n);
      expect(byId(afterReorder).get('v-25')).toBe(15900n);
    });
  });

  describe('mapNamedFixedSalesToVariantIds', () => {
    it('resolves seed names to variantId and ignores sortOrder', () => {
      const variants = [
        { id: 'id-7', name: '7 шт', sortOrder: 2 },
        { id: 'id-15', name: '15 шт', sortOrder: 0 },
        { id: 'id-25', name: '25 шт', sortOrder: 1 },
      ];
      const prices = mapNamedFixedSalesToVariantIds(variants, [
        { name: '7 шт', salePriceMinor: 8900 },
        { name: '15 шт', salePriceMinor: 11900 },
        { name: '25 шт', salePriceMinor: 15900 },
      ]);
      expect(prices).toEqual([
        { variantId: 'id-7', salePriceMinor: 8900n },
        { variantId: 'id-15', salePriceMinor: 11900n },
        { variantId: 'id-25', salePriceMinor: 15900n },
      ]);
      // Index/sortOrder binding would have mapped 8900 → id-15 (sortOrder 0) — must not happen.
      expect(prices[0]?.variantId).not.toBe('id-15');
    });

    it('throws when a named seed variant is missing', () => {
      expect(() =>
        mapNamedFixedSalesToVariantIds([{ id: 'only', name: '7 шт' }], [
          { name: '15 шт', salePriceMinor: 1000 },
        ]),
      ).toThrow(/FIXED promo missing variant/);
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

  describe('planVariantSync', () => {
    const existing = [
      { id: 'variant-a', sortOrder: 0 },
      { id: 'variant-b', sortOrder: 1 },
      { id: 'variant-hidden', sortOrder: 2 },
    ];

    it('keeps ids when name and price change', () => {
      const plan = planVariantSync(
        existing,
        [
          {
            id: 'variant-a',
            name: 'Стандарт',
            priceMinor: 9900n,
            sortOrder: 0,
            status: 'ACTIVE',
          },
          {
            id: 'variant-b',
            name: 'Большой',
            priceMinor: 14900n,
            sortOrder: 1,
            status: 'ACTIVE',
          },
          {
            id: 'variant-hidden',
            name: 'Скрытый',
            priceMinor: 5000n,
            sortOrder: 2,
            status: 'INACTIVE',
          },
        ],
        'keep-unmentioned',
      );
      expect(plan.creates).toEqual([]);
      expect(plan.deleteIds).toEqual([]);
      expect(plan.updates.map((row) => [row.id, row.name, row.priceMinor])).toEqual([
        ['variant-a', 'Стандарт', 9900n],
        ['variant-b', 'Большой', 14900n],
        ['variant-hidden', 'Скрытый', 5000n],
      ]);
    });

    it('keeps variants the simplified editor did not send', () => {
      const plan = planVariantSync(
        existing,
        [
          {
            id: 'variant-a',
            name: 'Стандарт',
            priceMinor: 11000n,
            sortOrder: 0,
            status: 'ACTIVE',
          },
        ],
        'keep-unmentioned',
      );
      expect(plan.updates).toEqual([
        {
          id: 'variant-a',
          name: 'Стандарт',
          priceMinor: 11000n,
          sortOrder: 0,
          status: 'ACTIVE',
        },
      ]);
      expect(plan.creates).toEqual([]);
      expect(plan.deleteIds).toEqual([]);
    });

    it('binds one id-less row onto the single existing variant', () => {
      const plan = planVariantSync(
        [{ id: 'default-id', sortOrder: 0 }],
        [{ name: 'S', priceMinor: 9900n, sortOrder: 0, status: 'ACTIVE' }],
        'replace',
      );
      expect(plan.updates.map((row) => row.id)).toEqual(['default-id']);
      expect(plan.creates).toEqual([]);
      expect(plan.deleteIds).toEqual([]);
    });

    it('updates the first unmatched row and creates only the surplus', () => {
      const plan = planVariantSync(
        [{ id: 'default-id', sortOrder: 0 }],
        [
          { name: 'S', priceMinor: 9900n, sortOrder: 0, status: 'ACTIVE' },
          { name: 'L', priceMinor: 14900n, sortOrder: 1, status: 'ACTIVE' },
        ],
        'replace',
      );
      expect(plan.updates.map((row) => row.id)).toEqual(['default-id']);
      expect(plan.creates.map((row) => row.name)).toEqual(['L']);
      expect(plan.deleteIds).toEqual([]);
    });

    it('drops unmentioned rows only in replace mode', () => {
      const plan = planVariantSync(
        existing,
        [
          {
            id: 'variant-a',
            name: 'S',
            priceMinor: 100n,
            sortOrder: 0,
            status: 'ACTIVE',
          },
        ],
        'replace',
      );
      expect(plan.deleteIds).toEqual(['variant-b', 'variant-hidden']);
    });

    it('rejects an id that does not belong to the product', () => {
      expect(() =>
        planVariantSync(
          existing,
          [
            {
              id: 'foreign-variant',
              name: 'Чужой',
              priceMinor: 100n,
              sortOrder: 0,
              status: 'ACTIVE',
            },
          ],
          'keep-unmentioned',
        ),
      ).toThrow(VariantSyncError);
      try {
        planVariantSync(
          existing,
          [
            {
              id: 'foreign-variant',
              name: 'Чужой',
              priceMinor: 100n,
              sortOrder: 0,
              status: 'ACTIVE',
            },
          ],
          'keep-unmentioned',
        );
      } catch (err) {
        expect(err).toBeInstanceOf(VariantSyncError);
        expect((err as VariantSyncError).code).toBe('FOREIGN_VARIANT');
      }
    });

    it('rejects a repeated variant id', () => {
      expect(() =>
        planVariantSync(
          existing,
          [
            { id: 'variant-a', name: 'A', priceMinor: 1n, sortOrder: 0, status: 'ACTIVE' },
            { id: 'variant-a', name: 'A2', priceMinor: 2n, sortOrder: 1, status: 'ACTIVE' },
          ],
          'keep-unmentioned',
        ),
      ).toThrow(VariantSyncError);
    });
  });
});

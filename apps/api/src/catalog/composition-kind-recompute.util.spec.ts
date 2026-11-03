import { recomputeCompositionKindForFlowerTypes } from './composition-kind-recompute.util';

describe('recomputeCompositionKindForFlowerTypes', () => {
  it('batches updates by next kind and does not rewrite unchanged rows', async () => {
    const updateMany = jest.fn(async ({ where }: { where: { id: { in: string[] } } }) => ({
      count: where.id.in.length,
    }));
    const tx = {
      product: {
        findMany: jest.fn(async () => [
          {
            id: 'p-mono',
            productKind: 'BOUQUET',
            compositionKind: 'UNKNOWN',
            components: [
              {
                flowerItem: {
                  flowerTypeId: 'rose',
                  flowerType: { compositionClass: 'BLOOM' },
                },
              },
              {
                flowerItem: {
                  flowerTypeId: 'euc',
                  flowerType: { compositionClass: 'DECORATIVE' },
                },
              },
            ],
          },
          {
            id: 'p-stale-mono',
            productKind: 'BOUQUET',
            compositionKind: 'MONO',
            components: [
              {
                flowerItem: {
                  flowerTypeId: 'rose',
                  flowerType: { compositionClass: 'BLOOM' },
                },
              },
              {
                flowerItem: {
                  flowerTypeId: 'eu',
                  flowerType: { compositionClass: null },
                },
              },
            ],
          },
          {
            id: 'p-already-mono',
            productKind: 'BOUQUET',
            compositionKind: 'MONO',
            components: [
              {
                flowerItem: {
                  flowerTypeId: 'rose',
                  flowerType: { compositionClass: 'BLOOM' },
                },
              },
            ],
          },
        ]),
        updateMany,
      },
    };

    const result = await recomputeCompositionKindForFlowerTypes(tx as never, ['rose']);

    expect(result.productIds).toEqual(['p-mono', 'p-stale-mono', 'p-already-mono']);
    expect(result.updated).toBe(2);
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['p-mono'] } },
      data: { compositionKind: 'MONO' },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['p-stale-mono'] } },
      data: { compositionKind: 'UNKNOWN' },
    });
  });

  it('no-ops on empty flowerTypeIds without querying', async () => {
    const tx = { product: { findMany: jest.fn(), updateMany: jest.fn() } };
    const result = await recomputeCompositionKindForFlowerTypes(tx as never, []);
    expect(result).toEqual({ productIds: [], updated: 0 });
    expect(tx.product.findMany).not.toHaveBeenCalled();
  });

  it('forces STEM products to UNKNOWN even when bloom components would be MONO', async () => {
    const updateMany = jest.fn(async ({ where }: { where: { id: { in: string[] } } }) => ({
      count: where.id.in.length,
    }));
    const tx = {
      product: {
        findMany: jest.fn(async () => [
          {
            id: 'stem-1',
            productKind: 'STEM',
            compositionKind: 'MONO',
            components: [
              {
                flowerItem: {
                  flowerTypeId: 'rose',
                  flowerType: { compositionClass: 'BLOOM' },
                },
              },
            ],
          },
        ]),
        updateMany,
      },
    };

    const result = await recomputeCompositionKindForFlowerTypes(tx as never, ['rose']);
    expect(result.updated).toBe(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['stem-1'] } },
      data: { compositionKind: 'UNKNOWN' },
    });
  });
});

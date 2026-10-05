import { assertComponentFlowerRefXor, heightBandWhere } from '@bouquet-one/contracts';

describe('composition + stem-height invariants', () => {
  it('enforces FlowerItem XOR legacy Flower on components', () => {
    expect(assertComponentFlowerRefXor({ flowerItemId: 'item-1', flowerId: null })).toEqual({
      flowerItemId: 'item-1',
      flowerId: null,
    });
    expect(assertComponentFlowerRefXor({ flowerItemId: null, flowerId: 'flower-1' })).toEqual({
      flowerItemId: null,
      flowerId: 'flower-1',
    });
    expect(() => assertComponentFlowerRefXor({ flowerItemId: null, flowerId: null })).toThrow(
      'COMPONENT_NO_REF',
    );
    expect(() => assertComponentFlowerRefXor({ flowerItemId: 'a', flowerId: 'b' })).toThrow(
      'COMPONENT_BOTH_REFS',
    );
  });

  it('keeps stem-height bands non-overlapping at boundaries', () => {
    expect(heightBandWhere('up_to_50')).toEqual({ lte: 50 });
    expect(heightBandWhere('50_60')).toEqual({ gt: 50, lte: 60 });
    expect(heightBandWhere('60_70')).toEqual({ gt: 60, lte: 70 });
    expect(heightBandWhere('70_plus')).toEqual({ gt: 70 });

    const fifty = 50;
    const sixty = 60;
    expect(fifty <= 50).toBe(true);
    expect(!(fifty > 50 && fifty <= 60)).toBe(true);
    expect(sixty > 50 && sixty <= 60).toBe(true);
    expect(!(sixty > 60 && sixty <= 70)).toBe(true);
  });
});

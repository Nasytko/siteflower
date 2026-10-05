import { isValidProductComponentFlowerRefXor } from './product-component-xor.util';

describe('product-component-xor.util', () => {
  it('accepts flowerItemId only', () => {
    expect(isValidProductComponentFlowerRefXor({ flowerItemId: 'a', flowerId: null })).toBe(true);
  });

  it('accepts flowerId only (legacy)', () => {
    expect(isValidProductComponentFlowerRefXor({ flowerItemId: null, flowerId: 'b' })).toBe(true);
  });

  it('rejects both null', () => {
    expect(isValidProductComponentFlowerRefXor({ flowerItemId: null, flowerId: null })).toBe(false);
  });

  it('rejects both set', () => {
    expect(isValidProductComponentFlowerRefXor({ flowerItemId: 'a', flowerId: 'b' })).toBe(false);
  });
});

import { isValidProductComponentFlowerRefXor } from './product-component-xor.util';

describe('product component flower ref', () => {
  it('accepts flowerItemId', () => {
    expect(isValidProductComponentFlowerRefXor({ flowerItemId: 'a' })).toBe(true);
  });

  it('rejects missing flowerItemId', () => {
    expect(isValidProductComponentFlowerRefXor({ flowerItemId: null })).toBe(false);
    expect(isValidProductComponentFlowerRefXor({ flowerItemId: '  ' })).toBe(false);
    expect(isValidProductComponentFlowerRefXor({})).toBe(false);
  });
});

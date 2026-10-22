import { readFileSync } from 'node:fs';
import path from 'node:path';

function methodBody(source: string, signature: string, nextSignature: string): string {
  const start = source.indexOf(signature);
  const end = source.indexOf(nextSignature, start + signature.length);
  if (start < 0 || end < 0) {
    throw new Error(`Could not slice ${signature}`);
  }
  return source.slice(start, end);
}

describe('product lifecycle policy', () => {
  const products = readFileSync(path.join(__dirname, 'products.service.ts'), 'utf8');
  const orders = readFileSync(path.join(__dirname, '../orders/orders.service.ts'), 'utf8');

  it('editor save updates variants in place and does not write merchandising', () => {
    const body = methodBody(products, 'async saveEditor(', 'async setVariants(');
    expect(body).toContain("'keep-unmentioned'");
    expect(body).not.toContain('applyPromotionUpsertInTx');
    expect(body).not.toContain('setGroupsForProduct');
    expect(body).not.toContain('replaceVariantsReturning');
    expect(body).not.toContain('input.promotion');
    expect(body).not.toContain('input.groupIds');
    expect(body).not.toContain('salePriceMinor');
  });

  it('hard delete recounts orders only after the product row is locked', () => {
    const body = methodBody(products, 'async removePermanently(', 'async suggestRelatedProducts(');
    const lockAt = body.indexOf('lockProductRows');
    const countAt = body.indexOf('orderItem.count');
    const deleteAt = body.indexOf('product.delete');
    expect(lockAt).toBeGreaterThan(-1);
    expect(countAt).toBeGreaterThan(lockAt);
    expect(deleteAt).toBeGreaterThan(countAt);
  });

  it('order creation locks products before the order-number sequence and reprices there', () => {
    const createBody = methodBody(orders, 'async createOrder(', 'private async replayOrConflict(');
    const loadBody = methodBody(
      orders,
      'private async loadLockedProducts(',
      'async validateCart(',
    );
    const lockAt = createBody.indexOf('loadLockedProducts');
    const sequenceAt = createBody.indexOf('orderNumberSequence');
    expect(loadBody).toContain('lockProductRows');
    expect(lockAt).toBeGreaterThan(-1);
    expect(sequenceAt).toBeGreaterThan(lockAt);
    expect(createBody.indexOf('fresh.subtotalMinor')).toBeGreaterThan(lockAt);
    expect(createBody.indexOf('fresh.items')).toBeGreaterThan(lockAt);
  });
});

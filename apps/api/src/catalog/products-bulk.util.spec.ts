import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { BULK_PRODUCTS_MAX_ITEMS, assertBulkItemsShape, mapBulkItemError } from './products-bulk.util';

describe('products-bulk.util', () => {
  describe('assertBulkItemsShape', () => {
    it('rejects empty batch', () => {
      expect(() => assertBulkItemsShape([])).toThrow(/at least one/i);
    });

    it('rejects oversized batch', () => {
      const items = Array.from({ length: BULK_PRODUCTS_MAX_ITEMS + 1 }, (_, i) => ({
        productId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      }));
      expect(() => assertBulkItemsShape(items)).toThrow(/не более/);
    });

    it('rejects duplicate product ids', () => {
      const id = '11111111-1111-4111-8111-111111111111';
      expect(() => assertBulkItemsShape([{ productId: id }, { productId: id }])).toThrow(
        /Duplicate productId/,
      );
    });

    it('accepts valid batch', () => {
      expect(() =>
        assertBulkItemsShape([
          { productId: '11111111-1111-4111-8111-111111111111' },
          { productId: '22222222-2222-4222-8222-222222222222' },
        ]),
      ).not.toThrow();
    });
  });

  describe('mapBulkItemError', () => {
    it('maps 404 / 409 / 400', () => {
      expect(mapBulkItemError('p1', new NotFoundException('Product not found')).status).toBe(
        'NOT_FOUND',
      );
      expect(mapBulkItemError('p1', new ConflictException('OCC')).status).toBe('CONFLICT');
      expect(mapBulkItemError('p1', new BadRequestException('bad')).status).toBe(
        'VALIDATION_ERROR',
      );
    });

    it('maps unknown errors to FAILED', () => {
      expect(mapBulkItemError('p1', new Error('boom')).status).toBe('FAILED');
    });
  });
});

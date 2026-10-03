/**
 * Pure helpers for bulk product orchestration (limits, error → item status).
 */
import {
  BULK_PRODUCTS_MAX_ITEMS,
  type BulkItemStatus,
  type BulkProductItemResultDto,
} from '@bouquet-one/contracts';
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';

export { BULK_PRODUCTS_MAX_ITEMS };

export function assertBulkItemsShape(items: ReadonlyArray<{ productId: string }>): void {
  if (items.length === 0) {
    throw new BadRequestException('Select at least one product');
  }
  if (items.length > BULK_PRODUCTS_MAX_ITEMS) {
    throw new BadRequestException(
      `Можно выбрать не более ${BULK_PRODUCTS_MAX_ITEMS} товаров за одну операцию`,
    );
  }
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.productId)) {
      throw new BadRequestException('Duplicate productId in bulk request');
    }
    seen.add(item.productId);
  }
}

function messageFromHttpException(err: HttpException): string {
  const body = err.getResponse();
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object') {
    const message = (body as { message?: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.map(String).join('; ');
  }
  return err.message || 'Request failed';
}

export function mapBulkItemError(productId: string, err: unknown): BulkProductItemResultDto {
  if (err instanceof HttpException) {
    const statusCode = err.getStatus();
    const message = messageFromHttpException(err);
    let status: BulkItemStatus = 'FAILED';
    if (statusCode === HttpStatus.NOT_FOUND) status = 'NOT_FOUND';
    else if (statusCode === HttpStatus.FORBIDDEN) status = 'FORBIDDEN';
    else if (statusCode === HttpStatus.CONFLICT) status = 'CONFLICT';
    else if (statusCode === HttpStatus.BAD_REQUEST) status = 'VALIDATION_ERROR';

    return {
      productId,
      status,
      message:
        status === 'CONFLICT'
          ? 'Товар был изменён в другом окне. Обновите данные.'
          : message,
    };
  }

  return {
    productId,
    status: 'FAILED',
    message: 'Не удалось обновить товар',
  };
}

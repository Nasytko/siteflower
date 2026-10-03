import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  roleHasPermission,
  type AdminRole,
  type BulkProductItemResultDto,
  type BulkProductOperationResultDto,
} from '@bouquet-one/contracts';
import type { ActorContext } from '../common/actor.util';
import { StorefrontRevalidateService } from '../storefront/storefront-revalidate.service';
import type { BulkProductsDto } from './products-bulk.dto';
import { assertBulkItemsShape, mapBulkItemError } from './products-bulk.util';
import { ProductsService } from './products.service';

const MUTATION_OPTS = { deferStorefrontRevalidate: true, bulk: true } as const;

@Injectable()
export class ProductsBulkService {
  constructor(
    private readonly products: ProductsService,
    private readonly revalidate: StorefrontRevalidateService,
  ) {}

  async execute(
    input: BulkProductsDto,
    actor: ActorContext,
    role: AdminRole,
  ): Promise<BulkProductOperationResultDto> {
    this.assertPermission(input.operation, role);
    assertBulkItemsShape(input.items);

    if (input.operation === 'SET_AVAILABILITY' && !input.availability) {
      throw new BadRequestException('availability is required');
    }

    const results: BulkProductItemResultDto[] = [];

    for (const item of input.items) {
      try {
        const dto = await this.applyItem(input, item.productId, item.expectedVersion, actor);
        results.push({
          productId: item.productId,
          status: 'SUCCESS',
          version: dto.version,
          availability: dto.availability,
          lifecycle: dto.lifecycle,
        });
      } catch (err) {
        results.push(mapBulkItemError(item.productId, err));
      }
    }

    const succeeded = results.filter((row) => row.status === 'SUCCESS').length;
    if (succeeded > 0) {
      // Fail-soft catalog-wide revalidation (no N× per-product HTTP).
      await this.revalidate.ping({
        tags: ['catalog', 'storefront'],
        paths: ['/', '/bukety'],
      });
    }

    return {
      operation: input.operation,
      total: results.length,
      succeeded,
      failed: results.length - succeeded,
      results,
    };
  }

  private assertPermission(
    operation: BulkProductsDto['operation'],
    role: AdminRole,
  ): void {
    if (operation === 'SET_AVAILABILITY') {
      if (!roleHasPermission(role, 'CATALOG_UPDATE')) {
        throw new ForbiddenException('Insufficient permissions');
      }
      return;
    }
    if (!roleHasPermission(role, 'CATALOG_PUBLISH')) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  private applyItem(
    input: BulkProductsDto,
    productId: string,
    expectedVersion: number,
    actor: ActorContext,
  ) {
    if (input.operation === 'PUBLISH') {
      return this.products.publish(productId, { expectedVersion }, actor, MUTATION_OPTS);
    }
    if (input.operation === 'UNPUBLISH') {
      return this.products.unpublish(productId, expectedVersion, actor, MUTATION_OPTS);
    }
    return this.products.update(
      productId,
      { expectedVersion, availability: input.availability! },
      actor,
      MUTATION_OPTS,
    );
  }
}

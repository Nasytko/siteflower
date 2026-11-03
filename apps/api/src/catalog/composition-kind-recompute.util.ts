import {
  deriveCompositionKind,
  resolveStoredCompositionKind,
  type CompositionKind,
  type ProductKind,
} from '@bouquet-one/contracts';
import type { Prisma } from '@bouquet-one/database';

/**
 * Refresh Product.compositionKind for floral products that use FlowerItems of the
 * given FlowerType ids. Scoped query (not full catalog). Batches DB writes by kind.
 *
 * Call in the same transaction as:
 * - FlowerType.compositionClass change
 * - FlowerItem.flowerTypeId change / variety move between types
 *
 * Product composition save updates compositionKind directly (no need to call this).
 */
export async function recomputeCompositionKindForFlowerTypes(
  tx: Prisma.TransactionClient,
  flowerTypeIds: readonly string[],
): Promise<{ productIds: string[]; updated: number }> {
  const typeIds = [...new Set(flowerTypeIds.map((id) => id.trim()).filter(Boolean))];
  if (typeIds.length === 0) {
    return { productIds: [], updated: 0 };
  }

  const products = await tx.product.findMany({
    where: {
      productKind: { in: ['BOUQUET', 'COMPOSITION', 'STEM'] },
      components: {
        some: { flowerItem: { flowerTypeId: { in: typeIds } } },
      },
    },
    select: {
      id: true,
      productKind: true,
      compositionKind: true,
      components: {
        select: {
          flowerItem: {
            select: {
              flowerTypeId: true,
              flowerType: { select: { compositionClass: true } },
            },
          },
        },
      },
    },
  });

  const productIds = products.map((p) => p.id);
  const byNextKind = new Map<CompositionKind, string[]>();

  for (const product of products) {
    const derived = deriveCompositionKind(
      product.components.map((row) => ({
        typeId: row.flowerItem.flowerTypeId,
        flowerItem: {
          flowerTypeId: row.flowerItem.flowerTypeId,
          flowerType: row.flowerItem.flowerType,
        },
      })),
    );
    const next = resolveStoredCompositionKind(product.productKind as ProductKind, derived);
    if (next === product.compositionKind) continue;
    const bucket = byNextKind.get(next) ?? [];
    bucket.push(product.id);
    byNextKind.set(next, bucket);
  }

  // Chunk large id lists to keep updateMany payloads bounded (same TX).
  const CHUNK = 500;
  let updated = 0;
  for (const [compositionKind, ids] of byNextKind) {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const result = await tx.product.updateMany({
        where: { id: { in: slice } },
        data: { compositionKind },
      });
      updated += result.count;
    }
  }

  return { productIds, updated };
}

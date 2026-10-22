/**
 * Row lock shared by order creation and permanent product deletion.
 * PostgreSQL address: `products.id`, taken in sorted id order.
 *
 * Callers that also lock `order_number_sequences` must do that only after
 * every product lock. A later multi-product delete must pass the full id set
 * here rather than locking products one transaction at a time in caller order.
 */
export const PRODUCT_ROW_LOCK_SQL =
  'SELECT id FROM products WHERE id = CAST($1 AS uuid) FOR UPDATE';

type LockClient = {
  $queryRawUnsafe(query: string, ...values: unknown[]): PromiseLike<unknown>;
};

export async function lockProductRows(
  tx: LockClient,
  productIds: readonly string[],
): Promise<string[]> {
  const ordered = [...new Set(productIds.map((id) => id.trim()).filter((id) => id.length > 0))].sort();
  const locked: string[] = [];
  for (const id of ordered) {
    const rows = (await tx.$queryRawUnsafe(PRODUCT_ROW_LOCK_SQL, id)) as Array<{ id: string }>;
    if (rows[0]) locked.push(rows[0].id);
  }
  return locked;
}

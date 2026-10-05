/**
 * SQL predicate for ProductComponent flower ref XOR (mirrors DB CHECK).
 * Exactly one of flowerItemId / flowerId must be non-null.
 */
export function isValidProductComponentFlowerRefXor(input: {
  flowerItemId?: string | null;
  flowerId?: string | null;
}): boolean {
  const hasItem = Boolean(input.flowerItemId);
  const hasLegacy = Boolean(input.flowerId);
  return hasItem !== hasLegacy;
}

/** Audit WHERE clause text (PostgreSQL) for invalid XOR rows. */
export const PRODUCT_COMPONENT_XOR_INVALID_SQL = `(
  ("flower_item_id" IS NULL AND "flower_id" IS NULL)
  OR ("flower_item_id" IS NOT NULL AND "flower_id" IS NOT NULL)
)`;

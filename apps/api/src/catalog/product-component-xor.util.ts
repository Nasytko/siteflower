/**
 * ProductComponent must reference a FlowerItem (mirrors DB NOT NULL).
 */
export function isValidProductComponentFlowerRefXor(input: {
  flowerItemId?: string | null;
}): boolean {
  return Boolean(input.flowerItemId?.trim());
}

/** Audit WHERE clause text (PostgreSQL) for missing FlowerItem refs. */
export const PRODUCT_COMPONENT_XOR_INVALID_SQL = `("flower_item_id" IS NULL)`;

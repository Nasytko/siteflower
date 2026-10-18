-- Additive: Product.productKind for editor UX (composition vs gift/plant).
-- diameter_cm retained (deprecated in UI only).

CREATE TYPE "ProductKind" AS ENUM (
  'BOUQUET',
  'COMPOSITION',
  'STEM',
  'PLANT',
  'GIFT',
  'OTHER'
);

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "product_kind" "ProductKind" NOT NULL DEFAULT 'BOUQUET';

CREATE INDEX IF NOT EXISTS "products_product_kind_lifecycle_idx"
  ON "products"("product_kind", "lifecycle");

-- Heuristic backfill from catalog category listing_kind when present.
UPDATE "products" p
SET "product_kind" = CASE c."listing_kind"
  WHEN 'COMPOSITIONS' THEN 'COMPOSITION'::"ProductKind"
  WHEN 'FLOWERS' THEN 'STEM'::"ProductKind"
  WHEN 'GIFTS' THEN 'GIFT'::"ProductKind"
  WHEN 'BOUQUETS' THEN 'BOUQUET'::"ProductKind"
  ELSE p."product_kind"
END
FROM "catalog_categories" c
WHERE p."catalog_category_id" = c."id"
  AND c."listing_kind" IS NOT NULL;

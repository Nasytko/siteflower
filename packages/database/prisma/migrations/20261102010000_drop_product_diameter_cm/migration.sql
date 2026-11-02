-- Task 05: archive then drop deprecated Product.diameter_cm.
-- Editor no longer writes this field; public API never exposed it.
-- Non-NULL values are preserved in _archive_product_diameter_cm before DROP.
--
-- Read-only inventory (ops, before/after):
--   SELECT count(*) AS non_null_diameter
--   FROM products
--   WHERE diameter_cm IS NOT NULL;

CREATE TABLE IF NOT EXISTS "_archive_product_diameter_cm" (
  "product_id" UUID PRIMARY KEY,
  "diameter_cm" INTEGER NOT NULL,
  "archived_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name = 'diameter_cm'
  ) THEN
    INSERT INTO "_archive_product_diameter_cm" ("product_id", "diameter_cm")
    SELECT "id", "diameter_cm"
    FROM "products"
    WHERE "diameter_cm" IS NOT NULL
    ON CONFLICT ("product_id") DO NOTHING;
  END IF;
END $$;

ALTER TABLE "products" DROP COLUMN IF EXISTS "diameter_cm";

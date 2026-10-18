-- Drop legacy Flower taxonomy, BouquetSize, ProductLine, and deprecated Product flower FKs.
-- Blocks if any product_components still reference flower_id without flower_item_id.

DO $$
DECLARE
  legacy_count INTEGER;
  sample_ids TEXT;
BEGIN
  SELECT COUNT(*)::INTEGER INTO legacy_count
  FROM "product_components"
  WHERE "flower_item_id" IS NULL;

  IF legacy_count > 0 THEN
    SELECT string_agg(id::text, ', ' ORDER BY id)
    INTO sample_ids
    FROM (
      SELECT id
      FROM "product_components"
      WHERE "flower_item_id" IS NULL
      ORDER BY id
      LIMIT 20
    ) bad;

    RAISE EXCEPTION
      'Cannot drop legacy flower refs: % product_components row(s) lack flower_item_id. Sample ids: %. Migrate composition to FlowerItem first.',
      legacy_count,
      COALESCE(sample_ids, '(none)');
  END IF;
END $$;

-- Drop XOR check before altering columns.
ALTER TABLE "product_components" DROP CONSTRAINT IF EXISTS "product_components_flower_ref_xor";

-- ProductComponent → FlowerItem only.
ALTER TABLE "product_components" DROP CONSTRAINT IF EXISTS "product_components_flower_id_fkey";
DROP INDEX IF EXISTS "product_components_flower_id_idx";
ALTER TABLE "product_components" DROP COLUMN IF EXISTS "flower_id";
ALTER TABLE "product_components" ALTER COLUMN "flower_item_id" SET NOT NULL;

-- Product: drop bouquet size + deprecated flower type/variety/origin FKs.
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_bouquet_size_id_fkey";
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_flower_type_id_fkey";
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_flower_variety_id_fkey";
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_flower_origin_id_fkey";
DROP INDEX IF EXISTS "products_bouquet_size_id_idx";
DROP INDEX IF EXISTS "products_flower_type_id_lifecycle_idx";
DROP INDEX IF EXISTS "products_flower_variety_id_lifecycle_idx";
DROP INDEX IF EXISTS "products_flower_origin_id_lifecycle_idx";
ALTER TABLE "products" DROP COLUMN IF EXISTS "bouquet_size_id";
ALTER TABLE "products" DROP COLUMN IF EXISTS "flower_type_id";
ALTER TABLE "products" DROP COLUMN IF EXISTS "flower_variety_id";
ALTER TABLE "products" DROP COLUMN IF EXISTS "flower_origin_id";

-- ProductLine M2M + table.
DROP TABLE IF EXISTS "product_product_lines";
DROP TABLE IF EXISTS "product_lines";

-- BouquetSize table.
DROP TABLE IF EXISTS "bouquet_sizes";

-- Legacy Flower table.
DROP TABLE IF EXISTS "flowers";

-- Filter pool: remove bouquet_size definition and category links.
DELETE FROM "catalog_category_filters"
WHERE "definition_id" IN (
  SELECT id FROM "catalog_filter_definitions" WHERE "key" = 'bouquet_size'
);
DELETE FROM "catalog_filter_definitions" WHERE "key" = 'bouquet_size';

-- Slug redirects for removed entity types.
DELETE FROM "slug_redirects" WHERE "entity_type"::text IN ('FLOWER', 'BOUQUET_SIZE');

-- Rebuild SlugEntityType enum without FLOWER / BOUQUET_SIZE.
CREATE TYPE "SlugEntityType_new" AS ENUM ('PRODUCT', 'OCCASION', 'RECIPIENT', 'COLOR', 'CATALOG_CATEGORY');
ALTER TABLE "slug_redirects" ALTER COLUMN "entity_type" TYPE "SlugEntityType_new" USING ("entity_type"::text::"SlugEntityType_new");
DROP TYPE "SlugEntityType";
ALTER TYPE "SlugEntityType_new" RENAME TO "SlugEntityType";

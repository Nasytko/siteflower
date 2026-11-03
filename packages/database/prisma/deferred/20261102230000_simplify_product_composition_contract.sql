-- CONTRACT (BLOCKED — do not apply until staging inventory + FlowerType.composition_class
-- classification are verified and owner approves).
-- Not part of prisma/migrations — will not run via migrate deploy.
--
-- Preconditions:
-- 1. Expand migration 20261102220000_flower_type_composition_class applied.
-- 2. Read-only inventory reviewed (ops/inventory-composition-simplify-staging.sql).
-- 3. Every FlowerType used on published floral products has composition_class set
--    OR product composition_kind UNKNOWN is accepted for those products.
-- 4. Equivalence check: sample MONO/MIXED pages vs new deriveCompositionKind.
-- 5. Explicit operator approval.
--
-- This script: archives legacy columns, dedupes components, drops qty/role/unit/color/displayName
-- and product precision fields, adds unique(product_id, flower_item_id), recomputes composition_kind,
-- disables quantity facet, strips qty/dominant catalog rules (DRAFT if published).
-- DOES NOT auto-set flower_types.composition_class from ComponentRole.

-- BEGIN; -- run inside a transaction on a restored staging copy first

CREATE TABLE IF NOT EXISTS "_archive_product_components_pre_simplify" (
  "archived_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "flower_item_id" UUID,
  "color_id" UUID,
  "role" TEXT,
  "display_name" TEXT,
  "quantity" INT,
  "unit" TEXT,
  "sort_order" INT,
  "created_at" TIMESTAMPTZ(3),
  "updated_at" TIMESTAMPTZ(3)
);

CREATE TABLE IF NOT EXISTS "_archive_product_composition_meta_pre_simplify" (
  "archived_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "product_id" UUID NOT NULL,
  "composition_kind" TEXT,
  "composition_precision" TEXT,
  "composition_primary_complete" BOOLEAN,
  "composition_text" TEXT
);

CREATE TABLE IF NOT EXISTS "_archive_catalog_rules_qty_filters_pre_simplify" (
  "archived_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "category_id" UUID NOT NULL,
  "slug" TEXT,
  "page_status" TEXT,
  "rules" JSONB NOT NULL,
  "action" TEXT NOT NULL
);

INSERT INTO "_archive_product_components_pre_simplify" (
  "id", "product_id", "flower_item_id", "color_id", "role", "display_name",
  "quantity", "unit", "sort_order", "created_at", "updated_at"
)
SELECT
  "id", "product_id", "flower_item_id", "color_id", "role"::text, "display_name",
  "quantity", "unit"::text, "sort_order", "created_at", "updated_at"
FROM "product_components";

INSERT INTO "_archive_product_composition_meta_pre_simplify" (
  "product_id", "composition_kind", "composition_precision",
  "composition_primary_complete", "composition_text"
)
SELECT
  "id",
  "composition_kind"::text,
  "composition_precision"::text,
  "composition_primary_complete",
  "composition_text"
FROM "products"
WHERE EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'products' AND column_name = 'composition_precision'
);

DELETE FROM "product_components"
WHERE "flower_item_id" IS NULL
   OR NOT EXISTS (
     SELECT 1 FROM "flower_items" fi WHERE fi."id" = "product_components"."flower_item_id"
   );

DELETE FROM "product_components" pc
USING (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "product_id", "flower_item_id"
      ORDER BY "sort_order" ASC, "created_at" ASC, "id" ASC
    ) AS rn
  FROM "product_components"
) ranked
WHERE pc."id" = ranked."id" AND ranked.rn > 1;

DROP INDEX IF EXISTS "product_components_product_id_role_idx";
DROP INDEX IF EXISTS "product_components_color_id_idx";
ALTER TABLE "product_components" DROP CONSTRAINT IF EXISTS "product_components_color_id_fkey";

ALTER TABLE "product_components"
  DROP COLUMN IF EXISTS "color_id",
  DROP COLUMN IF EXISTS "role",
  DROP COLUMN IF EXISTS "display_name",
  DROP COLUMN IF EXISTS "quantity",
  DROP COLUMN IF EXISTS "unit";

CREATE UNIQUE INDEX IF NOT EXISTS "product_components_product_id_flower_item_id_key"
  ON "product_components"("product_id", "flower_item_id");

ALTER TABLE "products"
  DROP COLUMN IF EXISTS "composition_precision",
  DROP COLUMN IF EXISTS "composition_primary_complete",
  DROP COLUMN IF EXISTS "composition_text";

-- Recompute composition_kind from composition_class (null class → UNKNOWN)
UPDATE "products" p
SET "composition_kind" = 'UNKNOWN'
WHERE p."product_kind" NOT IN ('BOUQUET', 'COMPOSITION', 'STEM');

UPDATE "products" p
SET "composition_kind" = sub.kind::"CompositionKind"
FROM (
  SELECT
    pc."product_id" AS product_id,
    CASE
      WHEN BOOL_OR(ft."composition_class" IS NULL) THEN 'UNKNOWN'
      WHEN COUNT(DISTINCT CASE WHEN ft."composition_class" = 'BLOOM' THEN fi."flower_type_id" END) = 1
        THEN 'MONO'
      WHEN COUNT(DISTINCT CASE WHEN ft."composition_class" = 'BLOOM' THEN fi."flower_type_id" END) >= 2
        THEN 'MIXED'
      ELSE 'UNKNOWN'
    END AS kind
  FROM "product_components" pc
  INNER JOIN "flower_items" fi ON fi."id" = pc."flower_item_id"
  INNER JOIN "flower_types" ft ON ft."id" = fi."flower_type_id"
  GROUP BY pc."product_id"
) sub
WHERE p."id" = sub.product_id
  AND p."product_kind" IN ('BOUQUET', 'COMPOSITION', 'STEM');

UPDATE "products" p
SET "composition_kind" = 'UNKNOWN'
WHERE p."product_kind" IN ('BOUQUET', 'COMPOSITION', 'STEM')
  AND NOT EXISTS (SELECT 1 FROM "product_components" pc WHERE pc."product_id" = p."id");

INSERT INTO "_archive_catalog_rules_qty_filters_pre_simplify" (
  "category_id", "slug", "page_status", "rules", "action"
)
SELECT
  c."id", c."slug", c."page_status"::text, c."rules",
  CASE WHEN c."page_status" = 'PUBLISHED' THEN 'DRAFT_AND_STRIP_QTY_FILTERS' ELSE 'STRIP_QTY_FILTERS' END
FROM "catalog_categories" c
WHERE c."rules" ?| ARRAY[
  'minFlowerTypeQuantity', 'flowerTypeQuantitySlug', 'dominantFlowerTypeSlug',
  'min_flower_type_quantity', 'flower_type_quantity_slug', 'dominant_flower_type_slug'
];

UPDATE "catalog_categories" c
SET
  "page_status" = CASE WHEN c."page_status" = 'PUBLISHED' THEN 'DRAFT'::"SeoLandingStatus" ELSE c."page_status" END,
  "published_at" = CASE WHEN c."page_status" = 'PUBLISHED' THEN NULL ELSE c."published_at" END,
  "rules" = (c."rules"
    - 'minFlowerTypeQuantity' - 'flowerTypeQuantitySlug' - 'dominantFlowerTypeSlug'
    - 'min_flower_type_quantity' - 'flower_type_quantity_slug' - 'dominant_flower_type_slug')
WHERE c."rules" ?| ARRAY[
  'minFlowerTypeQuantity', 'flowerTypeQuantitySlug', 'dominantFlowerTypeSlug',
  'min_flower_type_quantity', 'flower_type_quantity_slug', 'dominant_flower_type_slug'
];

UPDATE "catalog_filter_definitions"
SET "supported" = false, "label" = 'Количество (снято — рецептура в ERP)', "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'quantity';

UPDATE "catalog_filter_definitions"
SET
  "description" = 'Моно / смешанный — по FlowerType.composition_class (BLOOM); NULL class → UNKNOWN',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'composition_kind';

DROP TYPE IF EXISTS "ComponentRole";
DROP TYPE IF EXISTS "ComponentUnit";
DROP TYPE IF EXISTS "CompositionPrecision";

-- COMMIT;

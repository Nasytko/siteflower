-- Catalog simplification: drop Category/Style/Collection; add BouquetSize,
-- BudgetRange, ProductPromotion, BestsellerGroup; clean SlugEntityType/AuditAction.

-- ---------------------------------------------------------------------------
-- 1. New enums
-- ---------------------------------------------------------------------------

CREATE TYPE "PromotionType" AS ENUM ('PERCENT', 'FIXED');

-- ---------------------------------------------------------------------------
-- 2. New tables
-- ---------------------------------------------------------------------------

CREATE TABLE "bouquet_sizes" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "visibility" "TaxonomyVisibility" NOT NULL DEFAULT 'VISIBLE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "bouquet_sizes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bouquet_sizes_slug_key" ON "bouquet_sizes"("slug");
CREATE INDEX "bouquet_sizes_visibility_sort_order_idx" ON "bouquet_sizes"("visibility", "sort_order");

CREATE TABLE "budget_ranges" (
    "id" UUID NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "min_minor" BIGINT,
    "max_minor" BIGINT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "budget_ranges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "budget_ranges_active_sort_order_idx" ON "budget_ranges"("active", "sort_order");

CREATE TABLE "product_promotions" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "type" "PromotionType" NOT NULL,
    "percent_off" INTEGER,
    "starts_at" TIMESTAMPTZ(3),
    "ends_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "product_promotions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_promotions_product_id_key" ON "product_promotions"("product_id");
CREATE INDEX "product_promotions_enabled_starts_at_ends_at_idx" ON "product_promotions"("enabled", "starts_at", "ends_at");

CREATE TABLE "product_promotion_variant_prices" (
    "promotion_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "sale_price_minor" BIGINT NOT NULL,
    CONSTRAINT "product_promotion_variant_prices_pkey" PRIMARY KEY ("promotion_id", "variant_id")
);

CREATE INDEX "product_promotion_variant_prices_variant_id_idx" ON "product_promotion_variant_prices"("variant_id");

CREATE TABLE "bestseller_groups" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "title" VARCHAR(160),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "bestseller_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bestseller_groups_slug_key" ON "bestseller_groups"("slug");
CREATE INDEX "bestseller_groups_active_sort_order_idx" ON "bestseller_groups"("active", "sort_order");

CREATE TABLE "bestseller_group_products" (
    "group_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "bestseller_group_products_pkey" PRIMARY KEY ("group_id", "product_id")
);

CREATE INDEX "bestseller_group_products_group_id_sort_order_idx" ON "bestseller_group_products"("group_id", "sort_order");
CREATE INDEX "bestseller_group_products_product_id_idx" ON "bestseller_group_products"("product_id");

-- ---------------------------------------------------------------------------
-- 3. Seed default bouquet sizes + migrate featured → bestsellers
-- ---------------------------------------------------------------------------

INSERT INTO "bouquet_sizes" ("id", "slug", "name", "description", "sort_order", "visibility", "version", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'malenkij', 'Маленький', 'Компактный букет', 10, 'VISIBLE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'srednij', 'Средний', 'Универсальный размер', 20, 'VISIBLE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'bolshoj', 'Большой', 'Выразительный букет', 30, 'VISIBLE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ochen-bolshoj', 'Очень большой', 'Максимальный размер', 40, 'VISIBLE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "budget_ranges" ("id", "label", "min_minor", "max_minor", "sort_order", "active", "version", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'До 80 BYN', NULL, 8000, 10, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '80–120 BYN', 8000, 12000, 20, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '120–180 BYN', 12000, 18000, 30, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '180–250 BYN', 18000, 25000, 40, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'От 250 BYN', 25000, NULL, 50, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Default bestseller group "Все" from former featured products
INSERT INTO "bestseller_groups" ("id", "slug", "name", "title", "sort_order", "active", "version", "created_at", "updated_at")
VALUES (gen_random_uuid(), 'vse', 'Все', 'Наши бестселлеры', 10, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "bestseller_group_products" ("group_id", "product_id", "sort_order")
SELECT bg.id, p.id, ROW_NUMBER() OVER (ORDER BY p.updated_at DESC) * 10
FROM "bestseller_groups" bg
CROSS JOIN "products" p
WHERE bg.slug = 'vse' AND p.featured = true;

-- ---------------------------------------------------------------------------
-- 4. Alter products: bouquet_size_id, drop featured; map height → size
-- ---------------------------------------------------------------------------

ALTER TABLE "products" ADD COLUMN "bouquet_size_id" UUID;

UPDATE "products" p
SET "bouquet_size_id" = (
  SELECT bs.id FROM "bouquet_sizes" bs
  WHERE bs.slug = CASE
    WHEN p.height_cm IS NULL THEN NULL
    WHEN p.height_cm < 35 THEN 'malenkij'
    WHEN p.height_cm < 50 THEN 'srednij'
    WHEN p.height_cm < 70 THEN 'bolshoj'
    ELSE 'ochen-bolshoj'
  END
);

CREATE INDEX "products_bouquet_size_id_idx" ON "products"("bouquet_size_id");

ALTER TABLE "products" DROP COLUMN IF EXISTS "featured";
DROP INDEX IF EXISTS "products_featured_idx";

-- ---------------------------------------------------------------------------
-- 5. Color swatch + flower index on components
-- ---------------------------------------------------------------------------

ALTER TABLE "colors" ADD COLUMN "swatch" VARCHAR(32);

CREATE INDEX IF NOT EXISTS "product_components_flower_id_idx" ON "product_components"("flower_id");

-- ---------------------------------------------------------------------------
-- 6. Order item promotion snapshot
-- ---------------------------------------------------------------------------

ALTER TABLE "order_items" ADD COLUMN "original_unit_price_minor" BIGINT;
ALTER TABLE "order_items" ADD COLUMN "promotion_type" VARCHAR(16);

-- ---------------------------------------------------------------------------
-- 7. Foreign keys for new relations
-- ---------------------------------------------------------------------------

ALTER TABLE "products" ADD CONSTRAINT "products_bouquet_size_id_fkey"
  FOREIGN KEY ("bouquet_size_id") REFERENCES "bouquet_sizes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "product_promotions" ADD CONSTRAINT "product_promotions_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_promotion_variant_prices" ADD CONSTRAINT "product_promotion_variant_prices_promotion_id_fkey"
  FOREIGN KEY ("promotion_id") REFERENCES "product_promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_promotion_variant_prices" ADD CONSTRAINT "product_promotion_variant_prices_variant_id_fkey"
  FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bestseller_group_products" ADD CONSTRAINT "bestseller_group_products_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "bestseller_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bestseller_group_products" ADD CONSTRAINT "bestseller_group_products_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 8. Drop obsolete catalog structures
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS "collection_products";
DROP TABLE IF EXISTS "collections";
DROP TABLE IF EXISTS "product_categories";
DROP TABLE IF EXISTS "product_styles";
DROP TABLE IF EXISTS "categories";
DROP TABLE IF EXISTS "styles";
DROP TYPE IF EXISTS "CollectionType";

-- Remove obsolete slug redirects for removed entity types
DELETE FROM "slug_redirects"
WHERE "entity_type"::text IN ('CATEGORY', 'STYLE', 'COLLECTION');

-- ---------------------------------------------------------------------------
-- 9. Rebuild SlugEntityType without CATEGORY/STYLE/COLLECTION
-- ---------------------------------------------------------------------------

CREATE TYPE "SlugEntityType_new" AS ENUM ('PRODUCT', 'OCCASION', 'RECIPIENT', 'COLOR', 'FLOWER', 'BOUQUET_SIZE');

ALTER TABLE "slug_redirects"
  ALTER COLUMN "entity_type" TYPE "SlugEntityType_new"
  USING ("entity_type"::text::"SlugEntityType_new");

DROP TYPE "SlugEntityType";
ALTER TYPE "SlugEntityType_new" RENAME TO "SlugEntityType";

-- ---------------------------------------------------------------------------
-- 10. Rebuild AuditAction: drop COLLECTION_*; add merchandising actions
-- ---------------------------------------------------------------------------

CREATE TYPE "AuditAction_new" AS ENUM (
  'LOGIN_SUCCESS',
  'LOGIN_FAILURE',
  'LOGOUT',
  'LOGOUT_ALL',
  'ADMIN_USER_CREATED',
  'ADMIN_USER_UPDATED',
  'ADMIN_USER_DISABLED',
  'ADMIN_USER_ENABLED',
  'ADMIN_PASSWORD_RESET',
  'PRODUCT_CREATED',
  'PRODUCT_UPDATED',
  'PRODUCT_PUBLISHED',
  'PRODUCT_UNPUBLISHED',
  'PRODUCT_ARCHIVED',
  'PRODUCT_VARIANT_CHANGED',
  'PRODUCT_MEDIA_ADDED',
  'PRODUCT_MEDIA_REMOVED',
  'PRODUCT_MEDIA_REORDERED',
  'TAXONOMY_CREATED',
  'TAXONOMY_UPDATED',
  'SEO_UPDATED',
  'STOREFRONT_SETTINGS_UPDATED',
  'HOMEPAGE_CONFIG_UPDATED',
  'ORDER_STATUS_CHANGED',
  'ORDER_CANCELLED',
  'FULFILLMENT_SETTINGS_UPDATED',
  'PROMOTION_UPDATED',
  'BESTSELLER_UPDATED',
  'BUDGET_RANGE_UPDATED'
);

-- Remap any COLLECTION_* audit rows to TAXONOMY_UPDATED before cast
UPDATE "audit_logs"
SET "action" = 'TAXONOMY_UPDATED'
WHERE "action"::text IN ('COLLECTION_CREATED', 'COLLECTION_UPDATED');

ALTER TABLE "audit_logs"
  ALTER COLUMN "action" TYPE "AuditAction_new"
  USING ("action"::text::"AuditAction_new");

DROP TYPE "AuditAction";
ALTER TYPE "AuditAction_new" RENAME TO "AuditAction";

-- ---------------------------------------------------------------------------
-- 11. Check constraints for promotions
-- ---------------------------------------------------------------------------

ALTER TABLE "product_promotions" ADD CONSTRAINT "product_promotions_percent_off_range"
  CHECK ("percent_off" IS NULL OR ("percent_off" >= 1 AND "percent_off" <= 99));

ALTER TABLE "product_promotions" ADD CONSTRAINT "product_promotions_type_fields"
  CHECK (
    ("type" = 'PERCENT' AND "percent_off" IS NOT NULL)
    OR ("type" = 'FIXED' AND "percent_off" IS NULL)
  );

ALTER TABLE "product_promotion_variant_prices" ADD CONSTRAINT "product_promotion_variant_prices_positive"
  CHECK ("sale_price_minor" > 0);

ALTER TABLE "budget_ranges" ADD CONSTRAINT "budget_ranges_bounds"
  CHECK (
    ("min_minor" IS NULL OR "min_minor" >= 0)
    AND ("max_minor" IS NULL OR "max_minor" >= 0)
    AND ("min_minor" IS NULL OR "max_minor" IS NULL OR "min_minor" <= "max_minor")
  );

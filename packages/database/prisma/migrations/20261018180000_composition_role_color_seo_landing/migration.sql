-- Additive: component role/color, product composition kind/precision/diameter,
-- FlowerType SEO fields, SeoLandingPage + SlugEntityType.SEO_LANDING.

CREATE TYPE "ComponentRole" AS ENUM ('PRIMARY', 'GREENERY', 'FILLER', 'OTHER');
CREATE TYPE "CompositionKind" AS ENUM ('MONO', 'MIXED', 'UNKNOWN');
CREATE TYPE "CompositionPrecision" AS ENUM ('EXACT', 'APPROXIMATE', 'UNKNOWN');
CREATE TYPE "SeoLandingStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- Expand SlugEntityType with SEO_LANDING.
ALTER TYPE "SlugEntityType" ADD VALUE 'SEO_LANDING';

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "diameter_cm" INTEGER,
  ADD COLUMN IF NOT EXISTS "composition_kind" "CompositionKind" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS "composition_precision" "CompositionPrecision" NOT NULL DEFAULT 'UNKNOWN';

ALTER TABLE "product_components"
  ADD COLUMN IF NOT EXISTS "color_id" UUID,
  ADD COLUMN IF NOT EXISTS "role" "ComponentRole" NOT NULL DEFAULT 'PRIMARY';

ALTER TABLE "product_components"
  ADD CONSTRAINT "product_components_color_id_fkey"
  FOREIGN KEY ("color_id") REFERENCES "colors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "product_components_color_id_idx" ON "product_components"("color_id");
CREATE INDEX IF NOT EXISTS "product_components_product_id_role_idx" ON "product_components"("product_id", "role");
CREATE INDEX IF NOT EXISTS "products_composition_kind_lifecycle_idx" ON "products"("composition_kind", "lifecycle");

ALTER TABLE "flower_types"
  ADD COLUMN IF NOT EXISTS "seo_title" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "seo_description" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "no_index" BOOLEAN NOT NULL DEFAULT false;

-- Backfill composition_precision: EXACT when product has components, else UNKNOWN.
UPDATE "products" p
SET "composition_precision" = CASE
  WHEN EXISTS (SELECT 1 FROM "product_components" c WHERE c."product_id" = p."id") THEN 'EXACT'::"CompositionPrecision"
  ELSE 'UNKNOWN'::"CompositionPrecision"
END;

-- Backfill composition_kind from PRIMARY flower types (all current rows are PRIMARY).
UPDATE "products" p
SET "composition_kind" = sub.kind
FROM (
  SELECT
    c."product_id",
    CASE
      WHEN COUNT(DISTINCT fi."flower_type_id") = 0 THEN 'UNKNOWN'::"CompositionKind"
      WHEN COUNT(DISTINCT fi."flower_type_id") = 1 THEN 'MONO'::"CompositionKind"
      ELSE 'MIXED'::"CompositionKind"
    END AS kind
  FROM "product_components" c
  INNER JOIN "flower_items" fi ON fi."id" = c."flower_item_id"
  WHERE c."role" = 'PRIMARY'
  GROUP BY c."product_id"
) sub
WHERE p."id" = sub."product_id";

CREATE TABLE "seo_landing_pages" (
  "id" UUID NOT NULL,
  "slug" VARCHAR(160) NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "h1" VARCHAR(200) NOT NULL,
  "seo_title" VARCHAR(200),
  "seo_description" VARCHAR(500),
  "body" TEXT,
  "rules" JSONB NOT NULL DEFAULT '{}',
  "status" "SeoLandingStatus" NOT NULL DEFAULT 'DRAFT',
  "no_index" BOOLEAN NOT NULL DEFAULT false,
  "nav_visible" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "published_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "seo_landing_pages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "seo_landing_pages_slug_key" ON "seo_landing_pages"("slug");
CREATE INDEX "seo_landing_pages_status_sort_order_idx" ON "seo_landing_pages"("status", "sort_order");
CREATE INDEX "seo_landing_pages_nav_visible_status_idx" ON "seo_landing_pages"("nav_visible", "status");

CREATE TABLE "seo_landing_page_products" (
  "landing_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "seo_landing_page_products_pkey" PRIMARY KEY ("landing_id", "product_id")
);

CREATE INDEX "seo_landing_page_products_product_id_idx" ON "seo_landing_page_products"("product_id");

ALTER TABLE "seo_landing_page_products"
  ADD CONSTRAINT "seo_landing_page_products_landing_id_fkey"
  FOREIGN KEY ("landing_id") REFERENCES "seo_landing_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "seo_landing_page_products"
  ADD CONSTRAINT "seo_landing_page_products_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "seo_landing_page_excludes" (
  "landing_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,

  CONSTRAINT "seo_landing_page_excludes_pkey" PRIMARY KEY ("landing_id", "product_id")
);

CREATE INDEX "seo_landing_page_excludes_product_id_idx" ON "seo_landing_page_excludes"("product_id");

ALTER TABLE "seo_landing_page_excludes"
  ADD CONSTRAINT "seo_landing_page_excludes_landing_id_fkey"
  FOREIGN KEY ("landing_id") REFERENCES "seo_landing_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "seo_landing_page_excludes"
  ADD CONSTRAINT "seo_landing_page_excludes_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Filter pool: composition_kind + enable price/quantity for public runtime.
INSERT INTO "catalog_filter_definitions"
  ("id", "key", "name", "description", "filter_type", "source_key", "supported", "default_enabled", "default_sort_order", "created_at", "updated_at")
VALUES
  ('a1000001-0000-4000-8000-00000000000d', 'composition_kind', 'Тип композиции', 'Монобукет или смешанный (по основным цветам состава)', 'MULTI_SELECT', 'product.composition_kind', true, true, 35, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET
  "supported" = EXCLUDED."supported",
  "name" = EXCLUDED."name",
  "updated_at" = CURRENT_TIMESTAMP;

UPDATE "catalog_filter_definitions"
SET "supported" = true, "updated_at" = CURRENT_TIMESTAMP
WHERE "key" IN ('price', 'quantity');

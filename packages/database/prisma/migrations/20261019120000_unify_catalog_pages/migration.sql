-- Unify catalog pages onto catalog_categories + product traits.
-- Additive / data-preserving. SeoLandingPage rows are copied into categories;
-- legacy table remains for dual-read until a later drop migration.

-- Enums
DO $$ BEGIN
  CREATE TYPE "CatalogPageKind" AS ENUM ('SYSTEM_HUB', 'THEMATIC', 'GIFT_SUBTYPE', 'LEGACY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CatalogCategory page columns
ALTER TABLE "catalog_categories"
  ADD COLUMN IF NOT EXISTS "page_kind" "CatalogPageKind" NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN IF NOT EXISTS "is_system" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "rules" JSONB,
  ADD COLUMN IF NOT EXISTS "h1" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "body" TEXT,
  ADD COLUMN IF NOT EXISTS "page_status" "SeoLandingStatus",
  ADD COLUMN IF NOT EXISTS "published_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "nav_visible" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "catalog_categories_page_kind_page_status_sort_order_idx"
  ON "catalog_categories"("page_kind", "page_status", "sort_order");

-- Pin / exclude for unified pages
CREATE TABLE IF NOT EXISTS "catalog_page_products" (
  "page_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "catalog_page_products_pkey" PRIMARY KEY ("page_id", "product_id")
);
CREATE INDEX IF NOT EXISTS "catalog_page_products_product_id_idx" ON "catalog_page_products"("product_id");
DO $$ BEGIN
  ALTER TABLE "catalog_page_products"
    ADD CONSTRAINT "catalog_page_products_page_id_fkey"
    FOREIGN KEY ("page_id") REFERENCES "catalog_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "catalog_page_products"
    ADD CONSTRAINT "catalog_page_products_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "catalog_page_excludes" (
  "page_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  CONSTRAINT "catalog_page_excludes_pkey" PRIMARY KEY ("page_id", "product_id")
);
CREATE INDEX IF NOT EXISTS "catalog_page_excludes_product_id_idx" ON "catalog_page_excludes"("product_id");
DO $$ BEGIN
  ALTER TABLE "catalog_page_excludes"
    ADD CONSTRAINT "catalog_page_excludes_page_id_fkey"
    FOREIGN KEY ("page_id") REFERENCES "catalog_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "catalog_page_excludes"
    ADD CONSTRAINT "catalog_page_excludes_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Product traits (Авторский, …)
CREATE TABLE IF NOT EXISTS "product_trait_definitions" (
  "id" UUID NOT NULL,
  "key" VARCHAR(64) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" VARCHAR(500),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "visibility" "TaxonomyVisibility" NOT NULL DEFAULT 'VISIBLE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "product_trait_definitions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "product_trait_definitions_key_key" ON "product_trait_definitions"("key");
CREATE INDEX IF NOT EXISTS "product_trait_definitions_visibility_sort_order_idx"
  ON "product_trait_definitions"("visibility", "sort_order");

CREATE TABLE IF NOT EXISTS "product_traits" (
  "product_id" UUID NOT NULL,
  "trait_id" UUID NOT NULL,
  CONSTRAINT "product_traits_pkey" PRIMARY KEY ("product_id", "trait_id")
);
CREATE INDEX IF NOT EXISTS "product_traits_trait_id_idx" ON "product_traits"("trait_id");
DO $$ BEGIN
  ALTER TABLE "product_traits"
    ADD CONSTRAINT "product_traits_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "product_traits"
    ADD CONSTRAINT "product_traits_trait_id_fkey"
    FOREIGN KEY ("trait_id") REFERENCES "product_trait_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO "product_trait_definitions" ("id", "key", "name", "description", "sort_order", "visibility", "version", "created_at", "updated_at")
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'AUTHORIAL',
  'Авторский',
  'Букет или композиция авторской сборки флориста',
  10,
  'VISIBLE',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;

-- Mark system hubs
UPDATE "catalog_categories"
SET
  "page_kind" = 'SYSTEM_HUB',
  "is_system" = true,
  "h1" = COALESCE("h1", "name"),
  "page_status" = 'PUBLISHED',
  "published_at" = COALESCE("published_at", CURRENT_TIMESTAMP)
WHERE "slug" IN ('bukety', 'kompozicii', 'tsvety', 'podarki')
  AND ("parent_id" IS NULL);

-- Gift subtypes
UPDATE "catalog_categories"
SET "page_kind" = 'GIFT_SUBTYPE', "h1" = COALESCE("h1", "name")
WHERE "listing_kind" = 'GIFTS'
  AND "slug" NOT IN ('podarki')
  AND "page_kind" = 'LEGACY';

-- Known thematic leaves → rules (keep existing slugs / SEO)
UPDATE "catalog_categories"
SET
  "page_kind" = 'THEMATIC',
  "page_status" = 'DRAFT',
  "h1" = COALESCE("h1", "name"),
  "rules" = '{"productKinds":["BOUQUET"],"onlyFlowerType":"roza"}'::jsonb
WHERE "slug" = 'bukety-iz-roz';

UPDATE "catalog_categories"
SET
  "page_kind" = 'THEMATIC',
  "page_status" = 'DRAFT',
  "h1" = COALESCE("h1", "name"),
  "rules" = '{"productKinds":["BOUQUET","COMPOSITION"],"compositionKinds":["MONO"]}'::jsonb
WHERE "slug" = 'monobukety';

UPDATE "catalog_categories"
SET
  "page_kind" = 'THEMATIC',
  "page_status" = 'DRAFT',
  "h1" = COALESCE("h1", "name"),
  "rules" = '{"productKinds":["BOUQUET","COMPOSITION"],"traitKeys":["AUTHORIAL"]}'::jsonb
WHERE "slug" = 'avtorskie-bukety';

-- STEM flower leaves: thematic STEM + flower type slug = category slug
UPDATE "catalog_categories" c
SET
  "page_kind" = 'THEMATIC',
  "page_status" = 'DRAFT',
  "h1" = COALESCE(c."h1", c."name"),
  "rules" = jsonb_build_object(
    'productKinds', jsonb_build_array('STEM'),
    'flowerTypeSlugs', jsonb_build_array(c."slug")
  )
FROM "catalog_categories" p
WHERE c."parent_id" = p."id"
  AND p."slug" = 'tsvety'
  AND c."page_kind" = 'LEGACY';

-- Copy SeoLandingPage → CatalogCategory (skip slug collisions)
INSERT INTO "catalog_categories" (
  "id", "parent_id", "slug", "name", "listing_kind", "page_kind", "is_system",
  "rules", "h1", "body", "page_status", "published_at", "nav_visible",
  "sort_order", "visibility", "version", "seo_title", "seo_description", "no_index",
  "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  (SELECT "id" FROM "catalog_categories" WHERE "slug" = 'bukety' LIMIT 1),
  s."slug",
  s."title",
  'BOUQUETS',
  'THEMATIC',
  false,
  s."rules",
  s."h1",
  s."body",
  s."status",
  s."published_at",
  s."nav_visible",
  s."sort_order",
  'VISIBLE',
  s."version",
  s."seo_title",
  s."seo_description",
  s."no_index",
  s."created_at",
  s."updated_at"
FROM "seo_landing_pages" s
WHERE NOT EXISTS (
  SELECT 1 FROM "catalog_categories" c WHERE c."slug" = s."slug"
);

-- Starter thematic drafts if missing (empty SEO DB)
INSERT INTO "catalog_categories" (
  "id", "parent_id", "slug", "name", "listing_kind", "page_kind", "is_system",
  "rules", "h1", "page_status", "sort_order", "visibility", "version",
  "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  (SELECT "id" FROM "catalog_categories" WHERE "slug" = 'bukety' LIMIT 1),
  v.slug,
  v.name,
  'BOUQUETS',
  'THEMATIC',
  false,
  v.rules::jsonb,
  v.name,
  'DRAFT',
  v.sort_order,
  'VISIBLE',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (VALUES
  ('bukety-s-rozami', 'Букеты с розами', '{"productKinds":["BOUQUET"],"containsFlowerType":"roza"}', 20),
  ('smeshannye-bukety', 'Смешанные букеты', '{"productKinds":["BOUQUET"],"compositionKinds":["MIXED"]}', 30)
) AS v(slug, name, rules, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM "catalog_categories" c WHERE c."slug" = v.slug);

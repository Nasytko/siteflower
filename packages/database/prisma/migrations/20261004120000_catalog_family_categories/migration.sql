-- Catalog navigation tree, flower typed attributes, product families (additive).
-- Existing products remain valid with NULL category/family/flower fields.
-- Existing Flower taxonomy (composition) is unchanged.

-- CatalogCategory
CREATE TABLE "catalog_categories" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "listing_kind" VARCHAR(32),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "visibility" "TaxonomyVisibility" NOT NULL DEFAULT 'VISIBLE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "seo_title" VARCHAR(200),
    "seo_description" VARCHAR(500),
    "no_index" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "catalog_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "catalog_categories_slug_key" ON "catalog_categories"("slug");
CREATE INDEX "catalog_categories_parent_id_sort_order_idx" ON "catalog_categories"("parent_id", "sort_order");
CREATE INDEX "catalog_categories_visibility_sort_order_idx" ON "catalog_categories"("visibility", "sort_order");

ALTER TABLE "catalog_categories"
  ADD CONSTRAINT "catalog_categories_parent_id_fkey"
  FOREIGN KEY ("parent_id") REFERENCES "catalog_categories"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- FlowerType
CREATE TABLE "flower_types" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "visibility" "TaxonomyVisibility" NOT NULL DEFAULT 'VISIBLE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "flower_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "flower_types_slug_key" ON "flower_types"("slug");
CREATE INDEX "flower_types_visibility_sort_order_idx" ON "flower_types"("visibility", "sort_order");

-- FlowerVariety
CREATE TABLE "flower_varieties" (
    "id" UUID NOT NULL,
    "flower_type_id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "visibility" "TaxonomyVisibility" NOT NULL DEFAULT 'VISIBLE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "flower_varieties_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "flower_varieties_slug_key" ON "flower_varieties"("slug");
CREATE INDEX "flower_varieties_flower_type_id_sort_order_idx" ON "flower_varieties"("flower_type_id", "sort_order");
CREATE INDEX "flower_varieties_visibility_sort_order_idx" ON "flower_varieties"("visibility", "sort_order");

ALTER TABLE "flower_varieties"
  ADD CONSTRAINT "flower_varieties_flower_type_id_fkey"
  FOREIGN KEY ("flower_type_id") REFERENCES "flower_types"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- FlowerOrigin
CREATE TABLE "flower_origins" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "visibility" "TaxonomyVisibility" NOT NULL DEFAULT 'VISIBLE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "flower_origins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "flower_origins_slug_key" ON "flower_origins"("slug");
CREATE INDEX "flower_origins_visibility_sort_order_idx" ON "flower_origins"("visibility", "sort_order");

-- ProductFamily
CREATE TABLE "product_families" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_families_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_family_members" (
    "family_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_family_members_pkey" PRIMARY KEY ("family_id", "product_id")
);

CREATE UNIQUE INDEX "product_family_members_product_id_key" ON "product_family_members"("product_id");
CREATE INDEX "product_family_members_family_id_sort_order_idx" ON "product_family_members"("family_id", "sort_order");

ALTER TABLE "product_family_members"
  ADD CONSTRAINT "product_family_members_family_id_fkey"
  FOREIGN KEY ("family_id") REFERENCES "product_families"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_family_members"
  ADD CONSTRAINT "product_family_members_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Product nullable FKs
ALTER TABLE "products" ADD COLUMN "catalog_category_id" UUID;
ALTER TABLE "products" ADD COLUMN "flower_type_id" UUID;
ALTER TABLE "products" ADD COLUMN "flower_variety_id" UUID;
ALTER TABLE "products" ADD COLUMN "flower_origin_id" UUID;

CREATE INDEX "products_catalog_category_id_lifecycle_idx" ON "products"("catalog_category_id", "lifecycle");
CREATE INDEX "products_flower_type_id_lifecycle_idx" ON "products"("flower_type_id", "lifecycle");
CREATE INDEX "products_flower_variety_id_lifecycle_idx" ON "products"("flower_variety_id", "lifecycle");
CREATE INDEX "products_flower_origin_id_lifecycle_idx" ON "products"("flower_origin_id", "lifecycle");
CREATE INDEX "products_height_cm_lifecycle_idx" ON "products"("height_cm", "lifecycle");

ALTER TABLE "products"
  ADD CONSTRAINT "products_catalog_category_id_fkey"
  FOREIGN KEY ("catalog_category_id") REFERENCES "catalog_categories"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "products"
  ADD CONSTRAINT "products_flower_type_id_fkey"
  FOREIGN KEY ("flower_type_id") REFERENCES "flower_types"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "products"
  ADD CONSTRAINT "products_flower_variety_id_fkey"
  FOREIGN KEY ("flower_variety_id") REFERENCES "flower_varieties"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "products"
  ADD CONSTRAINT "products_flower_origin_id_fkey"
  FOREIGN KEY ("flower_origin_id") REFERENCES "flower_origins"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Reference seed (categories / flower refs only — no product classification)
-- ---------------------------------------------------------------------------

-- Idempotent seed: safe if rows already exist (manual re-apply / partial recovery).
INSERT INTO "catalog_categories" ("id", "parent_id", "slug", "name", "listing_kind", "sort_order", "visibility", "version", "created_at", "updated_at")
VALUES
  ('a1000000-0000-4000-8000-000000000001', NULL, 'tsvety', 'Цветы', 'FLOWERS', 10, 'VISIBLE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a1000000-0000-4000-8000-000000000002', NULL, 'bukety', 'Букеты', 'BOUQUETS', 20, 'VISIBLE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a1000000-0000-4000-8000-000000000003', NULL, 'kompozicii', 'Композиции', 'COMPOSITIONS', 30, 'VISIBLE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a1000000-0000-4000-8000-000000000004', NULL, 'podarki', 'Подарки', 'GIFTS', 40, 'VISIBLE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a1000000-0000-4000-8000-000000000005', NULL, 'otkrytki', 'Открытки', 'GIFTS', 50, 'VISIBLE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a1000000-0000-4000-8000-000000000006', NULL, 'svechi', 'Свечи', 'GIFTS', 60, 'VISIBLE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "catalog_categories" ("id", "parent_id", "slug", "name", "listing_kind", "sort_order", "visibility", "version", "created_at", "updated_at")
VALUES
  ('a1000000-0000-4000-8000-000000000011', 'a1000000-0000-4000-8000-000000000001', 'rozy', 'Розы', 'FLOWERS', 10, 'VISIBLE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a1000000-0000-4000-8000-000000000012', 'a1000000-0000-4000-8000-000000000001', 'hrizantemy', 'Хризантемы', 'FLOWERS', 20, 'VISIBLE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a1000000-0000-4000-8000-000000000013', 'a1000000-0000-4000-8000-000000000001', 'gerbery', 'Герберы', 'FLOWERS', 30, 'VISIBLE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a1000000-0000-4000-8000-000000000014', 'a1000000-0000-4000-8000-000000000001', 'tyulpany', 'Тюльпаны', 'FLOWERS', 40, 'VISIBLE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a1000000-0000-4000-8000-000000000015', 'a1000000-0000-4000-8000-000000000001', 'lilii', 'Лилии', 'FLOWERS', 50, 'VISIBLE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a1000000-0000-4000-8000-000000000021', 'a1000000-0000-4000-8000-000000000002', 'bukety-iz-roz', 'Букеты из роз', 'BOUQUETS', 10, 'VISIBLE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a1000000-0000-4000-8000-000000000022', 'a1000000-0000-4000-8000-000000000002', 'monobukety', 'Монобукеты', 'BOUQUETS', 20, 'VISIBLE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a1000000-0000-4000-8000-000000000023', 'a1000000-0000-4000-8000-000000000002', 'avtorskie-bukety', 'Авторские букеты', 'BOUQUETS', 30, 'VISIBLE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a1000000-0000-4000-8000-000000000031', 'a1000000-0000-4000-8000-000000000004', 'igrushki', 'Игрушки', 'GIFTS', 10, 'VISIBLE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a1000000-0000-4000-8000-000000000032', 'a1000000-0000-4000-8000-000000000004', 'dopolneniya', 'Дополнения', 'GIFTS', 20, 'VISIBLE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "flower_types" ("id", "slug", "name", "sort_order", "visibility", "version", "created_at", "updated_at")
VALUES
  ('b1000000-0000-4000-8000-000000000001', 'roza', 'Роза', 10, 'VISIBLE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('b1000000-0000-4000-8000-000000000002', 'hrizantema', 'Хризантема', 20, 'VISIBLE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('b1000000-0000-4000-8000-000000000003', 'gerbera', 'Гербера', 30, 'VISIBLE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('b1000000-0000-4000-8000-000000000004', 'tyulpan', 'Тюльпан', 40, 'VISIBLE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('b1000000-0000-4000-8000-000000000005', 'liliya', 'Лилия', 50, 'VISIBLE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "flower_varieties" ("id", "flower_type_id", "slug", "name", "sort_order", "visibility", "version", "created_at", "updated_at")
VALUES
  ('c1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'mondial', 'Мондиаль', 10, 'VISIBLE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('c1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'zhizel', 'Жизель', 20, 'VISIBLE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('c1000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000001', 'eksplorer', 'Эксплорер', 30, 'VISIBLE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "flower_origins" ("id", "slug", "name", "sort_order", "visibility", "version", "created_at", "updated_at")
VALUES
  ('d1000000-0000-4000-8000-000000000001', 'ekvador', 'Эквадор', 10, 'VISIBLE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('d1000000-0000-4000-8000-000000000002', 'keniya', 'Кения', 20, 'VISIBLE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('d1000000-0000-4000-8000-000000000003', 'fermerskaya', 'Фермерская', 30, 'VISIBLE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

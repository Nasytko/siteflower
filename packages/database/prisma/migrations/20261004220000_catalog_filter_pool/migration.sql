-- Global catalog filter pool + per-category configuration.
-- Also adds CATALOG_CATEGORY to SlugEntityType for category slug redirects.

ALTER TYPE "SlugEntityType" ADD VALUE IF NOT EXISTS 'CATALOG_CATEGORY';

CREATE TYPE "CatalogFilterType" AS ENUM (
  'SELECT',
  'MULTI_SELECT',
  'RANGE',
  'TOGGLE',
  'CHECKBOX',
  'NUMBER_RANGE'
);

CREATE TABLE "catalog_filter_definitions" (
    "id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "filter_type" "CatalogFilterType" NOT NULL,
    "source_key" VARCHAR(64) NOT NULL,
    "supported" BOOLEAN NOT NULL DEFAULT true,
    "default_enabled" BOOLEAN NOT NULL DEFAULT false,
    "default_sort_order" INTEGER NOT NULL DEFAULT 0,
    "config_schema" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "catalog_filter_definitions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "catalog_filter_definitions_key_key" ON "catalog_filter_definitions"("key");

CREATE TABLE "catalog_category_filters" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "definition_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "label_override" VARCHAR(120),
    "config" JSONB,
    "collapsed" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "catalog_category_filters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "catalog_category_filters_category_id_definition_id_key"
  ON "catalog_category_filters"("category_id", "definition_id");
CREATE INDEX "catalog_category_filters_category_id_position_idx"
  ON "catalog_category_filters"("category_id", "position");

ALTER TABLE "catalog_category_filters"
  ADD CONSTRAINT "catalog_category_filters_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "catalog_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "catalog_category_filters"
  ADD CONSTRAINT "catalog_category_filters_definition_id_fkey"
  FOREIGN KEY ("definition_id") REFERENCES "catalog_filter_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Stable seed UUIDs for the global filter pool.
INSERT INTO "catalog_filter_definitions"
  ("id", "key", "name", "description", "filter_type", "source_key", "supported", "default_enabled", "default_sort_order", "created_at", "updated_at")
VALUES
  ('a1000001-0000-4000-8000-000000000001', 'price', 'Цена', 'Диапазон эффективной цены', 'NUMBER_RANGE', 'effective_price', true, true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a1000001-0000-4000-8000-000000000002', 'promo', 'Акция', 'Только товары с активной акцией', 'TOGGLE', 'promotion', true, true, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a1000001-0000-4000-8000-000000000003', 'flower_type', 'Цветы', 'Тип цветка (Роза, Хризантема…) через состав FlowerItem', 'MULTI_SELECT', 'flower_item.flower_type', true, true, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a1000001-0000-4000-8000-000000000004', 'variety', 'Сорт', 'Сорт цветка через FlowerItem', 'MULTI_SELECT', 'flower_item.flower_variety', true, true, 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a1000001-0000-4000-8000-000000000005', 'origin', 'Происхождение', 'Происхождение через FlowerItem', 'MULTI_SELECT', 'flower_item.flower_origin', true, true, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a1000001-0000-4000-8000-000000000006', 'stem_height', 'Высота цветка', 'Высота стебля FlowerItem.heightCm', 'MULTI_SELECT', 'flower_item.height_cm', true, true, 60, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a1000001-0000-4000-8000-000000000007', 'bouquet_height', 'Высота букета', 'Высота готового букета Product.heightCm', 'MULTI_SELECT', 'product.height_cm', true, false, 70, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a1000001-0000-4000-8000-000000000008', 'color', 'Цвет', 'Цвет букета/товара', 'MULTI_SELECT', 'product.color', true, true, 80, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a1000001-0000-4000-8000-000000000009', 'quantity', 'Количество', 'Количество в составе', 'MULTI_SELECT', 'product_component.quantity', true, false, 90, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a1000001-0000-4000-8000-00000000000a', 'bouquet_size', 'Размер букета', 'Таксономия размера букета', 'MULTI_SELECT', 'product.bouquet_size', true, false, 100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a1000001-0000-4000-8000-00000000000b', 'occasion', 'Повод', 'Повод', 'MULTI_SELECT', 'product.occasion', true, false, 110, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a1000001-0000-4000-8000-00000000000c', 'recipient', 'Кому', 'Получатель', 'MULTI_SELECT', 'product.recipient', true, false, 120, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

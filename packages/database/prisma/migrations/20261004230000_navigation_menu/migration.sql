-- Storefront NavigationMenu — independent of CatalogCategory.

CREATE TYPE "NavigationTargetType" AS ENUM (
  'CATEGORY',
  'PROMOTIONS',
  'BESTSELLERS',
  'PAGE',
  'CUSTOM_URL'
);

CREATE TABLE "navigation_menus" (
    "id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "navigation_menus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "navigation_menus_key_key" ON "navigation_menus"("key");

CREATE TABLE "navigation_menu_items" (
    "id" UUID NOT NULL,
    "menu_id" UUID NOT NULL,
    "parent_id" UUID,
    "label" VARCHAR(120) NOT NULL,
    "target_type" "NavigationTargetType" NOT NULL,
    "target_id" UUID,
    "custom_href" VARCHAR(500),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "open_in_new_tab" BOOLEAN NOT NULL DEFAULT false,
    "accent" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "navigation_menu_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "navigation_menu_items_menu_id_sort_order_idx"
  ON "navigation_menu_items"("menu_id", "sort_order");
CREATE INDEX "navigation_menu_items_parent_id_sort_order_idx"
  ON "navigation_menu_items"("parent_id", "sort_order");

ALTER TABLE "navigation_menu_items"
  ADD CONSTRAINT "navigation_menu_items_menu_id_fkey"
  FOREIGN KEY ("menu_id") REFERENCES "navigation_menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "navigation_menu_items"
  ADD CONSTRAINT "navigation_menu_items_parent_id_fkey"
  FOREIGN KEY ("parent_id") REFERENCES "navigation_menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed main menu with current storefront IA (entity refs where possible, pages/custom otherwise).
INSERT INTO "navigation_menus" ("id", "key", "name", "version", "created_at", "updated_at")
VALUES (
  'b1000001-0000-4000-8000-000000000001',
  'main',
  'Главное меню',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

INSERT INTO "navigation_menu_items"
  ("id", "menu_id", "parent_id", "label", "target_type", "target_id", "custom_href", "sort_order", "enabled", "open_in_new_tab", "accent", "version", "created_at", "updated_at")
VALUES
  ('b1000001-0000-4000-8000-000000000011', 'b1000001-0000-4000-8000-000000000001', NULL, 'Букеты', 'PAGE', NULL, 'bukety', 10, true, false, false, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('b1000001-0000-4000-8000-000000000012', 'b1000001-0000-4000-8000-000000000001', NULL, 'Цветы', 'PAGE', NULL, 'cvety', 20, true, false, false, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('b1000001-0000-4000-8000-000000000013', 'b1000001-0000-4000-8000-000000000001', NULL, 'Повод', 'PAGE', NULL, 'povod', 30, true, false, false, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('b1000001-0000-4000-8000-000000000014', 'b1000001-0000-4000-8000-000000000001', NULL, 'Акции', 'PROMOTIONS', NULL, NULL, 40, true, false, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('b1000001-0000-4000-8000-000000000015', 'b1000001-0000-4000-8000-000000000001', NULL, 'Доставка', 'PAGE', NULL, 'dostavka', 50, true, false, false, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('b1000001-0000-4000-8000-000000000016', 'b1000001-0000-4000-8000-000000000001', NULL, 'О нас', 'PAGE', NULL, 'o-nas', 60, true, false, false, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Hide filter definitions that are not yet correctly wired on the storefront PLP.
UPDATE "catalog_filter_definitions"
SET "supported" = false, "updated_at" = CURRENT_TIMESTAMP
WHERE "key" IN ('quantity', 'bouquet_height', 'price');

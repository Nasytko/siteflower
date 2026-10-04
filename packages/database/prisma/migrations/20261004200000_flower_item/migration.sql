-- Concrete reusable flower stem/SKU (Type + Variety + Origin + height).
-- Quantity stays on product_components only.

CREATE TABLE "flower_items" (
    "id" UUID NOT NULL,
    "flower_type_id" UUID NOT NULL,
    "flower_variety_id" UUID,
    "flower_origin_id" UUID,
    "height_cm" INTEGER,
    "identity_key" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "visibility" "TaxonomyVisibility" NOT NULL DEFAULT 'VISIBLE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "flower_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "flower_items_identity_key_key" ON "flower_items"("identity_key");
CREATE UNIQUE INDEX "flower_items_slug_key" ON "flower_items"("slug");
CREATE INDEX "flower_items_flower_type_id_sort_order_idx" ON "flower_items"("flower_type_id", "sort_order");
CREATE INDEX "flower_items_flower_variety_id_idx" ON "flower_items"("flower_variety_id");
CREATE INDEX "flower_items_flower_origin_id_idx" ON "flower_items"("flower_origin_id");
CREATE INDEX "flower_items_height_cm_idx" ON "flower_items"("height_cm");
CREATE INDEX "flower_items_visibility_sort_order_idx" ON "flower_items"("visibility", "sort_order");

ALTER TABLE "flower_items" ADD CONSTRAINT "flower_items_flower_type_id_fkey"
  FOREIGN KEY ("flower_type_id") REFERENCES "flower_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flower_items" ADD CONSTRAINT "flower_items_flower_variety_id_fkey"
  FOREIGN KEY ("flower_variety_id") REFERENCES "flower_varieties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flower_items" ADD CONSTRAINT "flower_items_flower_origin_id_fkey"
  FOREIGN KEY ("flower_origin_id") REFERENCES "flower_origins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Additive: composition may reference FlowerItem (legacy flower_id kept).
ALTER TABLE "product_components" ADD COLUMN "flower_item_id" UUID;
CREATE INDEX "product_components_flower_item_id_idx" ON "product_components"("flower_item_id");
ALTER TABLE "product_components" ADD CONSTRAINT "product_components_flower_item_id_fkey"
  FOREIGN KEY ("flower_item_id") REFERENCES "flower_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

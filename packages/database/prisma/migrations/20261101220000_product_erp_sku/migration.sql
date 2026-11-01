-- Task 04A: ERP identity — denormalized columns + global sku registry + order snapshot.
-- Additive only. Nullable erp_sku allows existing catalog to keep publishing without SKU.
-- Global uniqueness: erp_sku_registry.sku PRIMARY KEY (Product ∪ OptionValue).
-- Per-table UNIQUE on denormalized columns is defense-in-depth for same-entity races.
-- Order snapshots (product_erp_sku / options_snapshot) are write-once; never backfilled
-- and never cascade-deleted when registry rows are released.
-- Do not auto-apply on production / VPS without explicit migrate plan.

CREATE TYPE "ErpSkuOwnerKind" AS ENUM ('PRODUCT', 'OPTION_VALUE');

CREATE TABLE "erp_sku_registry" (
    "sku" VARCHAR(64) NOT NULL,
    "owner_kind" "ErpSkuOwnerKind" NOT NULL,
    "owner_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "erp_sku_registry_pkey" PRIMARY KEY ("sku")
);

CREATE UNIQUE INDEX "erp_sku_registry_owner_kind_owner_id_key"
  ON "erp_sku_registry"("owner_kind", "owner_id");

ALTER TABLE "products" ADD COLUMN "erp_sku" VARCHAR(64);
ALTER TABLE "product_option_values" ADD COLUMN "erp_sku" VARCHAR(64);
ALTER TABLE "order_items" ADD COLUMN "product_erp_sku" VARCHAR(64);

CREATE UNIQUE INDEX "products_erp_sku_key" ON "products"("erp_sku");
CREATE UNIQUE INDEX "product_option_values_erp_sku_key" ON "product_option_values"("erp_sku");

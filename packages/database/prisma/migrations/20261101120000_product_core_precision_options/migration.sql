-- Task 02: composition precision DESCRIPTIVE + primary-complete flag + product options + order option snapshots.
--
-- Data policy:
-- - Existing composition_precision UNKNOWN rows are LEFT UNCHANGED (not mapped to DESCRIPTIVE).
-- - composition_primary_complete defaults to FALSE for all existing rows (completeness not confirmed).
-- - OrderItem.unit_price_minor meaning is unchanged (variant unit after promo, excluding options).
-- - New order columns are additive; legacy rows get options_total_minor = 0, nullable base/snapshot.
-- Prepared for review; do not auto-apply on VPS.

-- New precision value (additive). Must not be used to rewrite existing UNKNOWN rows.
ALTER TYPE "CompositionPrecision" ADD VALUE 'DESCRIPTIVE';

CREATE TYPE "ProductOptionSelection" AS ENUM ('SINGLE', 'MULTI');
CREATE TYPE "ProductOptionChargeMode" AS ENUM ('PER_LINE', 'PER_UNIT');

-- Safe default: incomplete/unknown primary list until a manager confirms (APPROXIMATE) or EXACT save.
ALTER TABLE "products" ADD COLUMN "composition_primary_complete" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN "composition_text" TEXT;

-- Additive order line fields. unit_price_minor / original_unit_price_minor / line_total_minor untouched.
ALTER TABLE "order_items" ADD COLUMN "base_unit_price_minor" BIGINT;
ALTER TABLE "order_items" ADD COLUMN "options_total_minor" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "order_items" ADD COLUMN "options_snapshot" JSONB;

CREATE TABLE "product_option_groups" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "selection" "ProductOptionSelection" NOT NULL DEFAULT 'SINGLE',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "product_option_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_option_values" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "surcharge_minor" BIGINT NOT NULL DEFAULT 0,
    "charge_mode" "ProductOptionChargeMode" NOT NULL DEFAULT 'PER_LINE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "product_option_values_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "product_option_values_surcharge_nonneg" CHECK ("surcharge_minor" >= 0)
);

CREATE TABLE "product_option_variant_prices" (
    "option_value_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "surcharge_minor" BIGINT NOT NULL,
    CONSTRAINT "product_option_variant_prices_pkey" PRIMARY KEY ("option_value_id","variant_id"),
    CONSTRAINT "product_option_variant_prices_surcharge_nonneg" CHECK ("surcharge_minor" >= 0)
);

CREATE INDEX "product_option_groups_product_id_sort_order_idx" ON "product_option_groups"("product_id", "sort_order");
CREATE INDEX "product_option_values_group_id_sort_order_idx" ON "product_option_values"("group_id", "sort_order");
CREATE INDEX "product_option_variant_prices_variant_id_idx" ON "product_option_variant_prices"("variant_id");

ALTER TABLE "product_option_groups" ADD CONSTRAINT "product_option_groups_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_option_values" ADD CONSTRAINT "product_option_values_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "product_option_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_option_variant_prices" ADD CONSTRAINT "product_option_variant_prices_option_value_id_fkey" FOREIGN KEY ("option_value_id") REFERENCES "product_option_values"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_option_variant_prices" ADD CONSTRAINT "product_option_variant_prices_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_options_total_nonneg" CHECK ("options_total_minor" >= 0);

-- CreateEnum
CREATE TYPE "PackagingAddonPricingMode" AS ENUM ('FIXED', 'TIERED');

-- AlterTable
ALTER TABLE "packaging_addons" ADD COLUMN "pricing_mode" "PackagingAddonPricingMode" NOT NULL DEFAULT 'FIXED';

-- CreateTable
CREATE TABLE "packaging_addon_price_tiers" (
    "id" UUID NOT NULL,
    "addon_id" UUID NOT NULL,
    "max_base_minor" BIGINT,
    "surcharge_minor" BIGINT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "packaging_addon_price_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "packaging_addon_price_tiers_addon_id_sort_order_idx" ON "packaging_addon_price_tiers"("addon_id", "sort_order");

-- AddForeignKey
ALTER TABLE "packaging_addon_price_tiers" ADD CONSTRAINT "packaging_addon_price_tiers_addon_id_fkey" FOREIGN KEY ("addon_id") REFERENCES "packaging_addons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

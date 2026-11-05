-- CreateEnum
CREATE TYPE "PackagingAddonKind" AS ENUM ('RIBBON', 'PACKAGING', 'OTHER');

-- AlterEnum
ALTER TYPE "ErpSkuOwnerKind" ADD VALUE 'PACKAGING_ADDON';
ALTER TYPE "AuditAction" ADD VALUE 'PACKAGING_ADDON_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'PACKAGING_ADDON_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'PACKAGING_ADDON_DELETED';

-- CreateTable
CREATE TABLE "packaging_addons" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "kind" "PackagingAddonKind" NOT NULL DEFAULT 'OTHER',
    "surcharge_minor" BIGINT NOT NULL DEFAULT 0,
    "erp_sku" VARCHAR(64),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "packaging_addons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "packaging_addons_erp_sku_key" ON "packaging_addons"("erp_sku");

-- CreateIndex
CREATE INDEX "packaging_addons_kind_sort_order_idx" ON "packaging_addons"("kind", "sort_order");

-- CreateIndex
CREATE INDEX "packaging_addons_active_sort_order_idx" ON "packaging_addons"("active", "sort_order");

-- AlterTable
ALTER TABLE "product_option_values" ADD COLUMN "addon_id" UUID;

-- CreateIndex
CREATE INDEX "product_option_values_addon_id_idx" ON "product_option_values"("addon_id");

-- AddForeignKey
ALTER TABLE "product_option_values" ADD CONSTRAINT "product_option_values_addon_id_fkey" FOREIGN KEY ("addon_id") REFERENCES "packaging_addons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

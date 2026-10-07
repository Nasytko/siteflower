-- AlterEnum: add GROUP (dropdown column header) and PRODUCT (PDP link).
ALTER TYPE "NavigationTargetType" ADD VALUE IF NOT EXISTS 'GROUP';
ALTER TYPE "NavigationTargetType" ADD VALUE IF NOT EXISTS 'PRODUCT';

-- AlterTable: optional named SVG icon for group headers / menu items.
ALTER TABLE "navigation_menu_items" ADD COLUMN IF NOT EXISTS "icon_key" VARCHAR(40);

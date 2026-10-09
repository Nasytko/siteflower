-- AlterEnum: dropdown presentation for root nav items.
CREATE TYPE "NavigationPanelLayout" AS ENUM ('COLUMNS', 'TILES');

-- AlterTable: panel layout + optional MediaAsset for photo tiles.
ALTER TABLE "navigation_menu_items"
  ADD COLUMN IF NOT EXISTS "panel_layout" "NavigationPanelLayout" NOT NULL DEFAULT 'COLUMNS',
  ADD COLUMN IF NOT EXISTS "media_asset_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'navigation_menu_items_media_asset_id_fkey'
  ) THEN
    ALTER TABLE "navigation_menu_items"
      ADD CONSTRAINT "navigation_menu_items_media_asset_id_fkey"
      FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "navigation_menu_items_media_asset_id_idx"
  ON "navigation_menu_items"("media_asset_id");

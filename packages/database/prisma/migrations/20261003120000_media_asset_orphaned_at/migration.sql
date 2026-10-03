-- MediaAsset orphan lifecycle: track when an asset became unreferenced.
-- Grace period for physical cleanup is measured from orphaned_at (not created_at).

ALTER TABLE "media_assets" ADD COLUMN "orphaned_at" TIMESTAMPTZ(3);

-- Existing unreferenced assets enter the grace window from deploy time (SAFE FIRST).
UPDATE "media_assets" AS ma
SET "orphaned_at" = NOW()
WHERE "orphaned_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "product_media" pm WHERE pm."media_asset_id" = ma."id"
  );

CREATE INDEX "media_assets_orphaned_at_idx" ON "media_assets"("orphaned_at");

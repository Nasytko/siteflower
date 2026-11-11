-- Durable orphan purge claim: set before first storage delete so attach cannot win
-- a race after a partial S3/local failure leaves the DB row for retry.

ALTER TABLE "media_assets" ADD COLUMN "purge_started_at" TIMESTAMPTZ(3);

CREATE INDEX "media_assets_purge_started_at_idx" ON "media_assets"("purge_started_at");

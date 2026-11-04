-- Drop merchandising Product.badge_label («Хит сезона» etc.).
-- Promo/sale badges remain via ProductPromotion; availability chip stays on PDP.
-- Non-NULL values are preserved in _archive_product_badge_label before DROP.

CREATE TABLE IF NOT EXISTS "_archive_product_badge_label" (
  "product_id" UUID PRIMARY KEY,
  "badge_label" VARCHAR(40) NOT NULL,
  "archived_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name = 'badge_label'
  ) THEN
    INSERT INTO "_archive_product_badge_label" ("product_id", "badge_label")
    SELECT "id", "badge_label"
    FROM "products"
    WHERE "badge_label" IS NOT NULL
    ON CONFLICT ("product_id") DO NOTHING;
  END IF;
END $$;

ALTER TABLE "products" DROP COLUMN IF EXISTS "badge_label";

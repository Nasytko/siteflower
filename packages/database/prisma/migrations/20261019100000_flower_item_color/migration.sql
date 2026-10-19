-- Additive: dictionary color on FlowerItem (nullable for historical rows).
-- Color is NOT part of identityKey — changing color does not fork the SKU.

ALTER TABLE "flower_items" ADD COLUMN IF NOT EXISTS "color_id" UUID;

CREATE INDEX IF NOT EXISTS "flower_items_color_id_idx" ON "flower_items"("color_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'flower_items_color_id_fkey'
  ) THEN
    ALTER TABLE "flower_items"
      ADD CONSTRAINT "flower_items_color_id_fkey"
      FOREIGN KEY ("color_id") REFERENCES "colors"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

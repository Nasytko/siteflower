-- Additive: composition photo for flower dictionary items (product page «Состав»).

ALTER TABLE "flower_items" ADD COLUMN IF NOT EXISTS "image_url" VARCHAR(500);

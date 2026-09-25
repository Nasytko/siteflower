-- Optional bouquet height for storefront merchandising (cm).
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "height_cm" INTEGER;

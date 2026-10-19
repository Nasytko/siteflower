-- Additive: product page content managed in Admin.

ALTER TABLE "storefront_settings" ADD COLUMN IF NOT EXISTS "whatsapp_url" VARCHAR(500);
ALTER TABLE "storefront_settings" ADD COLUMN IF NOT EXISTS "out_of_city_delivery_note" VARCHAR(300);
ALTER TABLE "storefront_settings" ADD COLUMN IF NOT EXISTS "photo_report_note" VARCHAR(300);
ALTER TABLE "storefront_settings" ADD COLUMN IF NOT EXISTS "packaging_note" VARCHAR(500);
ALTER TABLE "storefront_settings" ADD COLUMN IF NOT EXISTS "packaging_image_url" VARCHAR(500);

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "badge_label" VARCHAR(40);

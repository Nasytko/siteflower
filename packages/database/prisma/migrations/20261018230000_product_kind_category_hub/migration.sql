-- Backfill missing catalog_category_id from ProductKind → canonical hub roots.
-- ProductKind remains the commercial source of truth; category is merchandising/PLP glue.

UPDATE "products" p
SET "catalog_category_id" = c."id"
FROM "catalog_categories" c
WHERE p."catalog_category_id" IS NULL
  AND c."visibility" = 'VISIBLE'
  AND (
    (p."product_kind" = 'BOUQUET' AND c."slug" = 'bukety' AND c."listing_kind" = 'BOUQUETS')
    OR (p."product_kind" = 'COMPOSITION' AND c."slug" = 'kompozicii' AND c."listing_kind" = 'COMPOSITIONS')
    OR (p."product_kind" = 'STEM' AND c."slug" = 'tsvety' AND c."listing_kind" = 'FLOWERS')
    OR (p."product_kind" = 'GIFT' AND c."slug" = 'podarki' AND c."listing_kind" = 'GIFTS')
  );

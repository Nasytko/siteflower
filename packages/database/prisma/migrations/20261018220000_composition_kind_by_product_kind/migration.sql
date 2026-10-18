-- Clear mono/mixed on product kinds that are not bouquets/compositions.
-- STEM (поштучно), plants, gifts must not appear in «монобукеты» filters.

UPDATE "products"
SET "composition_kind" = 'UNKNOWN'
WHERE "product_kind" NOT IN ('BOUQUET', 'COMPOSITION')
  AND "composition_kind" <> 'UNKNOWN';

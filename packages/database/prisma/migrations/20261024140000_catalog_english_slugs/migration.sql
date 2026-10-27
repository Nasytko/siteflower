-- Modernize CatalogCategory hub/thematic slugs to English identifiers.
-- Records SlugRedirect (CATALOG_CATEGORY) for each rename. Idempotent.
-- Does not delete SeoLandingPage; product/order data untouched.

-- Ensure slug_redirects rows for renames (skip if already present).
INSERT INTO slug_redirects (id, entity_type, from_slug, to_slug, created_at)
SELECT gen_random_uuid(), 'CATALOG_CATEGORY', v.from_slug, v.to_slug, CURRENT_TIMESTAMP
FROM (VALUES
  ('bukety', 'bouquets'),
  ('tsvety', 'stems'),
  ('cvety', 'stems'),
  ('kompozicii', 'compositions'),
  ('podarki', 'gifts'),
  ('rozy', 'roses'),
  ('monobukety', 'mono-bouquets'),
  ('bukety-iz-roz', 'rose-bouquets'),
  ('bukety-s-rozami', 'bouquets-with-roses'),
  ('kustovye-rozy', 'spray-roses'),
  ('avtorskie-bukety', 'signature-bouquets'),
  ('smeshannye-bukety', 'mixed-bouquets')
) AS v(from_slug, to_slug)
WHERE EXISTS (SELECT 1 FROM catalog_categories c WHERE c.slug = v.from_slug)
  AND NOT EXISTS (
    SELECT 1 FROM slug_redirects r
    WHERE r.entity_type = 'CATALOG_CATEGORY' AND r.from_slug = v.from_slug
  )
  AND NOT EXISTS (SELECT 1 FROM catalog_categories c WHERE c.slug = v.to_slug);

-- Rename categories one-by-one when target slug is free.
UPDATE catalog_categories AS c
SET slug = v.to_slug, updated_at = CURRENT_TIMESTAMP
FROM (VALUES
  ('bukety', 'bouquets'),
  ('tsvety', 'stems'),
  ('cvety', 'stems'),
  ('kompozicii', 'compositions'),
  ('podarki', 'gifts'),
  ('rozy', 'roses'),
  ('monobukety', 'mono-bouquets'),
  ('bukety-iz-roz', 'rose-bouquets'),
  ('bukety-s-rozami', 'bouquets-with-roses'),
  ('kustovye-rozy', 'spray-roses'),
  ('avtorskie-bukety', 'signature-bouquets'),
  ('smeshannye-bukety', 'mixed-bouquets')
) AS v(from_slug, to_slug)
WHERE c.slug = v.from_slug
  AND NOT EXISTS (SELECT 1 FROM catalog_categories x WHERE x.slug = v.to_slug);

-- If both cvety and tsvety existed, stems may already be taken by tsvety rename;
-- leftover cvety gets a redirect-only path (handled by app aliases + optional second pass).
INSERT INTO slug_redirects (id, entity_type, from_slug, to_slug, created_at)
SELECT gen_random_uuid(), 'CATALOG_CATEGORY', 'cvety', 'stems', CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM catalog_categories WHERE slug = 'cvety')
  AND EXISTS (SELECT 1 FROM catalog_categories WHERE slug = 'stems')
  AND NOT EXISTS (
    SELECT 1 FROM slug_redirects
    WHERE entity_type = 'CATALOG_CATEGORY' AND from_slug = 'cvety'
  );

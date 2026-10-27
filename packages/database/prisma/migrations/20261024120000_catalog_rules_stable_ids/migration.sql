-- Phase 2: enrich CatalogCategory.rules / SeoLandingPage.rules with stable *Ids
-- where legacy slug tokens uniquely resolve to taxonomy rows.
-- Idempotent: skips rows that already have *Ids; never invents ids for unknown/
-- ambiguous slugs; does not delete slug keys, categories, products, or orders.
-- Known page/rule alias: rozy|rosa → FlowerType.slug = roza.

-- ---------------------------------------------------------------------------
-- Helper: resolve flower type id from a slug token (exact or alias).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _sf_resolve_flower_type_id(token text)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT ft.id
  FROM flower_types ft
  WHERE lower(ft.slug) = lower(
    CASE lower(trim(token))
      WHEN 'rozy' THEN 'roza'
      WHEN 'rosa' THEN 'roza'
      WHEN 'hrizantemy' THEN 'hrizantema'
      WHEN 'gerbery' THEN 'gerbera'
      WHEN 'tyulpany' THEN 'tyulpan'
      WHEN 'lilii' THEN 'liliya'
      ELSE trim(token)
    END
  )
  LIMIT 1
$$;

-- ---------------------------------------------------------------------------
-- CatalogCategory.rules: flowerTypeIds from flowerTypeSlugs / containsFlowerType*
-- ---------------------------------------------------------------------------
UPDATE catalog_categories c
SET
  rules = jsonb_set(
    COALESCE(c.rules, '{}'::jsonb),
    '{flowerTypeIds}',
    (
      SELECT COALESCE(jsonb_agg(to_jsonb(x.id::text) ORDER BY x.id::text), '[]'::jsonb)
      FROM (
        SELECT DISTINCT _sf_resolve_flower_type_id(tok) AS id
        FROM (
          SELECT jsonb_array_elements_text(COALESCE(c.rules->'flowerTypeSlugs', '[]'::jsonb)) AS tok
          UNION ALL
          SELECT jsonb_array_elements_text(COALESCE(c.rules->'containsFlowerTypeSlugs', '[]'::jsonb))
          UNION ALL
          SELECT COALESCE(c.rules->>'containsFlowerType', '')
        ) s
        WHERE length(trim(tok)) > 0
          AND _sf_resolve_flower_type_id(tok) IS NOT NULL
      ) x
    ),
    true
  ),
  updated_at = CURRENT_TIMESTAMP
WHERE c.rules IS NOT NULL
  AND jsonb_typeof(c.rules) = 'object'
  AND (
    c.rules ? 'flowerTypeSlugs'
    OR c.rules ? 'containsFlowerType'
    OR c.rules ? 'containsFlowerTypeSlugs'
  )
  AND NOT (c.rules ? 'flowerTypeIds')
  AND EXISTS (
    SELECT 1
    FROM (
      SELECT jsonb_array_elements_text(COALESCE(c.rules->'flowerTypeSlugs', '[]'::jsonb)) AS tok
      UNION ALL
      SELECT jsonb_array_elements_text(COALESCE(c.rules->'containsFlowerTypeSlugs', '[]'::jsonb))
      UNION ALL
      SELECT COALESCE(c.rules->>'containsFlowerType', '')
    ) s
    WHERE length(trim(tok)) > 0
      AND _sf_resolve_flower_type_id(tok) IS NOT NULL
  );

-- onlyFlowerTypeIds from onlyFlowerType / onlyFlowerTypeSlugs
UPDATE catalog_categories c
SET
  rules = jsonb_set(
    COALESCE(c.rules, '{}'::jsonb),
    '{onlyFlowerTypeIds}',
    (
      SELECT COALESCE(jsonb_agg(to_jsonb(x.id::text) ORDER BY x.id::text), '[]'::jsonb)
      FROM (
        SELECT DISTINCT _sf_resolve_flower_type_id(tok) AS id
        FROM (
          SELECT jsonb_array_elements_text(COALESCE(c.rules->'onlyFlowerTypeSlugs', '[]'::jsonb)) AS tok
          UNION ALL
          SELECT COALESCE(c.rules->>'onlyFlowerType', '')
        ) s
        WHERE length(trim(tok)) > 0
          AND _sf_resolve_flower_type_id(tok) IS NOT NULL
      ) x
    ),
    true
  ),
  updated_at = CURRENT_TIMESTAMP
WHERE c.rules IS NOT NULL
  AND jsonb_typeof(c.rules) = 'object'
  AND (c.rules ? 'onlyFlowerType' OR c.rules ? 'onlyFlowerTypeSlugs')
  AND NOT (c.rules ? 'onlyFlowerTypeIds')
  AND EXISTS (
    SELECT 1
    FROM (
      SELECT jsonb_array_elements_text(COALESCE(c.rules->'onlyFlowerTypeSlugs', '[]'::jsonb)) AS tok
      UNION ALL
      SELECT COALESCE(c.rules->>'onlyFlowerType', '')
    ) s
    WHERE length(trim(tok)) > 0
      AND _sf_resolve_flower_type_id(tok) IS NOT NULL
  );

-- flowerFormIds from flowerFormSlugs (unique slug globally — forms are per-type;
-- only set when exactly one form row matches the slug).
UPDATE catalog_categories c
SET
  rules = jsonb_set(
    COALESCE(c.rules, '{}'::jsonb),
    '{flowerFormIds}',
    (
      SELECT COALESCE(jsonb_agg(to_jsonb(x.id::text) ORDER BY x.id::text), '[]'::jsonb)
      FROM (
        SELECT DISTINCT ff.id
        FROM jsonb_array_elements_text(COALESCE(c.rules->'flowerFormSlugs', '[]'::jsonb)) AS tok
        JOIN flower_forms ff ON lower(ff.slug) = lower(trim(tok))
        WHERE length(trim(tok)) > 0
          AND (
            SELECT count(*) FROM flower_forms f2 WHERE lower(f2.slug) = lower(trim(tok))
          ) = 1
      ) x
    ),
    true
  ),
  updated_at = CURRENT_TIMESTAMP
WHERE c.rules IS NOT NULL
  AND jsonb_typeof(c.rules) = 'object'
  AND c.rules ? 'flowerFormSlugs'
  AND NOT (c.rules ? 'flowerFormIds')
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(COALESCE(c.rules->'flowerFormSlugs', '[]'::jsonb)) AS tok
    JOIN flower_forms ff ON lower(ff.slug) = lower(trim(tok))
    WHERE length(trim(tok)) > 0
      AND (SELECT count(*) FROM flower_forms f2 WHERE lower(f2.slug) = lower(trim(tok))) = 1
  );

-- ---------------------------------------------------------------------------
-- SeoLandingPage.rules (legacy dual-read) — same enrichments, no DROP
-- ---------------------------------------------------------------------------
UPDATE seo_landing_pages s
SET
  rules = jsonb_set(
    COALESCE(s.rules, '{}'::jsonb),
    '{flowerTypeIds}',
    (
      SELECT COALESCE(jsonb_agg(to_jsonb(x.id::text) ORDER BY x.id::text), '[]'::jsonb)
      FROM (
        SELECT DISTINCT _sf_resolve_flower_type_id(tok) AS id
        FROM (
          SELECT jsonb_array_elements_text(COALESCE(s.rules->'flowerTypeSlugs', '[]'::jsonb)) AS tok
          UNION ALL
          SELECT jsonb_array_elements_text(COALESCE(s.rules->'containsFlowerTypeSlugs', '[]'::jsonb))
          UNION ALL
          SELECT COALESCE(s.rules->>'containsFlowerType', '')
        ) t
        WHERE length(trim(tok)) > 0
          AND _sf_resolve_flower_type_id(tok) IS NOT NULL
      ) x
    ),
    true
  ),
  updated_at = CURRENT_TIMESTAMP
WHERE s.rules IS NOT NULL
  AND jsonb_typeof(s.rules) = 'object'
  AND (
    s.rules ? 'flowerTypeSlugs'
    OR s.rules ? 'containsFlowerType'
    OR s.rules ? 'containsFlowerTypeSlugs'
  )
  AND NOT (s.rules ? 'flowerTypeIds')
  AND EXISTS (
    SELECT 1
    FROM (
      SELECT jsonb_array_elements_text(COALESCE(s.rules->'flowerTypeSlugs', '[]'::jsonb)) AS tok
      UNION ALL
      SELECT jsonb_array_elements_text(COALESCE(s.rules->'containsFlowerTypeSlugs', '[]'::jsonb))
      UNION ALL
      SELECT COALESCE(s.rules->>'containsFlowerType', '')
    ) t
    WHERE length(trim(tok)) > 0
      AND _sf_resolve_flower_type_id(tok) IS NOT NULL
  );

UPDATE seo_landing_pages s
SET
  rules = jsonb_set(
    COALESCE(s.rules, '{}'::jsonb),
    '{onlyFlowerTypeIds}',
    (
      SELECT COALESCE(jsonb_agg(to_jsonb(x.id::text) ORDER BY x.id::text), '[]'::jsonb)
      FROM (
        SELECT DISTINCT _sf_resolve_flower_type_id(tok) AS id
        FROM (
          SELECT jsonb_array_elements_text(COALESCE(s.rules->'onlyFlowerTypeSlugs', '[]'::jsonb)) AS tok
          UNION ALL
          SELECT COALESCE(s.rules->>'onlyFlowerType', '')
        ) t
        WHERE length(trim(tok)) > 0
          AND _sf_resolve_flower_type_id(tok) IS NOT NULL
      ) x
    ),
    true
  ),
  updated_at = CURRENT_TIMESTAMP
WHERE s.rules IS NOT NULL
  AND jsonb_typeof(s.rules) = 'object'
  AND (s.rules ? 'onlyFlowerType' OR s.rules ? 'onlyFlowerTypeSlugs')
  AND NOT (s.rules ? 'onlyFlowerTypeIds')
  AND EXISTS (
    SELECT 1
    FROM (
      SELECT jsonb_array_elements_text(COALESCE(s.rules->'onlyFlowerTypeSlugs', '[]'::jsonb)) AS tok
      UNION ALL
      SELECT COALESCE(s.rules->>'onlyFlowerType', '')
    ) t
    WHERE length(trim(tok)) > 0
      AND _sf_resolve_flower_type_id(tok) IS NOT NULL
  );

DROP FUNCTION IF EXISTS _sf_resolve_flower_type_id(text);

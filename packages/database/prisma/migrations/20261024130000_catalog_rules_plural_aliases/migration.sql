-- Follow-up: enrich remaining STEM leaf rules whose page slug is a plural
-- (hrizantemy, gerbery, tyulpany, lilii) after aliases were expanded.
-- Idempotent: only rows still missing flowerTypeIds; keeps slug keys.

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

DROP FUNCTION IF EXISTS _sf_resolve_flower_type_id(text);

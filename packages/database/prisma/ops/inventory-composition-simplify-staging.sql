-- READ-ONLY inventory for staging (Task 01 composition / FlowerType.composition_class).
-- Do NOT run writes. Operator: psql "$DATABASE_URL" -f this file
-- DB validation from Cursor: BLOCKED without VPS/local Postgres.

\echo '=== flower_types overview (composition_class may be missing before expand) ==='
SELECT
  ft.id,
  ft.slug,
  ft.name,
  ft.visibility::text AS visibility,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'flower_types' AND column_name = 'composition_class'
    ) THEN COALESCE(ft.composition_class::text, 'NULL_UNCLASSIFIED')
    ELSE 'COLUMN_ABSENT'
  END AS composition_class,
  (SELECT COUNT(*) FROM flower_items fi WHERE fi.flower_type_id = ft.id) AS items_count
FROM flower_types ft
ORDER BY ft.sort_order, ft.name;

\echo '=== product_components totals ==='
SELECT COUNT(*) AS components FROM product_components;

\echo '=== missing / invalid flower_item_id ==='
SELECT COUNT(*) AS invalid_flower_refs
FROM product_components pc
WHERE pc.flower_item_id IS NULL
   OR NOT EXISTS (SELECT 1 FROM flower_items fi WHERE fi.id = pc.flower_item_id);

\echo '=== duplicate (product_id, flower_item_id) groups ==='
SELECT COUNT(*) AS dup_groups
FROM (
  SELECT product_id, flower_item_id
  FROM product_components
  GROUP BY product_id, flower_item_id
  HAVING COUNT(*) > 1
) d;

\echo '=== role distribution (legacy ComponentRole — expected on staging until CONTRACT) ==='
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'product_components' AND column_name = 'role'
    ) THEN 'role_column_present'
    ELSE 'role_column_absent'
  END AS role_column_status;

-- Role × FlowerType usage (only if role column exists)
\echo '=== FlowerType × legacy role usage ==='
SELECT
  ft.slug,
  ft.name,
  pc.role::text AS role,
  COUNT(*) AS component_rows,
  COUNT(DISTINCT pc.product_id) AS products
FROM product_components pc
JOIN flower_items fi ON fi.id = pc.flower_item_id
JOIN flower_types ft ON ft.id = fi.flower_type_id
GROUP BY ft.slug, ft.name, pc.role
ORDER BY ft.name, pc.role;

\echo '=== types ONLY greenery roles (candidate DECORATIVE — do NOT auto-apply) ==='
SELECT ft.slug, ft.name, COUNT(*) AS component_rows
FROM flower_types ft
JOIN flower_items fi ON fi.flower_type_id = ft.id
JOIN product_components pc ON pc.flower_item_id = fi.id
GROUP BY ft.id, ft.slug, ft.name
HAVING BOOL_AND(pc.role IN ('GREENERY', 'FILLER', 'OTHER'))
ORDER BY ft.name;

\echo '=== types ONLY PRIMARY (candidate BLOOM — do NOT auto-apply) ==='
SELECT ft.slug, ft.name, COUNT(*) AS component_rows
FROM flower_types ft
JOIN flower_items fi ON fi.flower_type_id = ft.id
JOIN product_components pc ON pc.flower_item_id = fi.id
GROUP BY ft.id, ft.slug, ft.name
HAVING BOOL_AND(pc.role = 'PRIMARY')
ORDER BY ft.name;

\echo '=== CONFLICTING types (PRIMARY and greenery) — must stay unclassified until human decision ==='
SELECT ft.slug, ft.name,
  COUNT(*) FILTER (WHERE pc.role = 'PRIMARY') AS as_primary,
  COUNT(*) FILTER (WHERE pc.role IN ('GREENERY', 'FILLER', 'OTHER')) AS as_greenery
FROM flower_types ft
JOIN flower_items fi ON fi.flower_type_id = ft.id
JOIN product_components pc ON pc.flower_item_id = fi.id
GROUP BY ft.id, ft.slug, ft.name
HAVING COUNT(*) FILTER (WHERE pc.role = 'PRIMARY') > 0
   AND COUNT(*) FILTER (WHERE pc.role IN ('GREENERY', 'FILLER', 'OTHER')) > 0
ORDER BY ft.name;

\echo '=== types never used in composition ==='
SELECT ft.slug, ft.name
FROM flower_types ft
WHERE NOT EXISTS (
  SELECT 1
  FROM flower_items fi
  JOIN product_components pc ON pc.flower_item_id = fi.id
  WHERE fi.flower_type_id = ft.id
)
ORDER BY ft.name;

\echo '=== published floral products that would be UNKNOWN if all types stay null ==='
SELECT COUNT(DISTINCT p.id) AS published_floral_with_components
FROM products p
JOIN product_components pc ON pc.product_id = p.id
WHERE p.lifecycle = 'PUBLISHED'
  AND p.product_kind IN ('BOUQUET', 'COMPOSITION', 'STEM');

\echo '=== current composition_kind distribution ==='
SELECT composition_kind::text, product_kind::text, COUNT(*) AS n
FROM products
GROUP BY composition_kind, product_kind
ORDER BY n DESC;

\echo '=== catalog rules using qty/dominant (contract concern) ==='
SELECT id, slug, page_status::text, page_kind::text
FROM catalog_categories
WHERE rules ?| ARRAY[
  'minFlowerTypeQuantity', 'flowerTypeQuantitySlug', 'dominantFlowerTypeSlug',
  'min_flower_type_quantity', 'flower_type_quantity_slug', 'dominant_flower_type_slug'
];

\echo '=== filter pool quantity / composition_kind ==='
SELECT key, supported, label
FROM catalog_filter_definitions
WHERE key IN ('quantity', 'composition_kind');

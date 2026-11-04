-- READ-ONLY inventory: product short vs legacy long descriptions (Task 03).
-- Do NOT run on production from Cursor. Operator runs on VPS / staging copy only.
-- Never UPDATE/DELETE from this script.

\echo '=== totals ==='
SELECT
  COUNT(*) AS products,
  COUNT(*) FILTER (WHERE NULLIF(BTRIM(short_description), '') IS NOT NULL) AS has_short,
  COUNT(*) FILTER (WHERE NULLIF(BTRIM(description), '') IS NOT NULL) AS has_legacy_long,
  COUNT(*) FILTER (
    WHERE NULLIF(BTRIM(short_description), '') IS NOT NULL
      AND NULLIF(BTRIM(description), '') IS NOT NULL
  ) AS has_both,
  COUNT(*) FILTER (
    WHERE NULLIF(BTRIM(short_description), '') IS NULL
      AND NULLIF(BTRIM(description), '') IS NOT NULL
  ) AS legacy_long_only,
  COUNT(*) FILTER (
    WHERE NULLIF(BTRIM(short_description), '') IS NOT NULL
      AND NULLIF(BTRIM(description), '') IS NOT NULL
      AND BTRIM(short_description) = BTRIM(description)
  ) AS both_equal,
  COUNT(*) FILTER (
    WHERE NULLIF(BTRIM(short_description), '') IS NOT NULL
      AND NULLIF(BTRIM(description), '') IS NOT NULL
      AND BTRIM(short_description) <> BTRIM(description)
  ) AS both_differ,
  COUNT(*) FILTER (
    WHERE NULLIF(BTRIM(short_description), '') IS NULL
      AND NULLIF(BTRIM(description), '') IS NULL
  ) AS both_empty
FROM products;

\echo '=== legacy long only (runtime falls back to description until short is filled) ==='
SELECT id, slug, lifecycle, LEFT(BTRIM(description), 120) AS legacy_preview
FROM products
WHERE NULLIF(BTRIM(short_description), '') IS NULL
  AND NULLIF(BTRIM(description), '') IS NOT NULL
ORDER BY updated_at DESC
LIMIT 50;

\echo '=== both filled and DIFFER (manual review — do not auto-merge) ==='
SELECT
  id,
  slug,
  lifecycle,
  LEFT(BTRIM(short_description), 80) AS short_preview,
  LEFT(BTRIM(description), 80) AS legacy_preview,
  LENGTH(BTRIM(short_description)) AS short_len,
  LENGTH(BTRIM(description)) AS legacy_len
FROM products
WHERE NULLIF(BTRIM(short_description), '') IS NOT NULL
  AND NULLIF(BTRIM(description), '') IS NOT NULL
  AND BTRIM(short_description) <> BTRIM(description)
ORDER BY updated_at DESC
LIMIT 100;

\echo '=== both empty (publish will be blocked for description readiness) ==='
SELECT id, slug, lifecycle, name
FROM products
WHERE NULLIF(BTRIM(short_description), '') IS NULL
  AND NULLIF(BTRIM(description), '') IS NULL
ORDER BY updated_at DESC
LIMIT 50;

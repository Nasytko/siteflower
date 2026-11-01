-- Task 03 FUTURE cleanup — NOT part of prisma migrate history until explicitly promoted.
--
-- SAFETY: This file lives under prisma/deferred/, NOT prisma/migrations/.
-- `prisma migrate deploy` / `pnpm db:migrate:deploy` will NEVER execute it
-- (migrations.path in prisma.config.ts points only at prisma/migrations).
--
-- Preconditions (all required) before promoting into prisma/migrations:
-- 1) reconcileCatalogSeoLegacy / buildCatalogSeoReconcileReport → blockedForLegacyDrop === false
-- 2) Application code has zero reads of seoLandingPage* (grep clean on main)
-- 3) Public storefront, sitemap, SEO health use CatalogCategory only in production
-- 4) DB backup verified; rollback = restore backup
--
-- Suggested preflight (read-only) before promoting into prisma/migrations:
--   SELECT count(*) AS legacy_published
--   FROM seo_landing_pages WHERE status = 'PUBLISHED';
--   SELECT s.slug
--   FROM seo_landing_pages s
--   LEFT JOIN catalog_categories c ON c.slug = s.slug AND c.page_kind = 'THEMATIC'
--   WHERE c.id IS NULL;
--   -- Expect 0 rows for published orphans.
--
-- SeoLandingPage Prisma models stay in schema.prisma until this ships.

DROP TABLE IF EXISTS "seo_landing_page_excludes";
DROP TABLE IF EXISTS "seo_landing_page_products";
DROP TABLE IF EXISTS "seo_landing_pages";
-- Optional follow-up: DELETE FROM "slug_redirects" WHERE "entity_type" = 'SEO_LANDING';

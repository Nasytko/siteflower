-- Task 05 cleanup-plan: task05-seo-landing-drop.v1
-- NOT in prisma/migrations until --cleanup-plan installs it for an approved run.
--
-- Gates (enforced by deploy/lib/cleanup-plan.sh):
-- 1) Plan status=approved + SHOPBUKET1_CLEANUP_APPROVAL_TOKEN matches plan.approvalToken
-- 2) SEO reconcile blockedForLegacyDrop === false (or SQL orphan checks pass)
-- 3) Verified backup + restore-test on explicit isolated DB
--
-- Drops legacy SeoLandingPage tables. CatalogCategory remains SoT.
-- Does NOT delete slug_redirects (SEO_LANDING rows kept for URL history).
-- Does NOT touch products, orders, media, erp_sku_registry.

DROP TABLE IF EXISTS "seo_landing_page_excludes";
DROP TABLE IF EXISTS "seo_landing_page_products";
DROP TABLE IF EXISTS "seo_landing_pages";

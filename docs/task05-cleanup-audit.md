# Task 05 — Deep Database Cleanup Audit

Date: 2026-11-02. Scope: SiteFlower schema + code. No production data deleted.

## Architecture boundary

| System | Owns |
|--------|------|
| **ERP** | Production recipes, warehouse, stock |
| **Site** | Catalog, SEO, public composition summary, prices, orders, ERP SKU registry (identity link) |

## Matrix (deletion candidates)

| Candidate | Why existed | Used now | Data? | Moved to | Delete? | Risks | Verify |
|-----------|-------------|----------|-------|----------|---------|-------|--------|
| `seo_landing_pages` (+ pin/exclude) | Pre-unify SEO landings | Reconcile only | Unknown (VPS) | `catalog_categories` THEMATIC + `catalog_page_*` | **Blocked** until reconcile PASS + approved cleanup-plan | Pin sets not copied in unify; orphan published slugs | `seo-reconcile`; cleanup SQL gates |
| `Product.diameter_cm` | Old diameter merchandising | Deprecated; no editor write; not public | May be non-null hist. | None (retired) | **Yes** — migration `20261102010000` | Loses unused hist. values | `SELECT count(*) WHERE diameter_cm IS NOT NULL` |
| `ProductComponent.quantity` | Recipe counts | Admin + filters; hidden on public PDP | Yes | Still site-side until ERP recipe SoT | **KEEP** | Breaks EXACT composition | — |
| `product_variants` | Sellable tiers | Core commerce | Yes | — | **KEEP** | Total commerce fail | — |
| `SlugEntityType.SEO_LANDING` rows | Legacy redirects | Still merged in category resolve | Unknown | Prefer `CATALOG_CATEGORY` | Later optional | 404 bookmarks | count + seo-smoke |
| `CatalogPageKind.LEGACY` rows | Pre-hub categories | Sitemap/reconcile | Unknown | Reclassify to hub/thematic | Data migrate, not DROP enum | Wrong PLP | `GROUP BY page_kind` |
| `outbox_events.attempts` | Old counter | Dual-written with `attempt_count` | Yes | `attempt_count` | Later hygiene | Low | grep |
| `CUSTOM_URL` nav | Custom menu links | Live feature | Yes | — | **KEEP** | — | — |

## KEEP (explicit)

- `erp_sku_registry`, orders / order_items snapshots, `slug_redirects`, `catalog_categories`, `audit_logs`, media/S3, backups, secrets

## Removals in this change set

1. **Column `products.diameter_cm`** — Prisma + contracts + API mapper/DTO/duplicate path; forward migration in `prisma/migrations`.
2. **Code only** — no parallel SEO architecture; SEO DROP prepared under cleanup-plan, not auto-applied.

## Prepared but NOT applied (needs your approval)

- Plan: `deploy/cleanup-plans/task05-seo-landing-drop.v1.json` (`status: prepared`)
- SQL: `packages/database/prisma/cleanup-plans/task05-seo-landing-drop.v1/migrations/...`
- Normal `./deploy.sh production` does **not** install these migrations.

## Data fate summary

| Data | Fate |
|------|------|
| Products, orders, images, SEO redirects, ERP SKUs | **Preserved** |
| `diameter_cm` values | **Dropped** with column (unused) |
| `seo_landing_*` rows | **Preserved until** approved cleanup-plan |
| Pin/exclude on legacy only | Must be migrated to `catalog_page_*` before DROP |

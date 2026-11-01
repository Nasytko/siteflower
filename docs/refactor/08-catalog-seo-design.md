# Task 01 — Catalog SEO & public pages

**Status:** design for review — **not implemented**  
**Aligns with:** [06](./06-target-architecture.md) D3–D4 · [07](./07-prisma-design.md) P5/P7 · roadmap B*/D* in [10](./10-implementation-roadmap.md)

---

## Target URL space

| Surface | Canonical | Data |
| --- | --- | --- |
| Hub / thematic / gift PLP | `/catalog`, `/catalog/[slug]` | `CatalogCategory` |
| PDP | `/products/[slug]` | `Product` |
| Occasion / recipient | `/povod`, `/komu` | Taxonomies |
| Legacy paths | 301 → canonical | `public-routes.ts` + `next.config.ts` |

Indexing: `ALLOW_INDEXING` + `apps/web/src/lib/seo/*`; thin filtered duplicates stay noindex.

---

## Decision S1 — CatalogCategory is the only page CMS

**Rationale:** One place for h1/body/SEO/rules/pins/excludes/filters.

**Chosen:** keep Category + page pin/exclude/filter tables; admin `/admin/catalog/pages`.

**Alternatives:** SeoLanding primary — rejected; static MDX CMS — rejected for merchandised catalog.

**Files:** `CatalogCategory*`; `catalog-pages.service.ts`; `admin-catalog-pages.controller.ts`; `public-catalog.*`; storefront `catalog/**`; `catalog-pages-manager.tsx`; `resolveCategoryListingScope`.

**Acceptance:** thematic create/edit only via catalog pages API/UI; no create-LEGACY in admin going forward.

---

## Decision S2 — Sequential SeoLanding retirement (no dual primary)

**Rationale:** R01/R03/R05 — dual sitemap and dual write.

**Current residual:** `seo-landings.service.ts` public+sitemap; public seo-landings routes; admin write controller; UI redirect stubs; unused `getSeoLanding*` in `public-api.ts`.

**Sequence:** B1 public read+sitemap → B1b pins → B2 remove admin write → B3 web cleanup → D* DROP after VPS proof.

**Alternatives:** eternal dual-read — rejected; DROP before code — rejected.

**Files to stop using / remove:** `seo-landings.service.ts` (public paths), `admin-seo-landings.controller.ts`, sitemap merge in `public-catalog.service.ts`, `getSeoLanding*`, `admin-endpoints.ts` `seoLandings*`, redirect stubs under `seo/landings` and `catalog/categories`.

**Keep temporarily:** `/p`→`/catalog` redirects until traffic proof.

**Acceptance:** thematic sitemap URLs resolve via category 200; App Router has zero `getSeoLanding` imports; admin cannot write SeoLanding; dual-read not required for storefront.

---

## Decision S3 — Public PLP pin merge (R25)

**Rationale:** Admin preview and SEO landing list prepend pins; public category list does not — merchandising lie.

**Chosen:** pins-first (`sortOrder`), then rule matches, minus excludes — same as `catalog-pages.service.ts` preview.

**Alternatives:** pins as score boost — defer; pins admin-only — rejected.

**Files:** `catalog-listing.util.ts` and/or `public-catalog.service.ts`; reference preview merge in `catalog-pages.service.ts`.

**Acceptance:** unit test (preferred while R21 ban holds) proves pin order on public list DTO; excludes never appear; non-public pinned products skipped per documented policy (propose: skip).

---

## Decision S4 — Filters stay on Category; UI must be reachable

**Rationale:** R26 — `CategoryFiltersEditor` orphaned after categories→pages redirect.

**Chosen:** keep `CatalogFilterDefinition` / `CatalogCategoryFilter`; embed editor in pages manager (roadmap B6).

**Files:** `catalog-filters.service.ts`; `category-filters-editor.tsx`; `catalog-pages-manager.tsx`.

**Acceptance:** manager enables facet from pages UI; storefront category filters reflect it; qty facets still EXACT-only.

---

## Decision S5 — Rules signals stay on Category.rules + traits

**Rationale:** flower/type/composition/AUTHORIAL matching already in contracts match pipeline.

**Files:** `catalog-page-rules.ts`; `catalog-match.service.ts`; AUTHORIAL via `traitKeys` in pages manager.

**Acceptance:** never treat `CatalogCategory.slug` as `FlowerType.slug`; AUTHORIAL thematic works without SeoLanding.

---

## Decision S6 — Redirect map single source

**Rationale:** R09 drift.

**Chosen:** `packages/contracts/src/public-routes.ts` SoT; Next generated or CI-diffed.

**Files:** `public-routes.ts`, `apps/web/next.config.ts`.

**Acceptance:** one-sided redirect edit fails CI or is impossible after generate.

---

## Decision S7 — Remove dead SEO surfaces

**Files:** `flower-type-landing.tsx` (remove); seo-health / admin SEO links → catalog pages.

**Acceptance:** grep zero imports; health panel does not open landings CRUD.

---

## Test note

While **R21 = P0 OPEN**, prefer **unit** coverage for listing/match/pin merge. Do not re-run API DB integration under the organizational ban ([00.1-db-integration-ban.md](./00.1-db-integration-ban.md)).

# Task 00 — Legacy & catalog inventory

**Status:** audit inventory (Task 00); target decisions finalized in Task 01 [06](./06-target-architecture.md)–[07](./07-prisma-design.md)  
Evidence-based registry of catalog-domain implementations. Paths are repo-relative.

**Contract pattern:** no Zod for catalog domain. Prisma models + TypeScript DTOs in `packages/contracts` + Nest `class-validator` DTOs in `apps/api`.

**Decision column** uses: **KEEP** · **REWORK** · **REMOVE** (see also [05-proposed-changes.md](./05-proposed-changes.md)).  
Data on VPS was **not** inspected; “usage” below means **codebase** usage unless noted.

---

## Global legacy vs current

| Concept | Decision | Status | Evidence |
| --- | --- | --- | --- |
| `Flower` table + `flower_id` XOR | already gone | Removed historically | `…/20261018120000_drop_legacy_flower_size_line/` |
| `FlowerItem` + required `flowerItemId` | **KEEP** | Current | `schema.prisma` |
| `assertComponentFlowerRefXor` name | **REWORK** | Live check, legacy name | `packages/contracts/src/catalog.ts` |
| `SeoLandingPage*` | **REMOVE** after cutover | Deprecated dual-read in code | schema `@deprecated`; API still wired |
| `CatalogCategory` THEMATIC + pins | **KEEP** | Current pages | unify migration + admin pages |
| `/p`, `/katalog`, `/bukety` redirects | **KEEP** (temp) | Legacy URLs | `public-routes.ts`, `next.config.ts` |
| `Product.diameterCm` | **REMOVE** later | Deprecated column | schema comment; editor does not write |
| `CatalogPageKind.LEGACY` | **REWORK** | Transitional | still queried in public/pages services |

---

## 1. Product & ProductVariant

### Declared
- Prisma: `packages/database/prisma/schema.prisma` — `Product`, `ProductVariant`
- Contracts: `packages/contracts/src/catalog.ts` — `ProductListItemDto`, `ProductAdminDto`, `ProductPublicDto`, `ProductVariantDto`
- API DTOs: `apps/api/src/catalog/products.dto.ts`

### Read
- API: `products.service.ts`, `products.repository.ts`, `catalog.mapper.ts`, `public-catalog.service.ts`
- Web storefront: `apps/web/src/app/(storefront)/products/[slug]/page.tsx`, `catalog/page.tsx`, `catalog/[slug]/page.tsx`, `lib/public-api.ts`
- Web admin: product manager/editor under `apps/web/src/components/admin/` + `admin/catalog/products/**`
- Orders: `apps/api/src/orders/orders.service.ts`, `cart-validation.ts`

### Mutated
- Admin products controller + repository sync (`syncVariants`, traits, taxonomies, components)
- Seed: `apps/api/scripts/seed-dev-catalog.ts`

### API / interfaces
- Admin: `/api/v1/admin/catalog/products` (+ editor, variants, components, publish, bulk, media)
- Public: `/api/v1/catalog/products`, `/products/:slug`, related/promotions/bestsellers

### Duplicates
- Display/effective price derivation appears in mapper, listing util, and cart/orders promotion logic (intentional layering, not a second product model).

### Tests
- Unit: `catalog.logic.spec.ts`, `catalog.mapper.display.spec.ts`, `product-lifecycle.policy.spec.ts`, `product-duplicate.util.spec.ts`, `products-bulk.util.spec.ts`, `packages/contracts/src/catalog.test.ts`
- Integration: `apps/api/test/product-*.integration-spec.ts`, `storefront-catalog.integration-spec.ts`, `commerce.integration-spec.ts`
- E2E: `e2e/commerce.spec.ts` (fixture `ameli`), `storefront`, `media`, `smoke`, `visual-qa`

### Removal impact
**Catastrophic** — entire commerce + catalog storefront/admin.

---

## 2. ProductComponent & FlowerItem

### Declared
- Prisma: `FlowerItem`, `ProductComponent` (+ `FlowerType` / `Form` / `Variety` / `Origin`)
- Contracts: `FlowerItemDto`, `ProductComponentDto`, `flowerItemIdentityKey`, `deriveCompositionKind`, `assertComponentFlowerRefXor`
- Utils: `apps/api/src/catalog/flower-item.util.ts`, `product-component-xor.util.ts`

### Read
- Composition filters via `products.repository.ts`
- Public flower facets: `public-catalog.controller.ts`
- PDP composition via mapper
- Admin flower structure + product editor composition
- Match rules: `catalog-page-rules.ts`, `catalog-match.service.ts`

### Mutated
- Flower dictionary CRUD: `flower-refs.service.ts`, `admin-flower-refs.controller.ts`
- Composition writes: product components/editor → `normalizeComposition` + `replaceComponents`
- Seed creates FlowerItems + components

### API
- Admin flower-refs CRUD; product `/components` + `/editor`
- Public embeds components on product detail; flower-type lists

### Duplicates / legacy notes
- **FlowerItem is current**, not legacy.
- Parallel color channels: `FlowerItem.colorId` (dictionary) vs `ProductComponent.colorId` (line snapshot) vs `ProductColor` (bouquet palette).

### Tests
- `flower-item.util.spec.ts`, `product-component-xor.util.spec.ts`, `composition-invariants.spec.ts`
- Integration: `catalog-taxonomy-lifecycle.integration-spec.ts`
- Contracts: `catalog.test.ts`

### Removal impact
Breaks composition editing, mono/mixed derivation, flower filters, thematic stem rules, seed catalog.

---

## 3. compositionPrecision & compositionKind

### Declared
- Prisma enums on `Product`: `CompositionKind`, `CompositionPrecision`
- Contracts: `COMPOSITION_KINDS`, `COMPOSITION_PRECISIONS`, `deriveCompositionKind`, `resolveStoredCompositionKind`, `COMPOSITION_KIND_CATEGORY_SLUGS`

### Read
- Listing filters (`compositionKind`); quantity filters require `EXACT`
- Thematic rules (e.g. monobuquets)
- Placement/match utilities

### Mutated
- **Kind derived on save** in `products.service.ts` `normalizeComposition` (not free-form admin enum)
- Precision from editor input with empty-composition fallbacks
- Historical seed in unify migration for mono thematic rules

### Tests
- `packages/contracts/src/catalog.test.ts`, `catalog-page-rules.test.ts`
- `products.repository.filter.spec.ts`, `catalog-match.semantics.spec.ts`, `catalog-match-classification.integration-spec.ts`

### Removal impact
Wrong/empty thematic PLPs; unreliable quantity filters; broken readiness/composition summary.

---

## 4. ProductFamily

### Declared
- Prisma: `ProductFamily`, `ProductFamilyMember`
- Contracts: `ProductFamilyDto`, `ProductFamilyMemberDto`
- Created: migration `20261004120000_catalog_family_categories`

### Read
- Embedded via `familyMember` in mapper
- Storefront: `product-family-switcher.tsx`
- Admin related/family UI

### Mutated
- `product-families.service.ts` + admin controller
- Product related link/unlink → `setProductFamilyInTx`
- **Not** created by `seed-dev-catalog.ts`

### Tests
- Indirect via mapper/contracts; **no dedicated e2e** for family switcher found

### Removal impact
PDP cross-product switching gone; admin related linking breaks. Listing `familyId` filter becomes dead if present.

**Do not confuse** with `ProductVariant` (in-card commerce) or `CatalogCategory` (nav/pages).

---

## 5. ProductTraitDefinition (+ ProductTrait)

### Declared
- Prisma: `ProductTraitDefinition`, `ProductTrait`
- Contracts: `ProductTraitDefinitionDto`; products expose `traitKeys`
- Seeded (e.g. `AUTHORIAL`) in unify migration

### Read
- `catalog-pages.service.ts` `listTraitDefinitions()`
- Product filters + thematic rules (`avtorskie-bukety` / signature)
- Placement match util

### Mutated
- Definitions: **migration-seeded**; list API only (`GET admin/catalog/pages/traits`) — no full definition CRUD found
- Product links: editor `traitKeys` → `replaceTraitsByKeys`

### Tests
- `seo-landings.rules.spec.ts`, `products.repository.filter.spec.ts`, contracts rules tests

### Removal impact
Authorial/signature thematic matching and trait badges/filters break.

---

## 6. CatalogCategory

### Declared
- Prisma model + `CatalogPageKind`, `rules`, SEO fields, `pageStatus`
- Contracts: category/page DTOs, listing-kind helpers, `resolveCatalogCategoryIdForProductKind`

### Read
- `catalog-categories.service.ts`, `public-catalog.service.ts`
- Web: `catalog/[slug]/page.tsx`, nav, discovery, sitemap
- Product placement via `catalogCategoryId`

### Mutated
- Admin categories + unified pages controllers/services
- Scripts: `migrate-catalog-page-rules.ts`, `ensure-catalog-slug-redirects.ts`, `migrate-legacy-nav-urls.ts`

### API
- Admin: `/admin/catalog/categories`, `/admin/catalog/pages`
- Public: `/catalog/categories/tree`, `/categories/:slug`, `/categories/:slug/filters`

### Duplicates
- Dual with `SeoLandingPage` for thematic content (see §8)
- URL dualism handled by redirects (`/katalog` → `/catalog`)

### Tests
- `catalog-categories.util.spec.ts`, `catalog-listing.util.spec.ts`, `catalog-rules-migration.spec.ts`, `placement-catalog-pages.spec.ts`
- Web: `katalog-search-params.test.ts`, `storefront-nav.test.ts`
- Integration + e2e storefront journeys

### Removal impact
All PLPs, nav category targets, thematic merchandising, filter pools, product placement, category sitemap URLs.

---

## 7. CatalogPageProduct (+ CatalogPageExclude)

### Declared
- Prisma: `CatalogPageProduct`, `CatalogPageExclude` on `CatalogCategory`
- Created in `20261019120000_unify_catalog_pages`

### Read / mutate
- `catalog-pages.service.ts` (include + replace pin/exclude on update)
- Listing/match merge for thematic pages
- Admin pages manager + placement panel

### API
- Via `/admin/catalog/pages` bodies; match diagnose endpoint

### Duplicate
- Parallel tables: `SeoLandingPageProduct` / `SeoLandingPageExclude`

### Tests
- Placement/catalog-pages specs; match classification integration

### Removal impact
Manual pin/exclude merchandising on unified pages stops working.

---

## 8. SeoLandingPage (LEGACY — still live)

### Declared
- Prisma `@deprecated` model + pin/exclude (`schema.prisma` ~943–993)
- Contracts: `SeoLandingPageDto`, `SeoLandingPagePublicDto`
- Created: `20261018180000_composition_role_color_seo_landing`
- Copied → categories: `20261019120000_unify_catalog_pages` (**tables retained**)

### Read (live)
- `apps/api/src/catalog/seo-landings.service.ts` — admin + public dual-read + sitemap entries
- `public-catalog.controller.ts` — `GET /catalog/seo-landings/:slug(+ /products)`
- `public-catalog.service.ts` `getSitemap()` merges `seoLandings.listSitemapEntries()`
- Web helpers **defined** in `apps/web/src/lib/public-api.ts` (`getSeoLanding`, `listSeoLandingProducts`)

### Read (storefront pages)
- **No App Router page imports `getSeoLanding`** (grep: only defined in `public-api.ts`)
- PLP uses `getCatalogCategory` only
- `/p/:slug` → permanent redirect to `/catalog/:slug` (`public-routes.ts`, `next.config.ts`)

### Mutated (still writable)
- `admin-seo-landings.controller.ts` — `/api/v1/admin/seo/landings`
- Admin UI route `apps/web/src/app/(admin)/admin/(shell)/seo/landings/page.tsx` **only redirects** to `/admin/catalog/pages`
- `seo-health.service.ts` still links findings to `/admin/seo/landings`

### Duplicates (major)

| Concern | Legacy | Current |
| --- | --- | --- |
| Entity | `SeoLandingPage` | `CatalogCategory` THEMATIC |
| Pins | `SeoLandingPageProduct` | `CatalogPageProduct` |
| Admin UI | redirect stub | `/admin/catalog/pages` |
| Public URL | `/p/:slug` (301) | `/catalog/:slug` |
| Rules→filters | `rulesToFilters` in seo-landings.service | `catalog-page-rules.ts` + match service |

### Tests
- `seo-landings.rules.spec.ts`, `placement-catalog-pages.spec.ts` (imports `rulesToFilters`)

### Removal impact (premature)
Breaks dual-read for any unmigrated slug, admin SEO landings API clients, sitemap legacy entries, public `/catalog/seo-landings/*` callers.

### Removal safety proof required (before DROP)
1. Count rows in `seo_landing_pages` vs matching `catalog_categories` (slug + published).
2. Confirm sitemap URLs resolve via category lookup (no soft-404).
3. Confirm zero traffic / zero clients on `/api/v1/catalog/seo-landings/*` and `/api/v1/admin/seo/landings`.
4. Remove dual-read from `getSitemap` + controllers; keep redirects.
5. Forward migration DROP tables + `SlugEntityType.SEO_LANDING` cleanup if unused.

---

## 9. CatalogFilterDefinition (+ CatalogCategoryFilter)

### Declared
- Prisma models; seeded in `20261004220000_catalog_filter_pool`
- Contracts: filter keys, presets, `gateListingFiltersByEnabledKeys`

### Read / mutate
- `catalog-filters.service.ts`
- Web PLP filters panel + admin category filters editor
- Definitions: list-only API; per-category config writable (`PUT …/filters`, apply-preset)

### Tests
- `catalog-filters.public.spec.ts`
- Web: `katalog-search-params.test.ts`, `admin-catalog-contract.test.ts`

### Removal impact
Facet UI/config gone; listing still works without filters.

---

## SEO-specific inventory

| Asset | Path | Notes |
| --- | --- | --- |
| Metadata | `apps/web/src/lib/seo/metadata.ts` | Canonical + noIndex policy |
| Indexing gate | `apps/web/src/lib/seo/indexing.ts` | `ALLOW_INDEXING` |
| robots | `apps/web/src/app/robots.ts` | |
| sitemap | `apps/web/src/app/sitemap.ts` ← API sitemap | Dedupes; merges seo landings |
| JSON-LD | `apps/web/src/lib/seo/json-ld.ts`, `product-json-ld.ts` | PDP + org |
| Filter params | `apps/web/src/lib/katalog-search-params.ts` | Facet query keys |
| Redirects | `apps/web/next.config.ts` + contracts `LEGACY_PATH_REDIRECTS` | Nginx does **not** own catalog SEO redirects |
| Dead component | `apps/web/src/components/storefront/flower-type-landing.tsx` | **No route imports it** |
| Dead client helpers | `getSeoLanding` / `listSeoLandingProducts` in `public-api.ts` | **Unused by pages** |
| Stale docs | `docs/catalog.md`, `docs/refactoring-audit.md`, `docs/refactoring-plan.md` | Still describe `/p` / `/katalog` as primary |

### Intentional near-duplicates
- Indexable `/povod/{slug}` / `/komu/{slug}` vs noindex filtered `/catalog/bouquets?occasion|recipient=…`

### Gap
- `page` / `sort` alone do **not** force `noIndex` (only facet filters). Canonical strips query — usually OK; thin pagination URLs remain crawlable.

---

## Database obsolete surfaces (catalog-related)

| Surface | Status |
| --- | --- |
| `foundation_probes` | Dropped early |
| collections / styles / old categories | Dropped in catalog simplification |
| flowers / bouquet_sizes / product_lines | Dropped after FlowerItem migration |
| `SeoLandingPage*` | **Still present** — primary drop candidate |
| `Product.diameterCm` | Column retained for data safety |
| `CatalogPageKind.LEGACY` | Transitional enum value |

Full migration list and constraint notes: see `00-baseline.md` §5 and `03-risk-register.md`.

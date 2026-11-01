# Task 00 — Proposed changes (planning snapshot)

**Status:** superseded for **target architecture** by Task 01 ([06](./06-target-architecture.md)–[10](./10-implementation-roadmap.md)); kept as Task 00 planning inventory  
**Note:** No refactor started from this file alone. VPS not accessed — DROP proofs need authorized later checks.  
**R21:** P0 OPEN — organizational ban on API DB integration ([00.1-db-integration-ban.md](./00.1-db-integration-ban.md)).

Each **deletion** lists: paths, dependents, replacement, removal-safety proof.

---

## Executive matrix: KEEP / REWORK / REMOVE

### KEEP (core SiteFlower 2.0)

| Area | Exact paths / symbols | Why |
| --- | --- | --- |
| Product commerce | `packages/database/prisma/schema.prisma` → `Product`, `ProductVariant`; `apps/api/src/catalog/products.service.ts`, `products.repository.ts`; `apps/web/src/app/(storefront)/products/[slug]/page.tsx` | Sellable catalog |
| Composition | `FlowerItem`, `ProductComponent`; `apps/api/src/catalog/flower-item.util.ts`; admin `apps/web/src/components/admin/` composition editor | Stem dictionary + line qty |
| Kind/precision | `compositionKind`, `compositionPrecision` on Product; `deriveCompositionKind` in contracts | Filters + thematic rules — Task 01 adds target value **DESCRIPTIVE** ([07](./07-prisma-design.md)) |
| Unified pages | `CatalogCategory`, `CatalogPageProduct`, `CatalogPageExclude`; `apps/api/src/catalog/catalog-pages.service.ts`; `apps/web/src/app/(admin)/admin/(shell)/catalog/pages/page.tsx`; storefront `apps/web/src/app/(storefront)/catalog/[slug]/page.tsx` | Single page model |
| Filters | `CatalogFilterDefinition`, `CatalogCategoryFilter`; `apps/api/src/catalog/catalog-filters.service.ts` | PLP facets |
| Traits | `ProductTraitDefinition`, `ProductTrait` | Non-derivable flags (AUTHORIAL) |
| Family (narrow) | `ProductFamily`, `product-family-switcher` | Cross-PDP UX — not variants |
| Contracts URL helpers | `packages/contracts/src/public-routes.ts` | Canonical hrefs |
| Legacy **redirects** (for now) | `LEGACY_PATH_REDIRECTS` + `apps/web/next.config.ts` | Preserve SEO equity until traffic proof on VPS |

### REWORK (dedupe / cutover / hygiene)

| Area | Exact paths | Action |
| --- | --- | --- |
| SEO landing dual-read | `apps/api/src/catalog/seo-landings.service.ts`; `public-catalog.controller.ts` seo-landings routes; `public-catalog.service.ts` sitemap merge | Stop dual-read; categories only (B1) |
| Admin SEO write API | `apps/api/src/catalog/admin-seo-landings.controller.ts`; seo-health hrefs in `seo-health.service.ts` | Retire in favor of catalog pages (B2) |
| `rulesToFilters` home | exported from `seo-landings.service.ts`; used by `seo-landings.rules.spec.ts`, `placement-catalog-pages.spec.ts` | Move next to page-rules/match |
| Redirect duplication | `apps/web/next.config.ts` ↔ `packages/contracts/src/public-routes.ts` | Single source / CI sync |
| XOR helper name | `packages/contracts/src/catalog.ts` `assertComponentFlowerRefXor` | Rename to flowerItem assert |
| Stale docs | `docs/catalog.md`, `docs/refactoring-audit.md`, `docs/refactoring-plan.md` | Align to `/catalog` + THEMATIC |
| Test baseline | `media-hardening` / `commerce` integration failures | Fix only **after** R21 technical safety (roadmap A0→A1/A2); until then do not re-run integration |
| Local test DB DX | Same as **R21** | See risk register + ban doc — do not treat as fixed |

### REMOVE (after listed safety proof)

| Target | Exact paths | Replacement | Safety |
| --- | --- | --- | --- |
| Dead flower-type page component | `apps/web/src/components/storefront/flower-type-landing.tsx` | `flowerTypeDiscoveryHref` in `public-routes.ts` | Grep: no App Router imports |
| Unused web SEO landing clients | `getSeoLanding`, `listSeoLandingProducts` in `apps/web/src/lib/public-api.ts` | `getCatalogCategory` | Definitions-only grep; after B1 |
| Admin landings redirect stub (eventually) | `apps/web/src/app/(admin)/admin/(shell)/seo/landings/page.tsx` | `/admin/catalog/pages` | After B2 + nav cleanup |
| DB `SeoLandingPage*` | models in `schema.prisma` + forward DROP migration | `CatalogCategory` THEMATIC + pins | B1+B2 + **VPS** row/traffic proof (authorized later) |
| `Product.diameterCm` (later) | schema + mapper/DTO copy paths | none | Confirm unused on VPS when authorized |

---

## Guiding principles for SiteFlower 2.0

1. One catalog page model: `CatalogCategory` (+ pins/excludes/rules).
2. One composition model: `FlowerItem` ← `ProductComponent`.
3. One public URL space: `/catalog/*`, `/products/*` (+ dedicated `/povod`, `/komu`).
4. Contracts remain the only shared shape layer; web never imports Prisma.
5. Do not delete until tests green and usage proof is attached (VPS proofs only with explicit permission).

---

## A. Stabilize baseline before structural work

| ID | Proposal | Why | Verification |
| --- | --- | --- | --- |
| A1 | Diagnose/fix `media-hardening.integration-spec` boot failure | Baseline red | Suite green on allowlisted DB **after** R21 technical fix |
| A2 | Diagnose commerce transition assertion (`RECEIVED` vs `CONFIRMED`) | Baseline red | Same gate as A1 |
| A3 | Run Playwright on isolated seeded DB | E2E unknown in Task 00 | `pnpm test:e2e` exit 0 |
| A4 | Document local Postgres port reality (`:5432` vs Compose `:5433`) | DX footgun | Dev docs match host |

---

## B. Complete SEO landing cutover (primary legacy)

### B1 — Stop dual-read in public sitemap/API (code), keep tables temporarily

**Remove / stop using:**
- Dual-read branches in `apps/api/src/catalog/seo-landings.service.ts` (`getPublicBySlug`, `listSitemapEntries` legacy half)
- Public routes in `apps/api/src/catalog/public-catalog.controller.ts` — `GET catalog/seo-landings/:slug`, `…/products`
- Sitemap merge call in `apps/api/src/catalog/public-catalog.service.ts` (`this.seoLandings.listSitemapEntries()`)

**Dependents:**
- `apps/web/src/lib/public-api.ts` — `getSeoLanding`, `listSeoLandingProducts` (currently unused by App Router pages — grep evidence)
- Any external clients of `/api/v1/catalog/seo-landings/*` (unknown — must measure)
- SEO health links pointing at `/admin/seo/landings`

**Replacement:**
- Public category API + `/catalog/:slug` pages only
- Keep Next redirect `/p/:slug` → `/catalog/:slug`

**Safety proof before merge:**
1. SQL: every `seo_landing_pages` row with `status=PUBLISHED` has matching `catalog_categories.slug` with `pageKind=THEMATIC` and publishable state.
2. Sitemap sample: all `/catalog/{slug}` resolve HTTP 200 via category endpoint.
3. Access logs / metrics: zero hits to `/api/v1/catalog/seo-landings/*` for N days (or accept breakage).
4. Unit/integration tests updated; no dual-read assertions remain as required behavior.

### B2 — Remove admin SEO landings write API + dead UI stubs

**Paths:**
- `apps/api/src/catalog/admin-seo-landings.controller.ts`
- Related methods in `seo-landings.service.ts` (create/update/publish)
- `apps/web/src/app/(admin)/admin/(shell)/seo/landings/page.tsx` (redirect stub — remove after nav cleanup)
- Nav references in `apps/web/src/components/admin/admin-shell-nav-data.ts`
- `apps/api/src/catalog/seo-health.service.ts` hrefs to `/admin/seo/landings`

**Replacement:** `/admin/catalog/pages` + `catalog-pages.service.ts`

**Safety proof:**
- Admin UI already redirects (evidence: landings `page.tsx`).
- Confirm no scripts/CI call admin SEO landings endpoints.
- Permissions matrix updated (`docs/permissions.md` if listed).

### B3 — Database DROP `SeoLandingPage*` (forward migration only)

**Paths / artifacts:**
- Models in `packages/database/prisma/schema.prisma`: `SeoLandingPage`, `SeoLandingPageProduct`, `SeoLandingPageExclude`
- New migration under `packages/database/prisma/migrations/<ts>_drop_seo_landing_pages/`
- Possibly `SlugEntityType.SEO_LANDING` if unused after drop

**Dependents:** Prisma client consumers in API catalog module; any raw SQL scripts mentioning `seo_landing_pages`.

**Replacement:** `CatalogCategory` + `CatalogPageProduct` / `CatalogPageExclude`.

**Safety proof (mandatory):**
1. B1+B2 merged and released.
2. Production backup taken.
3. Row counts archived; spot-check content parity.
4. `migrate deploy` on staging clone exit 0; storefront smoke + sitemap checks green.
5. **Do not** squash this into a rewrite of historical migrations.

---

## C. Dead code / docs cleanup (low risk after proof)

### C1 — Delete unused flower-type landing component

| Field | Value |
| --- | --- |
| Path | `apps/web/src/components/storefront/flower-type-landing.tsx` |
| Dependents | **None found** (no App Router import) |
| Replacement | `flowerTypeDiscoveryHref` → `/catalog/bouquets?flower=…` + filtered PLP noindex |
| Safety | Grep for `FlowerTypeLandingPage` / `flower-type-landing` = zero imports; web tests/build green |

### C2 — Remove unused public-api SEO landing helpers

| Field | Value |
| --- | --- |
| Path | `apps/web/src/lib/public-api.ts` — `getSeoLanding`, `listSeoLandingProducts` |
| Dependents | None in `apps/web` pages/components (definition-only grep) |
| Replacement | `getCatalogCategory` / category products listing |
| Safety | Repo-wide reference grep; paired with B1 |

### C3 — Update stale documentation

| Paths | Change |
| --- | --- |
| `docs/catalog.md` | Describe `/catalog` + thematic categories as primary; mark `/p` as redirect |
| `docs/refactoring-audit.md`, `docs/refactoring-plan.md` | Mark historical or rewrite against post-unify model |
| `docs/catalog-deploy-checklist.md` | Align “do not DROP yet” with B3 checklist when ready |

**Safety:** docs-only; no runtime risk.

### C4 — Collapse redirect duplication

| Paths | `apps/web/next.config.ts` LEGACY redirects ↔ `packages/contracts/src/public-routes.ts` `LEGACY_PATH_REDIRECTS` |
| Replacement | Single source (contracts) imported/generated into Next config, or CI diff job |
| Safety | Redirect e2e / `deploy/lib/health.sh` SEO checks still pass |

---

## D. Naming / schema hygiene (non-blocking)

| ID | Proposal | Paths | Replacement | Safety |
| --- | --- | --- | --- | --- |
| D1 | Rename `assertComponentFlowerRefXor` → `assertFlowerItemRef` | `packages/contracts/src/catalog.ts`, API callers, tests | Same validation semantics | Pure rename + tests |
| D2 | Plan drop of `Product.diameterCm` | `schema.prisma`, mapper/DTOs, duplicate util copy path | None (deprecated) | Confirm null/unused in prod; forward migration |
| D3 | Reduce `CatalogPageKind.LEGACY` population | Categories with `pageKind=LEGACY` | Migrate to hub/thematic/gift | Inventory query + admin UX |
| D4 | Keep `rulesToFilters` only until moved | `seo-landings.service.ts` export used by specs | Move helper next to `catalog-page-rules` / match service | Tests still import one helper |

---

## E. Explicit non-proposals (do **not** delete)

| Item | Why keep |
| --- | --- |
| `Product` / `ProductVariant` | Core commerce |
| `FlowerItem` / `ProductComponent` | Current composition SoT |
| `compositionKind` / `compositionPrecision` | Filtering + thematic rules |
| `CatalogCategory` / `CatalogPageProduct` / filters / traits | Current page + merchandising model |
| `ProductFamily` | Still used on PDP (`product-family-switcher.tsx`) — under-tested, not unused |
| Historical Prisma migrations | Required for existing envs; do not rewrite mid-flight |
| Legacy **URL redirects** (`/bukety`, `/katalog`, `/cvety`, `/p`) | SEO equity; remove only after traffic≈0 and search console proof |

---

## F. Optional greenfield baseline migration

| Proposal | Create a squashed SQL baseline from current schema for **new** empty environments only |
| --- | --- |
| Feasible? | **Yes** — Task 00 proved full 38-migration deploy works; squash is optional optimization |
| Must not | Apply squash to DBs that already have `_prisma_migrations` rows without `migrate resolve` bookkeeping |
| Prefer for 2.0 | Keep forward history for shared/prod; optionally maintain a documented greenfield path |

---

## Suggested sequencing

```
A (stabilize tests/E2E)
  → B1 (stop dual-read)
  → C1/C2/C3 (dead code + docs)
  → B2 (remove admin write API)
  → B3 (DROP tables)
  → D (hygiene)
  → larger SiteFlower 2.0 architecture work
```

**Stop condition for Task 00:** reports only — **no implementation of A–F in this task.**

---

## Evidence verification for proposed deletions (re-checked 2026-11-01)

All paths below were confirmed via filesystem `Test-Path` and/or ripgrep. No business source was modified for this check.

### B1/B2/B3 — SeoLandingPage dual-read / admin API / DROP

| Claim | Evidence |
| --- | --- |
| Service still live | `apps/api/src/catalog/seo-landings.service.ts` — class `SeoLandingsService`; `listSitemapEntries()` ~L583 |
| Wired in module | `apps/api/src/catalog/catalog.module.ts` imports `AdminSeoLandingsController`, `SeoLandingsService` |
| Public routes live | `apps/api/src/catalog/public-catalog.controller.ts` — `@Get('seo-landings/:slug')`, `@Get('seo-landings/:slug/products')` |
| Sitemap merge live | `apps/api/src/catalog/public-catalog.service.ts` — `this.seoLandings.listSitemapEntries()` ~L414 |
| Admin write API live | `apps/api/src/catalog/admin-seo-landings.controller.ts` — `@Controller('admin/seo/landings')` |
| Admin UI is redirect-only | `apps/web/src/app/(admin)/admin/(shell)/seo/landings/page.tsx` — `redirect('/admin/catalog/pages')` |
| SEO health still links legacy admin path | `apps/api/src/catalog/seo-health.service.ts` — multiple `href: /admin/seo/landings` |
| Schema deprecated but present | `packages/database/prisma/schema.prisma` — `model SeoLandingPage` (+ Product/Exclude) with `@deprecated` comment |
| Storefront PLP does **not** call SEO landing helpers | `apps/web/src/app/(storefront)/catalog/[slug]/page.tsx` imports `getCatalogCategory` from `@/lib/public-api` (not `getSeoLanding`) |
| Web helpers exist but unused by routes | `apps/web/src/lib/public-api.ts` defines `getSeoLanding` / `listSeoLandingProducts`; grep under `apps/web` finds **definitions only** |
| Specs still import legacy helper | `apps/api/src/catalog/seo-landings.rules.spec.ts`, `placement-catalog-pages.spec.ts` — `rulesToFilters` from `seo-landings.service` |
| Replacement | Unified pages: `apps/api/src/catalog/catalog-pages.service.ts`, admin UI `apps/web/src/app/(admin)/admin/(shell)/catalog/pages/page.tsx`, public `/catalog/:slug` |
| **Not safe to DROP yet** | Dual-read + admin API + sitemap merge still referenced (usage **proven**); removal requires B1→B2→B3 sequence |

### C1 — `flower-type-landing.tsx`

| Claim | Evidence |
| --- | --- |
| File exists | `apps/web/src/components/storefront/flower-type-landing.tsx` (`FlowerTypeLandingPage`) |
| No consumers | Grep `FlowerTypeLandingPage` / `flower-type-landing` under `apps/web` → **only the defining file** |
| Replacement | `packages/contracts/src/public-routes.ts` — `flowerTypeDiscoveryHref` |

### C2 — unused `getSeoLanding` helpers

| Claim | Evidence |
| --- | --- |
| Defined | `apps/web/src/lib/public-api.ts` ~L286–L302 |
| Not imported by App Router pages | Grep of `apps/web/src/app` shows catalog pages use `getCatalogCategory` / product/list helpers — **no** `getSeoLanding` |
| Still blocked by B1 | Public API routes remain on server; deleting helpers alone does not remove dual-read |

### C4 — redirect duplication

| Claim | Evidence |
| --- | --- |
| Contracts SoT | `packages/contracts/src/public-routes.ts` — `LEGACY_PATH_REDIRECTS` (includes `/p/:slug` → `/catalog/:slug`) |
| Next copy | `apps/web/next.config.ts` — comment “Keep in sync with … LEGACY_PATH_REDIRECTS” |

### D1/D2 — rename / diameterCm (hygiene, not unused)

| Claim | Evidence |
| --- | --- |
| XOR helper still used | `packages/contracts/src/catalog.ts` `assertComponentFlowerRefXor`; callers `apps/api/src/catalog/products.service.ts`, tests in `catalog.test.ts`, `composition-invariants.spec.ts` |
| `diameterCm` still mapped | `schema.prisma` Product field; `catalog.mapper.ts`; `products.service.ts` copy-on-duplicate; **not** updated from editor (comment L714) |

### Evidence gaps (honest)

| Gap | Impact on deletion proposals |
| --- | --- |
| No production access-log proof of zero `/api/v1/catalog/seo-landings/*` traffic | Blocks B1/B3 until measured |
| No authorized VPS SQL parity `seo_landing_pages` vs `catalog_categories` | **Required before B3**; local counts are irrelevant to VPS |
| E2E not run | Dead-code greps still valid; blocks release confidence for B1 |
| `media-hardening` / commerce integration still red | Stabilize tests (A1/A2) before structural deletes |
| No VPS access logs for `/catalog/seo-landings/*` | Required before hard-removing public dual-read if zero-downtime desired |

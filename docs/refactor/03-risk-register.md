# Risk register (Task 00 / Task 01)

**Status:** living register — **authoritative for risk IDs**  
**Date:** 2026-11-01 (cleaned for Task 01 doc quality)  
**Note:** VPS was not accessed. Live-data risks are hypotheses from code until an authorized VPS check.

Priority: **P0** = stop-ship / data-loss / SEO disaster · **P1** = high · **P2** = medium · **P3** = low / hygiene.

Each **Risk ID appears once**. Mitigations below are **planned**, not claimed done, unless priority says otherwise.

| ID | Priority | Risk | Evidence | Impact | Planned mitigation |
| --- | --- | --- | --- | --- | --- |
| R01 | **P0** | Premature `DROP` of `SeoLandingPage*` | Dual-read in `seo-landings.service.ts`, public controller, sitemap merge | Soft-404 sitemap URLs; broken API clients; lost rows | Code cutover to `CatalogCategory` first ([08](./08-catalog-seo-design.md)); then forward DROP after proof |
| R02 | **P0** | Structural deletes while API tests are red | `media-hardening` boot fail; commerce `RECEIVED`≠`CONFIRMED` (last gated local run) | Hidden regressions | Stabilize after DB-safety task; prefer unit tests while R21 ban holds |
| R03 | **P1** | Sitemap orphan URLs from leftover SEO landings | Unify migration skips slug collisions; sitemap still merges seo landings | Indexing of 404/empty pages | Single sitemap source = categories ([08](./08-catalog-seo-design.md) B1) |
| R04 | **P1** | Docs describe obsolete URL model as current | `docs/catalog.md`, `docs/refactoring-*.md` still `/p` + `/katalog` | Wrong operator decisions | Align docs in roadmap A3 |
| R05 | **P1** | Dual write paths for thematic pages | Admin API `/admin/seo/landings` while UI redirects to catalog pages | Divergent content if API used directly | Remove admin SEO write API (roadmap B2) |
| R06 | **P1** | Dangerous historical drop migration gating | `20261018120000_drop_legacy_flower_size_line` raises if `flower_item_id` null | Deploy blocked on bad data | Never reintroduce half-migrated XOR states |
| R07 | **P1** | `onDelete: Restrict` on category tree / FlowerItem / media | Schema relations | Hard deletes fail mid-admin UX | Explicit reassignment / archive flows |
| R08 | **P2** | Contracts ↔ Prisma enum drift | Parallel enums by design | Runtime vs DB mismatch | CI sync or codegen when enums change |
| R09 | **P2** | Redirect map duplication | `next.config.ts` ↔ `public-routes.ts` | SEO loops/misses | Contracts SoT + CI/generate (roadmap B4) |
| R10 | **P2** | Filtered PLP vs dedicated taxonomy landings | `/catalog?occasion=` noindex vs `/povod` indexable | Wrong indexation | SEO runbook + e2e robots/canonical |
| R11 | **P2** | `page`/`sort` not noindex | `katalog-search-params` + metadata | Thin crawlable URLs | Consider noindex when `page>1` |
| R12 | **P2** | Dead storefront code paths | `flower-type-landing.tsx` unused; `getSeoLanding` unused by pages | Agents revive wrong model | Delete after cutover window (A4 / B3) |
| R13 | **P2** | Local Postgres port mismatch | `.env.example` `:5433` vs host `:5432`; Docker may be missing | Failed DX / wrong DB | Document host reality; prefer Compose |
| R15 | **P3** | `NavigationMenuItem.targetId` has no FK | Polymorphic by design | Dangling nav targets | Admin validation + SEO health |
| R16 | **P3** | `OrderItem` product/variant no FK | Snapshot commerce | Historical vs live catalog | Keep intentional; document |
| R17 | **P3** | Next middleware deprecation warning | Build log: middleware → proxy | Future Next breakage | Plan when touching auth edge |
| R18 | **P3** | ProductFamily under-tested | No dedicated e2e | Silent PDP regression | Coverage if Family kept (roadmap E3) |
| R19 | **P3** | Squash baseline on existing DB | Long migration history with backfills | Dangerous re-runs | Greenfield-only squash; never on prod history |
| R20 | **P1** | E2E not verified in Task 00 | Docker unavailable; E2E not run | Unknown storefront surface | Playwright on isolated seeded DB before deletions |
| R21 | **P0 — OPEN** | Ungated DB integration tests can target working `bouquet_one` | `integration-database-url.ts` + many `*.integration-spec.ts` use `DATABASE_URL ?? '…/bouquet_one?schema=public'`. Task 00.1 harness was **rolled back** — **no** technical gate in repo. Ops scripts under `apps/api/scripts/*` share the fallback class. | Wipe/mutation of local working DB | **Organizational ban** on API `test:integration` / package `test` until a future safety task merges. Prefer unit tests. Do **not** rewrite working `DATABASE_URL` as a fix. See [00.1-db-integration-ban.md](./00.1-db-integration-ban.md). |
| R22 | **P0** | Broad destructive SQL in integration specs | Especially `storefront-catalog.integration-spec.ts` (`DELETE` across catalog tables) | Catastrophic if suite runs against wrong DB | **Depends on R21:** same organizational ban until gated connector exists; then keep deletes on allowlisted DB only |
| R23 | **P0** | Dropping `SeoLandingPage*` without VPS proof | Dual-read still in code; VPS row/traffic unknown | SEO soft-404 / data loss | Authorized VPS read-only parity + B1/B2 before DROP |
| R24 | **P1** | Inferring VPS state from local Postgres | Local DBs are not SoT | Wrong cutover decisions | Local audit = migration/test proof only |
| R25 | **P1** | Public category PLP ignores pins | Listing util / `PublicCatalogService.listProducts` apply excludes; pins merged in admin preview + `SeoLandingsService.listProducts` | Admin pins invisible on storefront | Roadmap **B1b** — preview-parity pin merge |
| R26 | **P2** | Page filter editor unreachable | `CategoryFiltersEditor` only from `catalog-categories-manager`; categories route redirects to pages | Cannot tune facets in UI | Roadmap **B6** — embed into catalog pages manager |

**Removed ID:** former **R14** (shared-DB contamination via integration defaults) is fully covered by **R21** — not listed separately.

---

## Constraint / ops notes (schema)

- `CatalogCategory.parent` Restrict — cannot delete parents with children.
- `ProductComponent.flowerItemId` Restrict — cannot delete FlowerItems in use.
- `MediaAsset` Restrict while product/nav media references exist.
- Category tree cycles not DB-enforced.
- Singleton settings rows (`id = 1`) app-enforced.

---

## SEO dual-model residual (detail for R01/R03/R05)

Storefront PLP uses `getCatalogCategory` (`/catalog/{slug}`; `/p/{slug}` → 301).

Still live and competing:

1. Sitemap merges `SeoLandingsService.listSitemapEntries()`.
2. Public API serves `/catalog/seo-landings/:slug`.
3. Admin write API for SEO landings still registered.

**Worst case:** published SEO landing slug missing as category → sitemap URL 404s on PLP.

---

## Test-failure residual (detail for R02)

Observed on isolated DB `bouquet_one_baseline_audit` during Task 00 (historical gated run):

1. `media-hardening.integration-spec.ts` — API on ephemeral port never healthy.
2. `commerce.integration-spec.ts` — HTTP 201 but status stayed `RECEIVED` vs expected `CONFIRMED`.

**Now:** re-running those suites is **organizationally banned** while R21 is OPEN. Do not treat catalog DROP as validated until failures are understood under a future technical gate.

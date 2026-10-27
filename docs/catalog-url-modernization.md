# Catalog / URL / SEO modernization — readiness report

**Date:** 2026-10-27 (two-stage release tooling added)  
**Overall readiness: FAIL** (local tests green; **production `./scripts/release.sh preflight` not yet run** — no Cursor SSH)

Production validation uses the server-side preflight (backup + isolated restore + migrate), not a dump uploaded to GitHub. See `docs/release-runbook.md`.

---

## Evidence summary

| Gate | Result | Evidence |
|------|--------|----------|
| `storefront-catalog` integration (6 tests) | **PASS** | Jest 2026-10-24 — all 6 green after API boot fix |
| `catalog` integration | **PASS** | publish + slug redirect + drafts |
| `catalog-match-classification` | **PASS** | rozy→roza ID rules; seeds `roza` if wiped |
| `commerce` integration (10 tests) | **PASS** | cart/checkout/idempotency/promo |
| `admin-auth` integration | **PASS** | |
| `@bouquet-one/contracts` unit | **PASS** | 84/84 incl. legacy URL migrate + redirect loop checks |
| Web URL/nav/discovery unit | **PASS** | 28/28 |
| Isolated migration lab (local clone) | **PASS** | `docs/cutover-migration-lab-report.json` |
| **Production preflight (VPS)** | **FAIL / blocked** | Must run on server; Cursor has no SSH |
| Release unit tests (`release-preflight`) | **local** | `bash deploy/test/release-preflight.test.sh` |
| Push / deploy | **not done** | per policy |

---

## 1. Integration API boot — root cause & fix

**Root cause:** Nest `ConfigModule` loaded repo `.env` with `DATABASE_URL=…@localhost:5433/…` while local Postgres (scoop) listens on **:5432**. Integration children inherited a dead port / wrong defaults → health never OK (`exit=null`). Secondary issue: publish without composition returned 400 after composition became required for `BOUQUET`.

**Fixes:**
1. `apps/api/src/config/app-config.module.ts` — `ignoreEnvFile: process.env.NODE_ENV === 'test'` so spawned test env is authoritative.
2. `apps/api/test/integration-database-url.ts` — probe `:5432` then `:5433`.
3. Integration helpers seed flower composition before publish (`storefront-catalog`, `catalog`, `commerce`).

---

## 2. Final routes

| Intent | Canonical | Legacy 301 |
|--------|-----------|------------|
| Catalog index | `/catalog` | `/katalog` |
| Bouquets | `/catalog/bouquets` | `/bukety` |
| Stems | `/catalog/stems` | `/cvety` |
| Category PLP | `/catalog/{slug}` | `/katalog/{slug}`, `/p/{slug}` |
| Product PDP | `/products/{slug}` | `/bukety/{slug}` |
| Flower discovery | `/catalog/bouquets?flower=` | `/cvety/{slug}` |

Helpers: `packages/contracts/src/public-routes.ts`  
Next redirects: `apps/web/next.config.ts` (inlined map kept in sync with `LEGACY_PATH_REDIRECTS`)  
Unit proof: no redirect chains/loops among cutover sources (`legacy-url-migrate.test.ts`).

**`/bukety/{productSlug}` → `/products/{productSlug}`:** permanent redirect; query/hash preserved by Next for path params; no intermediate hop.

---

## 3. Navigation / persisted URLs

- Runtime PAGE targets use `navigationPageHref` (English paths).
- Script: `apps/api/scripts/migrate-legacy-nav-urls.ts` (`--apply` to write).
- Local dry-run + apply: **0 CUSTOM_URL rows needed change** (DB already clean or empty customs).
- Homepage JSON walk included in the same script.
- Redirect repair after test wipes: `apps/api/scripts/ensure-catalog-slug-redirects.ts` (inserted 11 rows locally).

---

## 4. Migration lab (not production)

```text
node scripts/cutover-migration-lab.mjs
```

Creates `bouquet_one_cutover_lab` from local `bouquet_one`, reverses English→legacy slugs, applies `20261024140000_catalog_english_slugs` **twice**, asserts:

- product/category counts stable  
- hubs `bouquets`/`stems` present; `bukety`/`tsvety` gone  
- `SlugRedirect` rows created  
- idempotent re-apply  

Report: `docs/cutover-migration-lab-report.json`.

**Still required before PASS:** restore a **sanitized production dump** into an isolated DB and run the same lab (or migrate:deploy against that copy). Do not use the live production database.

---

## 5. SEO verification (code-level)

| Concern | Status |
|---------|--------|
| Sitemap products | `/products/{slug}` |
| Sitemap categories | `/catalog/{slug}`; THEMATIC requires `pageStatus=PUBLISHED` |
| FlowerType auto landings | **excluded** from sitemap |
| Canonical helpers | `/catalog/…`, `/products/…` |
| Product JSON-LD URL | `/products/{slug}` |
| Filtered PLP | `noIndex` + self path |
| Robots / noindex policies | unchanged service pages; cart/checkout private headers |

Runtime browser crawl of production not performed (no deploy).

---

## 6. Deployment configuration (no secrets)

Production stack: `deploy/docker-compose.prod.yml`

- Postgres: Docker service hostname **`postgres`**, container port **5432** (not host localhost; not repo `.env` `:5433`).
- `DATABASE_URL` must contain `@postgres:` — enforced by `deploy/lib/common.sh` `ensure_database_url`.
- Env file path: `SHOPBUKET1_ENV_FILE` (example: `/etc/shopbuket1/production.env`).
- Example keys only: `deploy/env/production.env.example`.
- Repo root `.env` `localhost:5433` is a **local Docker Compose habit**, not production.

---

## 7. Production cutover procedure (when approved)

Use the two-stage release entry point (full detail: `docs/release-runbook.md`):

```bash
cd /opt/shopbuket1/repo
git pull --ff-only origin main
./scripts/release.sh preflight          # PASS required
./scripts/release.sh deploy             # live migrate + containers
./scripts/release.sh seo-smoke
```

Then run catalog post-steps (`ensure-catalog-slug-redirects`, `migrate-legacy-nav-urls --apply`) and submit sitemap to GSC / Yandex.

### Rollback

1. Redeploy previous images (route handlers). Keep 301s if new URLs already crawled.
2. Do **not** `migrate reset`. Reverse slug renames only via a new forward migration, or restore from backup.
3. Purge cache tags `catalog`, `sitemap`.

### Idempotency

- Migration SQL skips renames when target slug exists; redirect inserts are guarded.
- `ensure-catalog-slug-redirects` upserts safely.
- Lab re-applied migration twice with no error.

---

## 8. Remaining risks (blockers)

1. **Production preflight not executed on VPS** → cannot claim production-ready.
2. Playwright / full Next production build not required for tooling PASS but recommended before cutover.
3. Integration suites mutate shared local DB; run match tests after seed or alone.
4. After live migrate, run `ensure-catalog-slug-redirects` + `migrate-legacy-nav-urls --apply`.
5. Application rollback does not undo Prisma migrations — plan forward fixes or approved DB restore.

---

## Architecture (unchanged)

Single CatalogMatchService + CatalogCategory rules; Product UUID internal; English public paths; RU service routes (`/povod`, `/dostavka`, …) kept.

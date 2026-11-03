# SiteFlower — Final Architecture Audit & Deployment Readiness

**Date:** 2026-11-03
**Branch:** `main`
**Base HEAD (without WIP commit):** `a934c43`
**Constraint:** local Windows only — no VPS, no production DB, no commit/push/deploy executed in this audit.

---

## 1. Executive Summary

Task 01 product-composition refactor is **code-complete for the expand phase**.

| Status | Value |
|--------|--------|
| **GitHub readiness** | **READY WITH CONDITIONS** |
| **VPS readiness** | **READY WITH CONDITIONS** |

Conditions: publish WIP commit after owner review; apply **expand-only** migration on staging **before** new app; classify FlowerTypes; do **not** apply deferred contract; live PG seed/integration not run in this audit (`TEST_DATABASE_URL` unset). Live expand SQL not executed against PostgreSQL here — compatibility proven from migration history + Prisma model + static tests.

---

## 1b. Expand ↔ app compatibility (ProductComponent)

### Post-historical DB (before expand)

| Column | Nullability / default | Evidence |
|--------|----------------------|----------|
| `display_name` | **NOT NULL**, no DEFAULT | `20260920190000_catalog_domain` |
| `quantity` | nullable | same |
| `unit` | NOT NULL `DEFAULT 'UNSPECIFIED'` | same |
| `role` | NOT NULL `DEFAULT 'PRIMARY'` | `20261018180000_composition_role_color_seo_landing` |
| `color_id` | nullable FK | same |
| `flower_item_id` | NOT NULL | `20261018120000_drop_legacy_flower_size_line` |

### Expand additive fix (updated this pass)

New Prisma Client `createMany` writes only `productId`, `flowerItemId`, `sortOrder`. Without soften, omit of `display_name` → **INSERT FAIL** (NOT NULL, no default).

Expand now also sets `display_name DEFAULT ''` (and DROP NOT NULL) so omit → `''`, keeping **old app String reads** safe after app rollback. Reaffirms `unit`/`role` defaults. No column drops.

Products legacy `composition_precision` / `composition_primary_complete` remain in DB with defaults until contract; new schema omits them — INSERT uses DB defaults.

### Deploy order (required)

1. **Expand** (`migrate deploy` includes `20261102220000_…`)
2. **New app** deploy
3. **Classify** FlowerType.composition_class (+ optional inventory)
4. **Contract** (deferred, owner-gated) — never in this release

Forbidden: new app before expand; contract before classify; auto DB rollback.

### Compatibility matrix

| Combination | Verdict | Evidence |
|-------------|---------|----------|
| Old app + old schema | **PASS** | Current HEAD `a934c43` production baseline; full ProductComponent fields in Prisma |
| Old app + expand schema | **PASS** | Additive only: extra nullable `composition_class`; `display_name` still writable; DEFAULT `''` so rows written by new app remain non-null strings on app rollback. **NOT VERIFIED** on live PG |
| New app + expand schema | **PASS** | createMany omits legacy cols; DB defaults/nullability cover NOT NULL; `compositionClass` column present for SELECTs. Static: `expand-migration-compat.spec.ts`. **NOT VERIFIED** on live PG |
| New app + contract schema | **PASS** (design) | Prisma model matches dropped cols; contract SQL outside `migrations/`. **NOT VERIFIED** — contract blocked |
| New app + old schema (no expand) | **FAIL** | `display_name` NOT NULL without default → INSERT fail; `flower_types.composition_class` missing → SELECT fail. Deploy must not do this |

Regression: `apps/api/src/catalog/expand-migration-compat.spec.ts` (no DB).

---

## 2. Architecture changes

```text
FlowerType.compositionClass (BLOOM | DECORATIVE | null)
        → FlowerItem → ProductComponent(flowerItemId, sortOrder)
        → deriveCompositionKind + resolveStoredCompositionKind
        → Product.compositionKind (MONO | MIXED | UNKNOWN)
        → Catalog filters / SEO rules / public compositionSummary (no stem qty)
```

- ERP owns recipe stem counts; site does not store ProductComponent quantity.
- Single classifier; no ComponentRole runtime path.
- Dictionary class / item type / variety move → `recomputeCompositionKindForFlowerTypes`.
- Product duplicate **re-derives** kind (never copies stale cache).

---

## 3. Fixed errors (incl. FIXED promo)

| Problem | Resolution |
|---------|------------|
| Seed stripped `flowerTypeSlug` | Restored from pre-refactor HEAD |
| FIXED promo looked up `S`/`M`/`L` labels | Bind via `SEED_VARIANT` names → **variantId** |
| sortOrder as promo identity risk | `mapNamedFixedSalesToVariantIds`; runtime uses `variantId` / `createdId` |
| Silent taxonomy slug drops in seed | Throw on missing occasion/recipient/color |
| Duplicate copied compositionKind | Re-derive from compositionClass |
| Integrity lacked UNKNOWN/DECORATIVE | Seed fixtures + integrity tests |
| `bySort.get(0)` residue | Removed; regression tests assert absence |
| Expand omit of `display_name` → NULL broke old-app rollback reads | Expand sets `display_name DEFAULT ''` + DROP NOT NULL; reaffirm unit/role defaults |

**Runtime FIXED (admin/editor):** `collectFixedSalePricesFromCreatedVariants` binds by `createdId` (= variant id).
**Seed bootstrap only:** temporary name lookup (`7 шт` / `15 шт` / `25 шт`) then persist `variantId`. Renaming variants later does not rematch historical FIXED rows (they already store ids).

---

## 4. Verified read/write paths

Create / save / setComponents / duplicate (re-derive) / delete empty FlowerItem (blocked if used) / FlowerType.compositionClass patch (recompute) / FlowerItem type move / variety move / public catalog (no qty) / filters+SEO (unclassified guards) / ERP SKU untouched / cart-checkout quantity is **OrderItem**, not composition.

---

## 5. Seed integrity & idempotency

- Static: `seed-dev-catalog.integrity.spec.ts` — PASS (links, deleteMany→createMany, MONO/MIXED/UNKNOWN, DECORATIVE, unclassified, FIXED map helper).
- Pattern: components + discovery joins restored each run; media skip-if-primary; bestsellers membership replaced.
- **Live double-run on PostgreSQL:** **NOT RUN** — `TEST_DATABASE_URL` unset; no confirmed isolated local DB. Do not seed unknown/production URLs.

---

## 6. Prisma & migrations

| Item | Status |
|------|--------|
| `prisma validate` | PASS (exit 0) |
| Schema target model | Slim ProductComponent + nullable compositionClass |
| Expand `20261102220000_flower_type_composition_class` | Prepared (+ `display_name DEFAULT ''`), **not applied** here |
| Deferred contract | Outside `prisma/migrations` — **must not** run via migrate deploy |
| Historical migrations | Untouched |
| App rollback after expand | Safe if expand applied; DEFAULT `''` keeps legacy String reads; never auto-rollback Postgres |

Order: **expand → new app → classify → validate → contract** (later, owner-gated).

---

## 7. Test results

| Command | Exit | Result |
|---------|------|--------|
| `pnpm --filter @bouquet-one/database exec prisma validate` | 0 | PASS |
| `pnpm --filter @bouquet-one/contracts build` | 0 | PASS |
| `pnpm --filter @bouquet-one/contracts test` | 0 | PASS — 104 |
| `pnpm --filter @bouquet-one/api typecheck` | 0 | PASS |
| `pnpm --filter @bouquet-one/api lint` | 0 | PASS* |
| `pnpm --filter @bouquet-one/api exec jest src/catalog --forceExit` | 0 | PASS — **29 suites / 198 tests** (incl. expand-migration-compat) |
| `pnpm --filter @bouquet-one/api build` | 0 | PASS |
| `pnpm --filter @bouquet-one/web typecheck` | 0 | PASS |
| `pnpm --filter @bouquet-one/web lint` | 0 | PASS |
| `pnpm --filter @bouquet-one/web test` | 0 | PASS — 128 |
| `pnpm --filter @bouquet-one/web build` | 0 | PASS |
| `git diff --check` | 0 | PASS |
| `pnpm --filter @bouquet-one/api test:integration` | — | **NOT RUN** (`TEST_DATABASE_URL` unset) |
| Live `pnpm seed:dev-catalog` ×2 | — | **NOT RUN** (no safe isolated PG) |
| VPS migrate/deploy | — | **NOT RUN** (forbidden) |

\* ESLint emits pre-existing `MODULE_TYPELESS_PACKAGE_JSON` warning for `eslint.config.js`; exit 0.

### Jest Force exiting

`--forceExit` is already in `apps/api/package.json` `test:unit` / `test:integration` (pre-Task 01). Message indicates open handles (Nest/Prisma timers). Not treated as a new Task 01 leak; optional `--detectOpenHandles` cleanup is follow-up, not an expand-deploy blocker. Force-exit is **not** evidence that handles are clean — only that suites asserted green before forced exit.

---

## 8. Remaining risks

1. Expand not applied on real staging/production PostgreSQL (matrix cells marked live NOT VERIFIED).
2. Many UNKNOWN until FlowerTypes classified.
3. Residual SEO JSON qty/dominant keys until contract.
4. New app before expand **FAIL** (inserts + `composition_class` SELECT).
5. Contract DROP still deferred.
6. Live seed idempotency unproven on DB.
7. Task 02: ProductColor / `suggestVisualPaletteColorIds`.
8. Dev seed fixture `chernovik-unknown` must not become production merchandising.
9. After new app rewrites components, rolled-back old UI may show empty `display_name` (`''`) — acceptable; NULL would have crashed Prisma.

---

## 9. GitHub readiness

**Status: READY WITH CONDITIONS**

### Include

All modified Task 01 files + untracked:

- `composition-kind-recompute.util.ts` + `.spec.ts`
- `seed-dev-catalog.integrity.spec.ts`
- expand migration folder
- deferred contract SQL + ops inventory + deferred README
- `docs/audits/*`
- seed / product-editor.util FIXED helpers

### Exclude

`.env`, production secrets, dumps, `node_modules`, `dist`, local media blobs.

### Suggested commit

```text
feat(catalog): simplify composition to FlowerItem list + FlowerType.compositionClass

Replace ProductComponent qty/role/precision with flowerItemId+sortOrder.
Classify MONO/MIXED/UNKNOWN from FlowerType.compositionClass (null → UNKNOWN).
Add expand migration; defer contract DROP. Recompute cache on dictionary changes;
re-derive on duplicate. Harden seed integrity; bind FIXED promo sales by variantId.
```

### Local publish sequence (owner runs)

```powershell
cd d:\Projects\SiteFlower
git status
git diff --stat
# review; ensure no .env
git add -A
# or add explicitly excluding secrets
git status
git commit -m "$(@'
feat(catalog): simplify composition to FlowerItem list + FlowerType.compositionClass

Replace ProductComponent qty/role/precision with flowerItemId+sortOrder.
Classify MONO/MIXED/UNKNOWN from FlowerType.compositionClass (null → UNKNOWN).
Add expand migration; defer contract DROP. Recompute cache on dictionary changes;
re-derive on duplicate. Harden seed integrity; bind FIXED promo sales by variantId.
'@)"
git status
git push -u origin HEAD
```

Do **not** run these until explicitly approved.

---

## 10. VPS readiness

**Status: READY WITH CONDITIONS**

Infra (as in repo): `deploy/docker-compose.prod.yml` (`shopbuket1`), `deploy/Dockerfile.api|web`, `./deploy.sh`, `./backup.sh`, `./rollback.sh`, Nginx host proxy, env `/etc/shopbuket1/production.env`, volume `shopbuket1_pgdata`, healthchecks API `/api/v1/health` + Web `/`.

Conditions: GitHub commit published; staging expand applied; classification + smoke; contract not applied.

---

## 11. Manual VPS deploy plan (docs only)

**Operator runbook (copy-paste commands):** [`vps-task01-expand-runbook.md`](./vps-task01-expand-runbook.md).
**Published feature SHA:** `e0e398a8177cd5d880bf91c7d30c7adce800ca47` on `feature/task-01-composition-simplify` (plus follow-up runbook commits if any).

### A. Pre-deploy

```bash
cd /opt/shopbuket1/current   # or repo path
git fetch --all && git rev-parse HEAD && git status
docker compose -p shopbuket1 -f deploy/docker-compose.prod.yml ps
df -h
ls /var/backups/shopbuket1 | tail
test -f /etc/shopbuket1/production.env
ls packages/database/prisma/migrations | tail
# deferred contract must NOT be under migrations/
```

### B. Backup

```bash
SHOPBUKET1_ENV_FILE=/etc/shopbuket1/production.env ./backup.sh pre-migrate
# verify dump non-empty; practice restore on clone when possible
```

Record previous SHA + image tags.

### C. Deploy

```bash
# After approved SHA is on GitHub:
./deploy.sh staging <APPROVED_SHA>
# Applies prisma migrate deploy from SHA-tagged API image — expand only for this release
```

Forbidden: deferred contract SQL, `migrate reset`, `db push --force-reset`, volume prune, auto DB rollback.

### D. Smoke

Site + `/api/v1/health`; PLP/PDP composition without qty; filters mono/«из X»; admin compositionClass → product kind; variants/FIXED prices; cart/checkout; logs.

### E. Rollback

```bash
./rollback.sh   # app images / previous release
```

App rollback after expand is generally safe. **Never** auto-rollback PostgreSQL. Partial migrate → restore from `pre-migrate` dump on controlled path.

---

## 12. Rollback plan

| Failure | Action |
|---------|--------|
| Bad app after expand | `./rollback.sh` |
| Failed expand migrate | Stop; restore from `pre-migrate` backup |
| Too many UNKNOWN | Classify types — not rollback |
| Contract applied by mistake | Incident: restore backup; no invent reverse DROP |

---

## 13. Dual status

| Gate | Status |
|------|--------|
| **GitHub readiness** | **READY WITH CONDITIONS** (owner review + commit/push; no secrets) |
| **VPS readiness** | **READY WITH CONDITIONS** (staging expand-only **before** new app + classify + smoke; no contract; live PG matrix NOT VERIFIED) |

Not upgraded to unconditional READY until staging expand is applied and smoke-verified on real PostgreSQL.

---

*No VPS/SSH/production seed/contract apply/commit/push performed during this audit.*

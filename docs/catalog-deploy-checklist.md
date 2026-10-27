# Catalog unified engine — safe production deploy checklist

**Do not apply to production until staging green.** Never point tools at production DB for experiments.

## Why order matters

Runtime code **still resolves slug tokens** (including temporary aliases `rozy`/`rosa` → `roza`).  
Therefore `prisma migrate deploy` of `20261024120000_catalog_rules_stable_ids` is **additive** and does **not** empty PLPs if skipped.

However: if rules contain **unknown** slugs, fail-closed yields **empty pages**. Always dry-run first.

## Recommended release stages

### Stage 0 — Backup

1. Logical dump of production Postgres (`pg_dump`).
2. Snapshot of object storage if media linked to catalog pages (optional).

### Stage 1 — Staging / isolated copy

1. Restore dump to isolated DB (not production).
2. `pnpm --filter @bouquet-one/database exec prisma migrate deploy`
3. Dry-run: `pnpm --filter @bouquet-one/api migrate:catalog-page-rules`
4. Review UNRESOLVED / AMBIGUOUS lines; fix dictionary or rules manually.
5. Apply: `pnpm --filter @bouquet-one/api migrate:catalog-page-rules -- --apply`  
   (or rely on SQL migration already enriching IDs).
6. Compare product counts for: `rozy`, `monobukety`, `bukety-iz-roz`, `bukety-s-rozami`, hubs.
7. Run: `pnpm --filter @bouquet-one/api test:integration` with `DATABASE_URL` pointing at the copy.

### Stage 2 — Code deploy (compatible)

Deploy API/web that uses `CatalogMatchService` + shared listing orchestrator.

- Safe **before** ID migration (slugs resolve at runtime).
- Prefer **after** Stage 1 on staging so aliases are no longer required for known pages.

### Stage 3 — Production migrate (after Stage 1 sign-off)

1. Maintenance window optional (reads stay available).
2. Backup again.
3. `prisma migrate deploy` on production.
4. Re-run dry-run script against production **read-only** if possible; apply only if report clean.
5. Smoke: `/katalog/rozy`, `/katalog/monobukety`, `/bukety`, admin page preview + diagnose.

### Stage 4 — Alias removal (later)

Only when `FLOWER_TYPE_SLUG_ALIASES` removal conditions in `catalog-page-rules.ts` are met.

## Rollback

1. Redeploy previous API/web build (slug equality bug may return for unmigrated rules).
2. SQL migration is additive — rolling back schema needs a reverse migration (not shipped); restore from dump if rules JSON was corrupted.
3. Do **not** DROP `seo_landing_pages` in this release.

## Dual URL note

- `/katalog/rozy` — preferred STEM roses page.
- `/cvety/roza` — FlowerType landing for **bouquets** with roses — **no auto-redirect**.
- `/p/[slug]` — dual-read legacy; migrate content to `CatalogCategory` before cutting redirects.

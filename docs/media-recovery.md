# Media recovery

PostgreSQL backup alone is **not** a complete SiteFlower backup.

Recovery needs:

1. PostgreSQL
2. Media object storage (local volume or S3 bucket)
3. Application secrets/config that unlock storage access

Never store the S3 secret inside the database backup.

Object storage durability is provider-dependent (versioning, replication, lifecycle). Document the chosen provider policy outside this repo if needed.

---

## Scenarios

### DB restored, S3 intact

1. Restore Postgres
2. Confirm `MEDIA_*` / `S3_*` env matches the bucket that still holds objects
3. `pnpm media:check --probe`
4. Spot-check storefront PDPs

### S3 restored, DB intact

1. Restore bucket to the keys referenced by `media_assets` / `media_derivatives`
2. `pnpm media:check`
3. `pnpm media:repair --execute` for missing derivatives whose master exists

### Missing derivative

Run `pnpm media:repair --execute`. Masters are required; repair will not invent them.

### Missing master

Human recovery: re-upload from Admin, or restore object from backup/versioning. Do not delete `ProductMedia` automatically.

### Accidental ProductMedia deletion

Association is gone; asset may still exist as orphan during grace. Re-upload or re-link via Admin (current UX: re-upload). Restore DB point-in-time if within backup window.

### Leaked S3 credentials

1. Rotate access keys immediately at the provider
2. Update env / redeploy
3. Audit bucket for unexpected writes
4. Prefer short-lived keys going forward

### Migration local → S3

1. `pnpm media:migrate-local-to-s3 --dry-run`
2. `pnpm media:migrate-local-to-s3 --execute`
3. Switch `MEDIA_STORAGE=s3` + public base URL
4. `pnpm media:check --probe`
5. Keep local source until verified (tool never auto-deletes local)

---

## Consistency commands

| Intent | Command |
| --- | --- |
| Inspect | `pnpm media:check` |
| Probe storage | `pnpm media:check --probe` |
| Preview orphans | `pnpm media:cleanup` |
| Delete orphans | `pnpm media:cleanup --execute` |
| Fix derivatives | `pnpm media:repair --execute` |

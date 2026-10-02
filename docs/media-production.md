# Media production

## Storage policy

- **Dev/test:** `MEDIA_STORAGE=local`
- **Production:** `MEDIA_STORAGE=s3` with least-privilege credentials scoped to the media bucket/prefix only
- Never commit real S3 secrets
- Never return/log secret access keys

## Public delivery model

Product photography is delivered as **public-read objects** behind a stable public base URL (`S3_PUBLIC_BASE_URL` or local `/api/v1/media`).

- Listing the bucket must not be required for storefront
- Write/delete remain credentialed
- Object keys are UUID-based → long immutable cache is safe because replacement creates a **new** asset/key (never overwrite bytes under the same key)

### next/image allowlist (critical)

`apps/web/next.config.ts` builds `images.remotePatterns` from **`S3_PUBLIC_BASE_URL` (preferred) or `MEDIA_PUBLIC_BASE_URL`** at **web image build time**.

- API uses the same public base at **runtime** for `getPublicUrl`
- If the web image was built without the real public origin, `/_next/image?url=https://s3…` returns **400 `url parameter is not allowed`** even though direct S3 URLs work
- Production Docker sets `REQUIRE_MEDIA_REMOTE_ORIGIN=true` so a missing/local origin fails the web build
- Changing `S3_PUBLIC_BASE_URL` requires **rebuilding** the web image (runtime env alone is not enough for remotePatterns)
- Never put S3 access keys in `NEXT_PUBLIC_*`

Optimizer `deviceSizes` are aligned to Sharp derivatives: **400 / 800 / 1200 / 1600** (no 1920).

CDN may sit in front later without schema changes:

`public URL → CDN → S3`

## Upload compensation

Storage and Postgres are not one ACID transaction. Upload tracks every newly written key and deletes them if DB persistence fails. Pre-existing objects are never compensated.

## Delete / orphan

1. Admin delete → remove `ProductMedia` association only
2. If primary removed → promote next by `sortOrder`
3. Unreferenced `MediaAsset` waits **24h** grace
4. `pnpm media:cleanup --execute` deletes derivatives → master → DB rows (idempotent)

## Site Health

Admin → **Медиа / Site Health** (`SITE_HEALTH_READ`):

- storage probe write/read/delete under `healthchecks/`
- missing masters / derivatives (sampled)
- orphan counts
- invalid primary states

Never fakes a green state. Never shows secrets.

## Production checklist

- [ ] `MEDIA_STORAGE=s3`
- [ ] Bucket + prefix correct; credentials least-privilege
- [ ] `S3_PUBLIC_BASE_URL` HTTPS and reachable from browsers/CDN
- [ ] Web image rebuilt with that same `S3_PUBLIC_BASE_URL` build-arg (next/image allowlist)
- [ ] Direct S3/public URL of a derivative returns 200; `/_next/image?url=…` also returns 200
- [ ] Admin → Проверить хранилище → write/read/delete OK
- [ ] Upload real test product image; storefront shows it after restart
- [ ] `pnpm media:check` clean (no missing masters / multi-primary)
- [ ] Backup policy covers Postgres **and** object storage separately
- [ ] Local→S3 migration completed if migrating historical local files

## Production S3 verification

Repository tests cannot prove production object storage.

Until performed in the real environment:

`Production S3 verification: REQUIRED`

Steps:

1. Configure production S3 credentials
2. Start API
3. Admin → Медиа / Site Health → Проверить хранилище
4. Upload a real product photo
5. Confirm storefront delivery
6. Confirm redeploy does not lose the image

## VPS note

shopbuket1 media ops must not use destructive Docker prune commands that could affect `erpbuket1` volumes on the same host.

Production packaging runbook: [deployment-hostfly.md](./deployment-hostfly.md).

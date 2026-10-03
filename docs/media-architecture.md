# Media architecture

SiteFlower keeps a single media subsystem. Do not introduce a parallel image stack.

## Pipeline

```text
Admin upload
  → Nest API (auth + CSRF + RBAC)
  → magic-byte MIME validation
  → Sharp normalize (EXIF strip, orientation)
  → normalized master + SHA-256(master bytes)
  → responsive derivatives (WebP + AVIF)
  → MediaStorage.put (tracked keys)
  → MediaAsset + MediaDerivative rows
  → on failure: compensate newly written keys
```

PostgreSQL stores metadata and `ProductMedia` links only — never image blobs.

## Models

| Model | Role |
| --- | --- |
| `MediaAsset` | Normalized master metadata + checksum |
| `MediaDerivative` | Width × format variants |
| `ProductMedia` | Ordered product gallery link (alt, caption, primary) |

Partial unique index: at most one `is_primary` per product.

## Storage keys

```text
masters/<uuid>.<ext>
derivatives/<asset-uuid>/w400.webp|avif
derivatives/<asset-uuid>/w800.webp|avif
...
healthchecks/<uuid>.txt   # connectivity probes only
```

Keys are server-generated. User filenames are never storage paths.

## Drivers

| Mode | Use |
| --- | --- |
| `MEDIA_STORAGE=local` | Development / tests |
| `MEDIA_STORAGE=s3` | Production (S3-compatible, provider-neutral) |

Production + local requires explicit `ALLOW_PRODUCTION_LOCAL_MEDIA=true`.

## Normalized master

The stored master is **not** the original upload bytes. It is EXIF-stripped, orientation-normalized, high-quality re-encoded source suitable for future derivative regeneration. Original upload is not permanently retained.

## Checksum

`MediaAsset.checksumSha256` is SHA-256 of the **exact normalized master bytes** written to storage.

## Derivatives

Widths: 400 / 800 / 1200 / 1600 (no upscaling).  
WebP quality 82, AVIF quality 60 (flower texture / color balance).

## Product gallery

- Max **12** photos per product (server invariant)
- Publish requires exactly one primary
- Detach removes `ProductMedia` only; last reference sets `orphanedAt`; after **7 days** grace, `media:cleanup` may delete S3 + DB
- Shared `MediaAsset` (duplicate product) stays live until every `ProductMedia` link is gone

## Ops commands

| Command | Behavior |
| --- | --- |
| `pnpm media:check` | Read-only consistency report (`--probe` optional) |
| `pnpm media:cleanup` | Dry-run by default; `--execute` deletes eligible orphans |
| `pnpm media:repair` | Dry-run by default; regenerate missing derivatives |
| `pnpm media:migrate-local-to-s3` | Copy local → S3 without deleting source |

See also: [media-production.md](./media-production.md), [media-recovery.md](./media-recovery.md).

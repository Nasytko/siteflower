# Media

## Architecture

`MediaStorage` port:

- `put` / `delete` / `getPublicUrl`

Implementations:

- **local** (default) — filesystem under `MEDIA_LOCAL_ROOT`, served at `MEDIA_PUBLIC_BASE_URL` (`/media/...`)
- **s3** — S3-compatible (`S3_ENDPOINT`, bucket, keys); public/CDN base URL

Business services never import the AWS SDK directly.

## Upload security

- Magic-byte MIME detection (`file-type`), not filename alone
- Allowlist: JPEG, PNG, WebP, AVIF
- Reject SVG
- Max size: `MEDIA_MAX_BYTES` (default 8 MiB)
- Generated storage keys (`masters/{uuid}.ext`) — no user paths

## Processing

On upload (synchronous for current scale):

1. Store master (EXIF stripped)
2. Derivatives widths **400 / 800 / 1200 / 1600** without upscaling
3. Formats WebP + AVIF (AVIF skipped if encoder fails)

Future: async worker queue if processing cost grows.

## Product media

`ProductMedia` links assets to products: sort order, primary flag (one primary per product via partial unique index), alt, caption.

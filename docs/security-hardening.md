# Security hardening (Phase 4.2)

This document records production-facing security decisions after the Phase 4.2 remediation. It is not a product roadmap.

## Checkout idempotency recovery

- Scope: `orders.create`
- Table: `idempotency_records` (separate from transactional outbox)
- Request identity: SHA-256 of a **canonical business payload** (sorted items, normalized phones, fulfillment fields). Transport headers and JSON key order do not affect the hash.
- On first success the server stores AES-256-GCM ciphertext of `{ trackingToken, orderId, orderNumber }` only.
- Layout: `iv(12) || authTag(16) || ciphertext`
- Key: `ORDER_RECOVERY_ENCRYPTION_KEY` (base64 → exactly 32 bytes). `encryption_key_version` column supports future rotation (new writes N+1; old key temporarily for reads).
- TTL: `ORDER_RECOVERY_TTL_HOURS` (default 48). After expiry, replay returns the same order **without** a tracking token.
- Same key + different payload → `409 Conflict` (no token).
- Concurrent same key → one Order, one OrderEvent, one OutboxEvent, one IdempotencyRecord; all callers can recover the same token while TTL is valid.

## Tracking token

- 32 random bytes, base64url (43 chars) — bearer credential
- Only SHA-256 hex stored on `orders.tracking_token_hash`
- Format gate before lookup; malformed → generic 404
- API headers: `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow, noarchive`
- Storefront `/order/*`: same privacy headers; metadata canonical is `/order` (token never in OG/canonical)
- Access logs redact `/orders/track/[REDACTED]`
- Soft throttle: 120/min/IP (entropy already blocks brute-force)

## Media

- Magic-byte MIME via `file-type` (not extension trust)
- Allowed: JPEG, PNG, WebP, AVIF (no SVG upload/serve from local media)
- `limitInputPixels = 25_000_000`, max dimension 6000
- Metadata stripped (no `withMetadata()`)
- Local serve resolves paths under media root (`resolve` + relative prefix check)

## Admin auth boundaries

- CSRF / session guards match `/api/v1/admin` prefix only (not substring `admin`)

## Request ID

- Accept `[A-Za-z0-9_-]{8,128}` else generate UUID

## Revalidation

- `x-revalidate-secret` compared via SHA-256 + `timingSafeEqual`
- Bounded body / tags / paths; internal path pattern only

## Swagger

- Development: always on
- Production / test: off unless `SWAGGER_ENABLED=true`

## Production env fail-fast

Required / validated when `NODE_ENV=production`:

- `DATABASE_URL`
- `SESSION_HMAC_SECRET` (≥32, non-placeholder)
- `ORDER_RECOVERY_ENCRYPTION_KEY` (32-byte base64)
- No wildcard CORS

## Client idempotency lifecycle

- Key stored in `sessionStorage` for one checkout intent (survives refresh)
- Cleared after confirmed successful order
- New checkout session → new key

## Deferred (not Phase 4.2)

- Full CSP design for Next/admin/media
- Outbox worker / ERP consumer
- CAPTCHA / bot anti-abuse beyond rate limits
- KMS / automated key rotation
- Site Health UI
- Redis caches

## Future outbox worker (schema ready)

Claim by `processed_at IS NULL` ordered by `created_at`; increment `attempts`; exponential backoff; idempotent consumer; dead-letter after N failures. Do not process inside order transactions.

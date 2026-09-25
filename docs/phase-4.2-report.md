# Phase 4.2 — Final report

## A. Executive summary

Phase 4.2 hardened checkout idempotency (lost-response recovery), tracking privacy, media upload/serve, admin route matching, revalidation, request IDs, production env validation, and DB commercial CHECKs — without architectural rewrites. P0 lost-response recovery is fixed and covered by PostgreSQL integration tests on a fresh database.

**Production blockers remaining:** Playwright storefront commerce journeys failed in this run (add-to-cart status assertion); API commerce/idempotency/security gates PASS. Treat Playwright FAIL as a release gate until re-run green on a seeded catalog.

## B. Findings discovered

| Sev | Location | Root cause | Risk | Resolution |
| --- | --- | --- | --- | --- |
| P0 | `orders.service` replay | Replay returned `trackingToken: null`; hash lived in outbox | Lost network → customer cannot track | `IdempotencyRecord` + AES-256-GCM recovery |
| P1 | `order/[token]` metadata | Canonical/OG included raw token | Token leak via referrer/SEO | Canonical `/order`; privacy headers |
| P1 | Pino | `req.params.token` redacted but URL still logged | Token in access logs | URL serializer → `[REDACTED]` |
| P1 | Media Sharp | No pixel bomb limit; weak EXIF strip | DoS / GPS leak | `limitInputPixels`, strip metadata |
| P1 | Media serve | Only checked `".."` | Path traversal | `resolve` + root containment |
| P1 | Revalidate | `!==` secret compare; unbounded tags/paths | Timing + abuse | SHA-256 + timingSafeEqual; bounds |
| P1 | Request ID | Unbounded client header | Log pollution | Charset/length gate |
| P1 | CSRF/auth guards | `path.includes('/admin')` | False positives / brittle | `/api/v1/admin` prefix |
| P1 | Next images | Always `dangerouslyAllowLocalIP` | Prod local-IP fetch | Dev/test only |
| P2 | Money CHECKs | Nonneg only | Bad totals | Equality CHECKs forward migration |
| P2 | Swagger default | Default true | Prod docs exposure | Prod off unless explicit |
| P2 | Checkout key | `useState` only | Refresh → new key / 409 risk | `sessionStorage` lifecycle |
| P3 | `tmp-route-smoke.ts` | Dead file | Noise | Removed |
| Deferred | Full CSP | Would break Next/admin/media | — | Documented; Helmet CSP disabled intentionally |

## C. P0 idempotency recovery

1. Create Order + items + OrderEvent + OutboxEvent + IdempotencyRecord in one transaction.
2. Encrypt `{trackingToken, orderId, orderNumber}` with AES-256-GCM; store IV‖tag‖ciphertext.
3. Replay same key + same requestHash → decrypt → return original token.
4. Same key + different hash → 409.
5. Expired TTL → same order, token withheld.
6. Concurrent same key → one order / one outbox / one idemp record; all recover same token.

## D. Encryption/recovery

- Algorithm: AES-256-GCM (Node `crypto`)
- Key size: 32 bytes (base64 env `ORDER_RECOVERY_ENCRYPTION_KEY`)
- IV: 12 random bytes per encryption (no reuse)
- Auth tag: 16 bytes
- Key version: column `encryption_key_version` (writes use `1`)
- Retention: `ORDER_RECOVERY_TTL_HOURS` default 48
- Secrets never logged

## E. Tracking security

- Entropy: 32 bytes → base64url (43)
- DB: SHA-256 hex only
- Logging: URL redaction + param redact
- Referrer / robots / cache: API `@Header` + Next `headers()` for `/order/*`
- Rate limit: 120/min/IP on track
- Format gate before hash lookup

## F. Database hardening

Migration `20260922120000_phase42_hardening`:

- Table `idempotency_records` + unique `(scope, key)` + expires index
- `orders_total_equals_parts`
- `orders_window_minutes_range`
- `order_items_line_equals_unit_qty`

Prior nonneg CHECKs retained.

## G. Media hardening

- Pixel limit: 25 000 000; max edge 6000
- Metadata: no `withMetadata()`
- Content: `file-type` magic bytes; JPEG/PNG/WebP/AVIF only; no SVG serve
- Path: `resolveMediaPathInsideRoot`
- CORP / nosniff / Content-Type on serve

## H. Auth/RBAC/CSRF audit

- Argon2 / sessions / CSRF Origin checks: unchanged and still applied to `/api/v1/admin/*`
- Guard matching tightened to admin API prefix
- No CSRF regressions found on new order admin routes (covered by existing admin auth architecture)

## I. API hardening

- Revalidate: secret, size, tag/path validation
- Request ID sanitation
- Swagger prod opt-in
- Production env fail-fast for HMAC + recovery key + CORS
- Pagination Max already present on catalog DTOs (kept)

## J. PII/logging

- Pino redacts phones, names, address, card message, cookies, passwords, token param
- URL tracking path sanitized
- Secret scan (fresh DB after commerce suite): no `tracking_token` plaintext column; ciphertext in `idempotency_records` only

## K. Environment hardening

- `.env.example` documents recovery key generation
- Production rejects placeholder HMAC, missing recovery key, wildcard CORS

## L. Performance/query audit

- Price sort: **kept** in-memory for boutique catalog (documented in `products.repository.ts`); no materialized view
- No new speculative indexes beyond idempotency expires/resource
- No N+1 hotspot fixed this phase (none newly confirmed as blocking)

## M. Frontend

- Checkout idempotency key in `sessionStorage`; cleared on success
- Tracking metadata no longer embeds token
- Next local image IP gated to non-production

## N. Code cleanup

- Removed `apps/api/tmp-route-smoke.ts`
- Docs: `security-hardening.md`, `production-readiness.md`, plan + this report
- Updated checkout/outbox docs

## O–Q. Commerce / concurrency / Playwright

- Delivery/pickup/cancel/status concurrency: PASS (integration)
- Lost-response + concurrent idempotency: PASS
- Playwright: smoke PASS (4); commerce journeys FAIL (4) — add-to-cart `role=status` not observed (likely catalog/data or client timing; not API regression)

## R. Fresh DB verification

1. Created `bouquet_one_phase42`
2. All 6 migrations applied including Phase 4.2
3. SUPER_ADMIN bootstrap PASS
4. Dev seed PASS (opt-in)
5. Commerce integration suite against fresh DB: **9/9 PASS**
6. Dropped fresh DB afterward

## S. Files changed (high level)

- `packages/database/prisma/schema.prisma` + migration
- `apps/api/src/orders/*` (recovery crypto, service, tracking, controller)
- `apps/api/src/media/*`, `auth/*`, `config/*`, `app.module`, `main`
- `apps/web` revalidate, next.config, checkout-form, order metadata
- Docs under `docs/`
- Tests: unit + commerce integration updates

## T. Remaining technical debt

1. Playwright commerce flake / catalog precondition
2. Full CSP design
3. Outbox worker
4. Optional automated idempotency TTL cleanup job
5. Price sort SQL if catalog grows past boutique scale

## U. Deferred

Redis, CAPTCHA, KMS, ERP, payments, Site Health UI, microservices — not justified for this remediation.

## V. Verification matrix

| Gate | Result |
| --- | --- |
| lint | PASS |
| typecheck | PASS |
| unit tests (API) | PASS (59) |
| web unit tests | PASS (23) |
| contracts tests | PASS (14) |
| PostgreSQL integration | PASS (25) |
| build (API) | PASS |
| build (web) | PASS (after `.next` clean; first attempt FAIL fonts/turbopack cache) |
| Playwright desktop smoke | PASS |
| Playwright commerce desktop/mobile | FAIL |
| fresh DB migrate+seed+commerce | PASS |
| lost-response replay | PASS |
| concurrent idempotency | PASS |
| status concurrency | PASS |
| DB plaintext-secret scan | PASS |
| tracking log-secret scan | PARTIAL (serializer added; live access-log capture NOT RUN end-to-end this session) |
| media path/crypto unit tests | PASS |
| CSRF (existing admin integration) | PASS |
| production env validation | PASS (unit/schema rules) |

## W. Production blockers

1. **Playwright commerce journeys FAIL** in this run — re-seed catalog and re-run before calling production-ready for storefront UX automation.
2. Ensure production secrets set: `ORDER_RECOVERY_ENCRYPTION_KEY`, strong `SESSION_HMAC_SECRET`, `REVALIDATE_SECRET` if used.

API-side P0 recovery and security gates required by Phase 4.2 are green.

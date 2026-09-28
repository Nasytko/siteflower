# Checkout

Guest checkout only — no customer accounts. No online payment. Orders enqueue a transactional outbox for future ERP delivery (checkout does not depend on ERP availability).

## Routes

| Path | SEO |
| --- | --- |
| `/cart` | noindex |
| `/checkout` | noindex |
| `/order/success` | noindex |
| `/order/[token]` | noindex |

## Invariants

1. Browser may send ids + quantities only; **server calculates** unit price, line totals, delivery fee, total.
2. Fulfillment dates/windows validated in **Europe/Minsk** against configurable lead time.
3. Purchaser and recipient are separate fields (delivery); “Получатель — я” copies purchaser into recipient for the request.
4. Surprise + `addressKnown=false` are explicit flags (not fake address text).
5. Phones normalized server-side to E.164-like `+375…`.

## Fulfillment

- `DELIVERY` — date, time window, recipient, address (or unknown), optional details
- `PICKUP` — date, time window, purchaser contact; pickup instructions from fulfillment settings

Time windows and lead time: Admin → `/admin/fulfillment` (`GET/PATCH /api/v1/admin/fulfillment/settings`).

## Submit

`POST /api/v1/orders` with `idempotencyKey` (8–128 chars). Rate-limited (60/min per IP on order create).

Idempotency (Phase 4.2):

- One key = one checkout submission intent (storefront keeps it in `sessionStorage` until success).
- Same key + same canonical payload → same Order; recovery returns the original **tracking token** (AES-GCM ciphertext in `idempotency_records`, TTL default 48h).
- Same key + different payload → `409 Conflict` (no token).
- Outbox is **not** used for idempotency/request-hash storage.

Success page says the order is **accepted** (RECEIVED), not confirmed. Tracking token returned on create and on in-window replay; held briefly in `sessionStorage` for the success link (not query-string PII). Clear the idempotency key after confirmed success.

# Checkout

Guest checkout only — no customer accounts (Phase 4). No online payment. No ERP.

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

`POST /api/v1/orders` with `idempotencyKey` (UUID). Rate-limited (60/min per IP on order create).

Success page says the order is **accepted** (RECEIVED), not confirmed. Tracking token returned once; stored in `sessionStorage` for the success link (not query-string PII).

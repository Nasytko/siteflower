# Orders

Commercial order lifecycle for БУКЕТ №1 (Phase 4).

## Domain

- **Order** — commercial snapshot header (fulfillment, contacts, money, status)
- **OrderItem** — immutable line snapshots (name, slug, variant, unit price, qty, line total, image URL)
- **OrderEvent** — operational history (`ORDER_CREATED`, status changes, cancel)
- **OutboxEvent** — `ORDER_CREATED` written in the same transaction (see [outbox.md](outbox.md))

Do **not** reconstruct historical totals from current Product/Variant rows.

## Order numbers

Format: `YYMMDD-NNN` from Europe/Minsk business date + `order_number_sequences` row update (`UPDATE … RETURNING`). Unique DB constraint. Not a security token.

## Tracking

- Public URL: `/order/[token]`
- Token: 32 random bytes, base64url (≥40 chars)
- DB stores **SHA-256 hex only**; raw token returned only on first successful create
- Tracking phones masked; cancellation internal reason not exposed

## Status machine

| From | DELIVERY next | PICKUP next |
| --- | --- | --- |
| RECEIVED | CONFIRMED, CANCELLED | CONFIRMED, CANCELLED |
| CONFIRMED | PREPARING, CANCELLED | PREPARING, CANCELLED |
| PREPARING | READY, CANCELLED | READY, CANCELLED |
| READY | DELIVERING, CANCELLED | COMPLETED, CANCELLED |
| DELIVERING | COMPLETED, CANCELLED | — |
| COMPLETED / CANCELLED | (terminal) | (terminal) |

Transitions via `OrdersService.transition` / `cancel` with optimistic `updateMany` on current status. Invalid → 409.

## Admin

- `GET /api/v1/admin/orders` — default date filter **today** (business TZ)
- `GET /api/v1/admin/orders/:id`
- `POST …/transition`, `POST …/cancel`
- Permissions: `ORDERS_READ` / `ORDERS_UPDATE`
- Audit: `ORDER_STATUS_CHANGED`, `ORDER_CANCELLED` (+ fulfillment settings updates)

## Idempotency

Unique `idempotency_key` on Order. Same key + same payload hash → replay (`trackingToken: null`). Same key + different payload → 409. Concurrent duplicates converge to one row (unique + in-tx recheck).

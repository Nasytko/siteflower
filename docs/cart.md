# Cart

Client-side cart for guest checkout (Phase 4).

## Storage

- Key: `bouquet-one:cart:v1` in `localStorage`
- Authoritative fields: `productId`, `variantId`, `quantity`
- Display cache (name, price, image) is UX-only — **never** trusted by the server

## Behavior

- Same variant increments quantity (max 20 per line, max 30 lines)
- Refresh keeps cart; successful order creation clears cart
- Failed / ambiguous network keeps cart; idempotency key enables safe retry

## API

Before checkout:

`POST /api/v1/checkout/validate` — server reloads products/variants, prices lines in minor units (BYN), returns issues (`PRICE_CHANGED`, unavailable, etc.)

## Availability (checkout)

| CommercialAvailability | Checkout |
| --- | --- |
| `AVAILABLE` | Allowed |
| `PREORDER` | Allowed |
| `SEASONAL` | Allowed |
| `TEMPORARILY_UNAVAILABLE` | Blocked |
| Unpublished / archived / inactive variant | Blocked |

ERP stock is **not** checked.

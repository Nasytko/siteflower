# Commerce invariants

These rules are non-negotiable for later implementation phases.

1. **Browser/client is never trusted for product prices.**
2. **Server calculates all commercial totals.**
3. **Orders contain immutable commercial snapshots** (line prices, totals, currency, applied adjustments at acceptance time).
4. **Customer may submit an order even if ERP stock is insufficient.**
5. **Shop commercial availability is separate from ERP physical stock.**
6. **ERP outage must never lose an accepted Shop order.**
7. **Shop → ERP integration uses reliable delivery**, preferably a **transactional outbox** written in the same DB transaction as the order.
8. **Integration must be idempotent** (safe retries, idempotency keys).
9. **Public order tracking uses an unguessable security token**, not a sequential order ID alone.
10. **Customer registration is not required for checkout.**
11. **Core ordering works without AI.**
12. **AI never accesses the database directly**; it uses explicitly permitted application APIs/tools.

## Promotion pricing authority

- Effective sale price is computed **only on the server** via `effectiveVariantPriceMinor` (catalog display, cart validation, order create).
- Clients may show promotion UI from public API payloads; they must **not** recompute charged amounts.
- `PERCENT` applies to all active variants; `FIXED` uses per-variant `sale_price_minor`. Schedule (`startsAt` / `endsAt`) is evaluated at read/checkout time.
- Catalog list/detail expose informational `promotion` + `effectivePriceMinor`; checkout re-evaluates from current DB state at acceptance.

See [catalog-simplification-and-merchandising.md](./catalog-simplification-and-merchandising.md).

## Order line snapshots (promotions)

On each `OrderItem`, persist:

| Field | Meaning |
| --- | --- |
| `unitPriceMinor` | Final charged unit price (immutable commercial truth) |
| `originalUnitPriceMinor` | Pre-promotion variant price when a promotion applied; otherwise `null` |
| `promotionType` | Snapshot: `PERCENT` \| `FIXED` \| `null` |

Do **not** reconstruct historical line totals from current `Product` / `ProductPromotion` rows.

## Implications

- Storefront pricing UI is informational; checkout re-quotes on the server.
- “Add to cart” may use temporary client state, but order acceptance is server-authoritative.
- ERP sync workers are downstream of Shop orders — never the gate for HTTP acceptance.
- AI features are additive assistants, not part of the critical path for placing an order.

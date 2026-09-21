# Transactional outbox

Minimal foundation for future ERP / notifications (Phase 4). **No worker yet.**

## Why

Shop PostgreSQL is the source of truth for accepted orders. External systems must consume **committed** events without losing orders if integrations fail.

## Table `outbox_events`

| Column | Notes |
| --- | --- |
| eventType | e.g. `ORDER_CREATED` |
| aggregateType / aggregateId | `Order` / uuid |
| schemaVersion | payload compatibility (start at 1) |
| payload | versioned JSON — not raw Prisma models |
| processedAt / attempts | for a future dispatcher |

## Atomicity

`ORDER_CREATED` is inserted in the **same** `$transaction` as Order + OrderItems + OrderEvent.

## Payload (v1)

Includes: `orderId`, `orderNumber`, `status`, `fulfillmentType`, `fulfillmentDate`, `totalMinor`, `currency`, `itemCount`, `requestHash`, `createdAt`.

Future consumers should tolerate additive fields; bump `schemaVersion` for breaking changes.

## Non-goals (this phase)

No NewERP calls, no stock reservation, no notification send, no outbox poller.

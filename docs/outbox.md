# SiteFlower transactional outbox (ERP)

SiteFlower enqueues `ORDER_CREATED` in the same DB transaction as the order. A separate **integration worker** claims rows and delivers HMAC-signed payloads to NewERP (or the in-process simulator).

See also:

- [integrations/siteflower-outbox.md](./integrations/siteflower-outbox.md) — claim, backoff, statuses
- [integrations/newerp-receiver-contract.md](./integrations/newerp-receiver-contract.md) — receiver expectations
- [integrations/security.md](./integrations/security.md) — HMAC, secrets, pause

## Why

Shop PostgreSQL is the source of truth for accepted orders. External systems must consume **committed** events without losing orders if integrations fail (at-least-once).

## Table `outbox_events`

| Column | Notes |
| --- | --- |
| eventType | `ORDER_CREATED` |
| aggregateType / aggregateId | `Order` / uuid |
| schemaVersion | payload compatibility (v1) |
| payload | immutable `StorefrontOrderCreatedV1` JSON (built at enqueue; includes `eventId`) |
| status | `PENDING` → `PROCESSING` → `DELIVERED` / `RETRY` / `FAILED` |
| availableAt / leaseOwner / leaseExpiresAt | claim scheduling + SKIP LOCKED leases |
| attemptCount / failureCategory / lastErrorSanitized | delivery diagnostics (no secrets) |
| remoteReference | acceptor ack id |

## Atomicity

`ORDER_CREATED` is inserted in the **same** `$transaction` as Order + OrderItems + OrderEvent + IdempotencyRecord. The outbox row id is a UUID chosen up front so `payload.eventId` matches.

Idempotency / request-hash / encrypted recovery live on `idempotency_records`, **not** in the outbox payload. Tracking tokens are never placed in outbox payloads.

## Worker

```bash
# from repo root
pnpm worker:dev

# or after build
pnpm --filter @bouquet-one/api worker
```

Requires `INTEGRATION_ENABLED=true` and `INTEGRATION_MODE=SIMULATOR|ERP` (plus keys). Admin can pause via `IntegrationRuntimeSettings` without changing env.

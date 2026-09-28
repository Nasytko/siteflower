# SiteFlower outbox delivery

## Modes

| `INTEGRATION_MODE` | Behavior |
| --- | --- |
| `DISABLED` (default) | No delivery; worker may heartbeat but does not claim |
| `SIMULATOR` | In-process HMAC-verified acceptor (`SimulatorService`) |
| `ERP` | HTTPS POST to `INTEGRATION_ENDPOINT` (localhost HTTP allowed) |

Hard gate: `INTEGRATION_ENABLED` (default false). Soft pause: admin `PATCH /api/v1/admin/integrations/erp/enabled` → `integration_runtime_settings.paused`.

## Claim algorithm

1. Heartbeat worker id
2. If env disabled / mode DISABLED / runtime paused → return
3. Release expired `PROCESSING` leases → `RETRY`
4. `SELECT … FOR UPDATE SKIP LOCKED` of `PENDING`/`RETRY` with `available_at <= now`, or `PROCESSING` with expired lease
5. Set `PROCESSING`, bump `attempt_count`, set lease

Concurrency: `INTEGRATION_CONCURRENCY` (default 2). Lease: `INTEGRATION_LEASE_SECONDS` (default 60).

## Backoff

Base delays: **30s → 2m → 10m → 30m → 1h**, then **+1h capped**, plus **0–20% jitter**.

Retryable: `NETWORK_ERROR`, `TIMEOUT`, `REMOTE_5XX`, `RATE_LIMITED`.  
Non-retryable after ≤2 attempts: `AUTH_FAILED`, `REMOTE_4XX`, `CONFIGURATION_ERROR`, `INVALID_RESPONSE`.  
Always `FAILED` at `INTEGRATION_MAX_ATTEMPTS` (default 12).

## Payload

Built once at enqueue via `buildStorefrontOrderCreatedV1` — see contracts `StorefrontOrderCreatedV1`. Money fields are **string minor units**. No tracking token.

## Admin API

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/api/v1/admin/integrations/erp/status` | `INTEGRATION_READ` |
| GET | `/api/v1/admin/integrations/erp/events` | `INTEGRATION_READ` |
| GET | `/api/v1/admin/integrations/erp/events/:id` | `INTEGRATION_READ` (phones masked) |
| POST | `/api/v1/admin/integrations/erp/events/:id/retry` | `INTEGRATION_OPERATE` |
| POST | `/api/v1/admin/integrations/erp/test-connection` | `INTEGRATION_OPERATE` |
| POST | `/api/v1/admin/integrations/erp/test-event` | `INTEGRATION_OPERATE` (SIMULATOR only) |
| PATCH | `/api/v1/admin/integrations/erp/enabled` | `INTEGRATION_CONFIGURE` |

`SUPER_ADMIN` has all three permissions; `MANAGER` has `INTEGRATION_READ` only.

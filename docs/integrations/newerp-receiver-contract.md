# NewERP receiver contract (outbound from SiteFlower)

Receivers **must** be idempotent on `eventId` (UUID). Delivery is **at-least-once**.

## Endpoint

- Method: `POST`
- Body: JSON `StorefrontOrderCreatedV1` (UTF-8), Content-Type `application/json`
- Path: whatever NewERP exposes; SiteFlower signs the **URL pathname** used in the request

## Success response

HTTP 2xx with JSON:

```json
{
  "status": "ACCEPTED",
  "eventId": "<same as request>",
  "externalOrderId": "<order.externalOrderId>",
  "remoteReference": "<stable id in NewERP>",
  "receivedAt": "<ISO-8601>"
}
```

Replays of the same `eventId` should return the **same** `remoteReference` (or an equivalent stable ack).

## Health (optional but used by Test Connection)

`GET …/health` (pathname derived from endpoint + `/health`) with HMAC headers over empty body:

```json
{
  "status": "OK",
  "service": "newerp",
  "timestamp": "<ISO-8601>"
}
```

## Error mapping (SiteFlower client)

| HTTP | Category |
| --- | --- |
| 401 / 403 | `AUTH_FAILED` |
| 429 | `RATE_LIMITED` |
| other 4xx | `REMOTE_4XX` |
| 5xx | `REMOTE_5XX` |

## Schema

See `@bouquet-one/contracts` → `StorefrontOrderCreatedV1`. Additive fields OK; breaking changes require `schemaVersion` bump.

Do **not** expect tracking tokens or password hashes in the payload.

# Integration security

## HMAC protocol v1

Canonical string (exact; no trailing newline):

```
v1
${keyId}
${timestamp}
${nonce}
${method}
${path}
${bodyHashHex}
```

- `timestamp`: unix seconds (decimal string)
- `method`: uppercase (`POST` / `GET`)
- `path`: URL pathname only
- `bodyHashHex`: lowercase hex SHA-256 of **exact** UTF-8 body bytes
- Signature: HMAC-SHA256(secret, canonical) → hex

Headers (`INTEGRATION_HEADERS` in contracts):

- `X-Bouquet-Integration-Key`
- `X-Bouquet-Integration-Timestamp`
- `X-Bouquet-Integration-Nonce`
- `X-Bouquet-Integration-Signature`
- `X-Bouquet-Integration-Version` = `1`

Receivers should enforce ±300s skew (`INTEGRATION_TIMESTAMP_SKEW_SECONDS`) and reject nonce replays within the skew window.

## Secrets

- `INTEGRATION_HMAC_SECRET` — never returned by API (`secretConfigured: boolean` only)
- ERP mode requires secret length ≥ 32
- `INTEGRATION_ENDPOINT` must be HTTPS unless host is `localhost` / `127.0.0.1`

## Simulator

Public routes under `/api/v1/integration/simulator/*` exist **only** when `INTEGRATION_MODE=SIMULATOR` (otherwise 404). Prefer in-process delivery from the worker (no loopback SSRF). Fault injection header `X-Bouquet-Simulator-Fault` is ignored in production.

## Operational controls

1. Env `INTEGRATION_ENABLED=false` — hard off (no claim)
2. Admin pause — soft off via `integration_runtime_settings`
3. Manual retry — resets `FAILED`/`RETRY` to `PENDING` (audit `INTEGRATION_EVENT_MANUAL_RETRY`)

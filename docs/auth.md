# Authentication & sessions

## Model

Browser holds an **opaque** session token in an HttpOnly cookie (`bouquet_admin_session`).
PostgreSQL stores only `sha256(token)` (`admin_sessions.token_hash`).

```
POST /api/v1/admin/auth/login
 → verify Argon2id password
 → create AdminSession
 → Set-Cookie (HttpOnly, SameSite=Lax, Secure in production, Path=/)
```

## Lifetimes (configurable)

| Setting | Default | Env |
| --- | --- | --- |
| Absolute TTL | 12 hours | `SESSION_ABSOLUTE_TTL_SECONDS=43200` |
| Idle TTL | 30 minutes | `SESSION_IDLE_TTL_SECONDS=1800` |
| `lastUsedAt` write throttle | 60 seconds | `SESSION_LAST_USED_THROTTLE_SECONDS` |

A session is valid only if:

- not revoked;
- `now < expiresAt` (absolute);
- `now < lastUsedAt + idle TTL`;
- owning `AdminUser.status === ACTIVE`.

## Cookie attributes

- **HttpOnly**: yes
- **Secure**: production only
- **SameSite**: `Lax` (same-site admin on the web origin; API called via Next rewrite or CORS credentials)
- **Path**: `/`
- **Domain**: unset (host-only)

## CSRF

Primary: `SameSite=Lax` cookie.
Additional: `AdminCsrfGuard` validates `Origin`/`Referer` against `CORS_ORIGINS` for state-changing `/admin` routes.
Production rejects mutating admin requests with neither Origin nor Referer.

## Bootstrap first admin

```bash
pnpm admin:create --email director@example.com --name "Director" --password "..."
```

No default password. `ADMIN_BOOTSTRAP_PASSWORD` is rejected when `NODE_ENV=production`.

## Argon2id

- type: argon2id
- memoryCost: 19456 (≈19 MiB)
- timeCost: 2
- parallelism: 1
- password length: 12–128

## Login abuse controls

- Login route overrides the global throttle with a stricter limit: 5 / 60s (`LOGIN_THROTTLE_*`). Other routes keep the global `THROTTLE_*` budget.
- Generic error: `Invalid email or password.`
- Dummy Argon2 verify for unknown/disabled accounts (timing)

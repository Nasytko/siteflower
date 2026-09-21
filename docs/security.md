# Security

## Baseline

- Helmet, Zod env validation, ValidationPipe
- Structured errors without production stack traces
- Request IDs, Pino logging (redacts cookies/passwords)
- CORS allowlist + credentials for admin cookies
- Global rate limit; login route uses a stricter override (`LOGIN_THROTTLE_*`)
- Trust proxy for Nginx
- Graceful shutdown

## Admin authentication (Phase 1)

See [auth.md](auth.md), [permissions.md](permissions.md), [audit.md](audit.md).

| Concern | Implementation |
| --- | --- |
| Password hashing | Argon2id (m=19456, t=2, p=1) |
| Session | Opaque HttpOnly cookie + SHA-256 hash in PostgreSQL |
| Authorization | RBAC permissions, `@RequirePermissions` AND semantics |
| Audit | Append-only, transactional with sensitive mutations |
| CSRF | SameSite=Lax + Origin/Referer allowlist check |
| Bootstrap | `pnpm admin:create` only — no default password |

## CSRF threat model

Admin UI and API are same-site in production (web origin; API via reverse proxy/rewrite).
`SameSite=Lax` blocks cross-site POSTs carrying the session cookie.
`AdminCsrfGuard` additionally requires `Origin` or `Referer` to match `CORS_ORIGINS` for mutating `/admin` routes in production.

## Limitations

- No email-based password reset yet (admin-set reset only)
- No step-up MFA yet
- Custom roles UI not implemented (system roles only)

Customer checkout remains registration-free (commerce invariant).

## Commerce (Phase 4)

| Concern | Implementation |
| --- | --- |
| Price tampering | Server ignores client prices; validates cart from DB |
| Tracking | Cryptographic token; SHA-256 stored; never `/order/:id` alone |
| Idempotency | Unique key + payload hash; concurrent create → one Order |
| IDOR (admin) | `ORDERS_READ` / `ORDERS_UPDATE` on admin order routes |
| CSRF | Same admin Origin/Referer guard on mutations |
| PII logging | Pino redacts purchaser/recipient phones, names, address, card, comment, tracking `token` param |
| XSS | Card/comment rendered as text; length-limited |
| Rate limit | Order create throttled (`POST /orders`, 60/min) |

See [checkout.md](checkout.md), [orders.md](orders.md).

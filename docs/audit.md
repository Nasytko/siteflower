# Audit log

Append-only `audit_logs` table.

Security-sensitive actions write an audit row **in the same DB transaction** as the state change when feasible (disable user + revoke sessions + audit).

## Actions

`LOGIN_SUCCESS`, `LOGIN_FAILURE`, `LOGOUT`, `LOGOUT_ALL`,
`ADMIN_USER_CREATED`, `ADMIN_USER_UPDATED`, `ADMIN_USER_DISABLED`,
`ADMIN_USER_ENABLED`, `ADMIN_PASSWORD_RESET`

## Never stored in metadata

- passwords
- password hashes
- raw session tokens
- cookie headers

API: `GET /api/v1/admin/audit` requires `AUDIT_READ`. Filters: actor, action, entity, date range. Pagination only — PostgreSQL is enough.

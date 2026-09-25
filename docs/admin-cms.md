# Admin / CMS

Admin UI lives in `apps/web` under `/admin` (route group `(admin)`). It calls the same Commerce API as the storefront. No separate admin deployable in v1.

## Implemented

- Auth (session cookie, RBAC, CSRF, audit)
- Users & roles (system roles)
- Catalog products / variants / media / publish
- Taxonomies & collections
- Homepage & storefront settings
- Fulfillment (delivery / pickup windows)
- Orders list / detail / status transitions / cancel

## Still out of scope (do not implement in current phases)

- Payments / ExpressPay
- ERP sync UI
- Customer accounts
- MFA / email password reset
- Custom roles editor
- Site Health dashboard (future; not implemented)

## Rules

- Admin mutations must write AuditLog in the same transaction when changing sensitive state
- Storefront never reads admin-only fields
- Preview routes stay noindex

# Admin / Security / Cleanup Audit Report

**Date:** 2026-09-26  
**Scope:** Full Admin Panel, Data-Exchange Security, Code Structure & Cleanup  
**Not in scope:** ERP, payments, new product features

## A. Executive summary

Overall condition after this audit: **good for production**, with confirmed defects fixed and prior hardening verified intact.

Highest-impact fixes shipped:
1. Product editor no longer wipes variants/taxonomies/SEO when saving from another tab
2. Admin SSR cookie forwarding now sends only `bouquet_admin_session`
3. Tracking tokens no longer leak via exception-filter `path`
4. Fake homepage reviews removed
5. Non-commercial packaging selector removed from PDP
6. Dead unregistered catalog controllers/service deleted
7. Page-level RBAC redirects added for catalog/settings/homepage

Environmental note: Docker/Postgres were unavailable in this session, so integration, Playwright, and fresh-DB gates are **NOT RUN**. Lint, typecheck, unit, and build **PASS**.

## B. Admin pages audited

| Route | Status |
|-------|--------|
| `/admin/login` | OK |
| `/admin` | OK — no fake metrics |
| `/admin/orders` | OK + RBAC |
| `/admin/orders/[id]` | OK + RBAC |
| `/admin/catalog/products` | OK + page READ gate added |
| `/admin/catalog/products/[id]` | Fixed tab-save wipe + READ gate |
| `/admin/catalog/products/[id]/preview` | READ gate added |
| `/admin/catalog/collections` | Create/preview only (documented debt) + READ gate |
| `/admin/catalog/{categories,flowers,occasions,recipients,styles,colors}` | OK + READ gate |
| `/admin/storefront/homepage` | OK + READ gate |
| `/admin/storefront/settings` | OK + READ gate |
| `/admin/fulfillment` | OK + RBAC |
| `/admin/users` | OK + RBAC |
| `/admin/audit` | OK + RBAC |

Nav matches list routes; detail routes are intentional orphans linked from lists.

## C. Admin bugs found

| Severity | Issue | Root cause | Fix | Coverage |
|----------|-------|------------|-----|----------|
| High | Save from non-variants tab wiped variants/taxonomies/SEO/schedules | Tab fields unmounted; FormData empty/`null` | Persist inactive-tab fields in hidden inputs; dirty-state `beforeunload` | Manual + typecheck |
| High | Packaging selector not in order API | Frontend-only option | Removed PDP packaging listbox; cart uses variant name only | E2E storefront updated |
| Medium | Page RBAC missing on catalog/settings/homepage | Relied on API 403 only | `requireAdminPermission` redirect | Code review |
| Low | `lifecycle('archive')` client gate wrong | `action !== 'archive'` bypass | Require `canPublish` for all lifecycle actions | Code review |

## D. Admin UX cleanup

- Dashboard: kept real user/role shortcuts only (no fabricated metrics)
- Product editor: pending label, dirty warning, safer tab persistence
- Shared admin UI classes retained from prior redesign
- Collections: left incomplete (create/preview) — not falsely presented as full CMS

## E. RBAC matrix (verified by code)

| Area | SUPER_ADMIN | MANAGER | CONTENT_MANAGER |
|------|-------------|---------|-----------------|
| Dashboard | yes | yes | yes |
| Orders | yes | yes | no (redirect) |
| Catalog | yes | yes | yes |
| Homepage | yes | yes | yes |
| Storefront settings | yes | yes | no (redirect) |
| Fulfillment | yes | yes | no (redirect) |
| Users | yes | read only | no |
| Audit | yes | yes | no |

API `@RequirePermissions` remains authoritative.

## F. Data-exchange security findings

| Boundary | Finding |
|----------|---------|
| Browser → Next adminFetch | **Fixed:** only `bouquet_admin_session` forwarded |
| Next → Nest | CSRF Origin/Referer vs `CORS_ORIGINS`; session cookie auth |
| Nest → DB | Prisma; DTOs/mappers; no raw entity leaks on active paths |
| Tracking | Token redacted in Pino + exception `path` |
| Revalidate | Constant-time secret compare (existing) |
| Media | Path traversal guard on serve (existing) |

## G. PII / secrets

- Pino redacts phones, names, address, card message, cookies, passwords, `req.params.token`
- Exception filter now sanitizes `/orders/track/...` in response `path` and logs
- No `NEXT_PUBLIC_*` secrets
- Recovery crypto remains AES-256-GCM

## H. Code structure findings

- Deleted unused legacy catalog controllers/service/dto (not registered in `CatalogModule`)
- Extracted `sanitizeSensitiveUrl` shared util
- Extracted `buildAdminCookieHeader` + `requireAdminPermission`
- Dual Prisma/contract enums for OrderStatus remain intentional and in sync

## I. Deleted files/code

| Item | Reason |
|------|--------|
| `apps/api/src/catalog/catalog.service.ts` | Unregistered dead service |
| `apps/api/src/catalog/catalog.dto.ts` | Only used by dead controllers |
| `apps/api/src/catalog/admin-taxonomy.controller.ts` | Unregistered; replaced by `taxonomy.controller.ts` |
| `apps/api/src/catalog/admin-collections.controller.ts` | Unregistered; replaced by `collections.controller.ts` |
| `apps/web/src/components/storefront/reviews-carousel.tsx` | Hardcoded fake testimonials |
| `packagingChoicesFor` | Removed; no commercial packaging option |

## J. Files deliberately retained

| Item | Why |
|------|-----|
| `docs/phase-4.2-report.md`, `security-hardening.md` | Historical / operational docs |
| `apps/web/AGENTS.md`, `CLAUDE.md` | Agent instructions, not runtime |
| `e2e/smoke.spec.ts` | Live smoke suite |
| Collections manager (create-only) | Partial CMS; API fuller — debt, not dead code |
| Category packaging badge on cards | Merchandising label only, not selectable order option |
| CSP disabled in Helmet | Documented; unsafe-eval CSP for Next needs separate design |

## K. Duplication removed

- URL sanitizer consolidated (`sanitizeSensitiveUrl`)
- Cookie header builder extracted for testability

## L. Database / query changes

None. No migrations in this audit.

## M. Performance

- Explicit JSON/urlencoded body limit `256kb` (media remains multipart)
- No N+1 changes required after inspection of orders list DTO path

## N. Admin visual QA

Automated browser walkthrough in this session: **NOT RUN** (Postgres/servers down). Prior admin CSS shell remains.

## O. Browser runtime audit

**NOT RUN** in this session.

## P. Security regression

Unit coverage added for cookie header + URL sanitizer. CSRF/CORS/ValidationPipe/idempotency/media path verified by code audit as already correct.

## Q. Commerce regression

E2E packaging assertion updated. Full Playwright commerce: **NOT RUN** (no local servers/Postgres).

## R. Fresh DB

**NOT RUN** — Docker daemon unavailable; port 5432 closed.

## S. Remaining technical debt

**P1**
- Collections admin lacks edit/OCC UI for rules/products/SEO
- Full Admin Playwright suite + visual QA at 1440/1024

**P2**
- Product editor still uses pipe-delimited textareas (functional but crude)
- Dual OrderStatus/FulfillmentType (Prisma + contracts) — keep synced or generate
- Production-safe CSP design for Next + media

**P3**
- Unused permission vocabulary (`SEO_*`, `DELIVERY_*`, `SITE_HEALTH_READ`) in contracts
- Orders lack OCC/`expectedVersion` (may be intentional)

## T. Production blockers

**Production blockers remaining: NONE** known in application code from this audit.

Unexecuted gates (integration / Playwright / fresh DB) are **verification gaps** due to unavailable Postgres/Docker, not identified code defects. Re-run those gates before a release cut.

## U. Verification matrix

| Gate | Result |
|------|--------|
| lint | PASS |
| typecheck | PASS |
| unit (web + api) | PASS |
| PostgreSQL integration | NOT RUN (Postgres unavailable) |
| build (api + web) | PASS |
| Playwright Admin | NOT RUN |
| Playwright storefront | NOT RUN |
| Playwright commerce desktop | NOT RUN |
| Playwright commerce mobile | NOT RUN |
| RBAC direct-navigation | NOT RUN (page gates added; API RBAC verified in code) |
| CSRF | PASS (code audit — already correct) |
| tracking sanitization | PASS (unit + filter fix) |
| PII log scan | NOT RUN (redaction paths verified in code) |
| fresh DB | NOT RUN (Docker/Postgres unavailable) |

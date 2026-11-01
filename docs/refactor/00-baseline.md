# Task 00 — Baseline technical state

**Status:** complete (audit record) — followed by Task 01 architecture docs  
**Date:** 2026-11-01  
**Scope:** architecture inventory + local verification. No application source changes in Task 00. No dependency upgrades. No lint autofix. No VPS access.

Related: [01](./01-dependency-map.md) · [02](./02-legacy-inventory.md) · [03](./03-risk-register.md) · [04](./04-test-baseline.md) · [05](./05-proposed-changes.md) · Task 01: [06](./06-target-architecture.md)–[10](./10-implementation-roadmap.md) · R21 ban: [00.1-db-integration-ban.md](./00.1-db-integration-ban.md)

---

## Infrastructure context

| Environment | Role |
| --- | --- |
| Developer workstation (Windows + Cursor) | Primary coding environment |
| **VPS** | Real SiteFlower runtime / production PostgreSQL — live data SoT |
| Local PostgreSQL | Dev/CI convenience only — **not** a proxy for VPS state |

Task 00 used local isolated DB `bouquet_one_baseline_audit` once to prove migrations and (historically) run gated API tests. **After Task 00.1 rollback, API DB integration is under an organizational ban (R21 P0 OPEN)** — see [00.1-db-integration-ban.md](./00.1-db-integration-ban.md). Do not treat past gated runs as permission to re-run integration now.

---

## 1. Platform snapshot

| Item | Value |
| --- | --- |
| Root package | `bouquet-one` `0.0.0` |
| Package manager | `pnpm@10.17.0` |
| Node (audit host) | `v24.21.0` (engines: `>=24`) |
| Turbo | `2.11.2` |
| Workspace | `apps/*`, `packages/*` |
| Topology | Next.js storefront/admin → REST `/api/v1` → NestJS API → PostgreSQL (VPS in real deploy) |

| Unit | Name | Role |
| --- | --- | --- |
| `apps/web` | `@bouquet-one/web` | Next.js **16.3.5**, React **19.2**, Tailwind **4** |
| `apps/api` | `@bouquet-one/api` | NestJS **11** |
| `packages/database` | `@bouquet-one/database` | Prisma **7.10** |
| `packages/contracts` | `@bouquet-one/contracts` | Shared DTOs/URL helpers (no Prisma) |
| `packages/ui` / `packages/config` | UI primitives / TS+ESLint presets | |
| `deploy/` | ops | Targets VPS; not inspected live |
| `e2e/` | Playwright | Not run in Task 00 |

**Invariant:** web never imports database; shared shapes via contracts.

---

## 2. Catalog shape in code (as-found)

```
FlowerType/Form/Variety/Origin
        └─► FlowerItem  ◄── ProductComponent ──► Product ──► ProductVariant
                              │
                         compositionKind / compositionPrecision (on Product)
ProductFamily (cross-PDP link)
ProductTraitDefinition → ProductTrait (e.g. AUTHORIAL)
CatalogCategory (SYSTEM_HUB | THEMATIC | GIFT_SUBTYPE | LEGACY)
  ├─ CatalogPageProduct / CatalogPageExclude
  └─ CatalogCategoryFilter → CatalogFilterDefinition
SeoLandingPage* (deprecated dual-read still wired in API/sitemap)
```

| Layer | Current | Legacy still present |
| --- | --- | --- |
| Pages | `CatalogCategory` THEMATIC + pins | `SeoLandingPage` dual-read |
| Public URL | `/catalog/*`, `/products/*` | Redirects from `/p`, `/katalog`, … |
| Admin | `/admin/catalog/pages` | Write API `/admin/seo/landings` (UI redirects) |
| Storefront PLP | `getCatalogCategory` | Unused `getSeoLanding` helpers |

Target architecture for 2.0: Task 01 docs [06](./06-target-architecture.md)–[10](./10-implementation-roadmap.md) (supersede informal “keep” notes below where they conflict).

---

## 3. Entity snapshot (Task 00 inventory)

| Entity | Task 00 note |
| --- | --- |
| `Product` / `ProductVariant` | Core commerce — keep |
| `ProductComponent` / `FlowerItem` | Composition SoT — keep |
| `compositionKind` / `compositionPrecision` | Derived/cached — Task 01 proposes adding `DESCRIPTIVE` |
| `ProductFamily` | PDP switcher — keep (narrow) |
| `ProductTraitDefinition` | AUTHORIAL — keep |
| `CatalogCategory` + pins/filters | Unified pages — keep |
| `SeoLandingPage*` | Remove after sequential cutover |
| `Product.diameterCm` | Remove later |
| Legacy URL redirects | Keep until traffic≈0 |
| Dead `flower-type-landing.tsx` / unused `getSeoLanding` | Remove with hygiene/cutover |

Detail: [02-legacy-inventory.md](./02-legacy-inventory.md).

---

## 4. SEO (as-found)

| Concern | Location | State |
| --- | --- | --- |
| Canonical routes | storefront `catalog/**`, `products/[slug]` | English canonical |
| Metadata / robots / sitemap | `apps/web/src/lib/seo/*`, `robots.ts`, `sitemap.ts` | Sitemap from API (still merges SEO landings) |
| Redirects | `next.config.ts` ↔ `public-routes.ts` | Duplicated maps |
| Dual model | API seo-landings + categories | Orphan URL risk (R01/R03) |

---

## 5. Prisma / migrations

- Schema: `packages/database/prisma/schema.prisma`
- History: **38** forward migrations (Task 00 count on audit host)
- Local proof: `migrate deploy` on empty `bouquet_one_baseline_audit` → exit 0
- `DIRECT_URL`: unused in this repo’s Prisma config
- **VPS migration status: unknown**

---

## 6. Verification (Task 00 local record)

| Command | Exit |
| --- | --- |
| `pnpm install --frozen-lockfile` | 0 |
| `pnpm db:generate` | 0 |
| `pnpm lint` / `typecheck` / `build` | 0 |
| `migrate deploy` → audit DB | 0 |
| `pnpm test` → audit DB (historical gated run) | 1 |
| `pnpm test:e2e` | NOT RUN |
| VPS | NOT RUN |

Failures recorded: media-hardening boot; commerce `RECEIVED`≠`CONFIRMED`. Details: [04-test-baseline.md](./04-test-baseline.md).

**Current policy:** do not re-run API DB integration while R21 is OPEN.

---

## 7. Problem list

| ID | Sev | Problem |
| --- | --- | --- |
| P01 | High | SeoLanding dual-read vs category-only storefront |
| P02 | High | Same class as **R21** — ungated integration DB targeting (see risk register; do not duplicate status here) |
| P03 | High | media-hardening integration boot failure (historical) |
| P04 | High | commerce transition assertion mismatch (historical) |
| P05 | Med | Stale docs (`/p`, `/katalog` as current) |
| P06 | Med | Dead `flower-type-landing.tsx` |
| P07 | Med | Unused `getSeoLanding` helpers |
| P08 | Med | Redirect map duplication |
| P09 | Med | Local Postgres port DX mismatch |
| P10 | Med | E2E not run |
| P11+ | Low | Middleware deprecation; XOR naming; diameterCm; Family coverage; enum sync |

---

## 8. Non-actions (Task 00 / standing)

- No VPS access; no inferring VPS from local DB
- No `migrate reset` / force-reset as audit technique
- Task 00.1 safety code **not** retained (rolled back); **R21 = P0 OPEN**
- Task 01 = documentation only until architecture review signs off implementation

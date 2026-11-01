# Task 00 — Dependency map

**Status:** audit inventory (Task 00)  
Code/module dependencies of the monorepo. Deploy target is VPS; this map does **not** assert live VPS topology beyond what `deploy/` describes in-repo.

## Workspace graph

```
                    ┌─────────────────────┐
                    │ @bouquet-one/config │  leaf (TS/ESLint)
                    └──────────┬──────────┘
           extends / eslint ←──┼──→ nearly all packages
                               │
     ┌─────────────────────────┼─────────────────────────┐
     ▼                         ▼                         ▼
┌────────────┐          ┌────────────┐            ┌────────────┐
│ contracts  │          │  database  │            │     ui     │
│ (no RT deps)│          │ Prisma 7   │            │ React peer │
└─────┬──────┘          └─────┬──────┘            └─────┬──────┘
      │                       │                         │
      │         ┌─────────────┘                         │
      ▼         ▼                                       ▼
┌──────────────────┐                            ┌──────────────────┐
│  @bouquet-one/api│◀── HTTP /api/v1 ───────────│  @bouquet-one/web│
│  NestJS 11       │                            │  Next.js 16      │
└──────────────────┘                            └──────────────────┘
```

Outside pnpm workspace imports:

- `e2e/` — Playwright hits web+api over HTTP
- `deploy/` — builds images / nginx / ops against apps
- root scripts — `db:*`, `admin:*`, `media:*`, `test:e2e`

## Declared `workspace:*` edges

| Package | Runtime | Dev |
| --- | --- | --- |
| `@bouquet-one/web` | `contracts`, `ui` | `config` |
| `@bouquet-one/api` | `contracts`, `database` | `config` |
| `@bouquet-one/database` | — | `config` |
| `@bouquet-one/contracts` | — | `config` |
| `@bouquet-one/ui` | — (peers: react/react-dom) | `config` |
| `@bouquet-one/config` | — | — |

**Cycles:** none in the workspace graph.

## Per-unit entry points

### `apps/web`

- Entry: Next App Router under `apps/web/src/app/`
- Public: `src/app/(storefront)/…`
- Admin: `src/app/(admin)/admin/…`
- Middleware: `apps/web/src/middleware.ts` (admin auth only; **no** SEO redirects)
- Config: `apps/web/next.config.ts` (legacy redirects, headers, transpile `@bouquet-one/ui`)
- Lib: `src/lib/{public-api,admin-*,seo,katalog-search-params,…}`

### `apps/api`

- Entry: `src/main.ts`, worker `src/worker-main.ts`
- Module root: `src/app.module.ts`
- Domains: `auth`, `admin-users`, `audit`, `catalog`, `orders`, `storefront`, `media`, `legal`, `integration`, `health`, `database`, `config`, `common`, `cli`
- Catalog surface (high fan-in): `src/catalog/*` (~60+ files)
- Scripts: `scripts/seed-dev-catalog.ts`, catalog rule/slug migrate helpers

### `packages/database`

- Schema: `prisma/schema.prisma`
- Migrations: `prisma/migrations/*` (38)
- Client: generated to `src/generated/prisma`
- Public API: `src/index.ts`, `cjs-bridge.cjs` (Nest CJS ↔ ESM)

### `packages/contracts`

- Barrel: `src/index.ts`
- Catalog/SEO-critical: `catalog.ts`, `catalog-page-rules.ts`, `public-routes.ts`, `legacy-url-migrate.ts`, `seo-health.ts`

### `packages/ui`

- `src/index.ts` → `Button`, `cn`
- No build emit; Next transpiles source

### `packages/config`

- `typescript/{base,nextjs,nestjs}.json`
- `eslint/base.js`

### `deploy/`

- `Dockerfile.api`, `Dockerfile.web`, `docker-compose.prod.yml`
- `nginx/`, `lib/{common,health,nginx,preflight}.sh`, `ops/`, `env/production.env.example`

### `e2e/`

- Specs: `smoke`, `storefront`, `commerce`, `legal`, `media`, `integration-erp`, `visual-qa` (opt-in)
- Config: root `playwright.config.ts` (starts API+web via `webServer`)

## Turbo task graph (`turbo.json`)

| Task | Depends on | Outputs / notes |
| --- | --- | --- |
| `generate` | — | Prisma `src/generated/**` |
| `build` | `generate`, `^build` | `dist/**`, `.next/**` |
| `typecheck` | `generate`, `^build` | — |
| `test` | `build` | — |
| `lint` / `clean` / `dev` | — | `dev` persistent uncached |

## Coupling notes (non-graph)

1. **Contracts vs Prisma enums** must stay manually aligned (roles, payment, catalog enums).
2. **Legacy redirects duplicated:** `apps/web/next.config.ts` ↔ `packages/contracts/src/public-routes.ts` (`LEGACY_PATH_REDIRECTS`).
3. **API Prisma load path** uses dynamic import + optional CJS bridge — operational complexity, not a package cycle.
4. **UI package has no `build` script** — fine under Turbo `^build` because consumers transpile source.
5. **Catalog dual model** couples API `SeoLandingsService` into `PublicCatalogService.getSitemap()` even after storefront PLP cutover.

## Import direction rules (target for 2.0)

Keep:

- web → contracts, ui
- api → contracts, database
- never web → database
- never contracts → database / nest / next

# Development

## Setup

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:generate
pnpm db:migrate
pnpm admin:create --email director@example.com --name "Director" --password "your-long-password"
pnpm seed:dev-catalog
pnpm dev
```

Turbo starts `apps/web` and `apps/api` in parallel.

| Service | URL |
| --- | --- |
| Storefront | http://localhost:3000 |
| Admin | http://localhost:3000/admin |
| API health | http://localhost:3001/api/v1/health |
| OpenAPI UI (dev) | http://localhost:3001/docs |
| OpenAPI JSON | http://localhost:3001/docs/openapi.json |
| Admin login | http://localhost:3000/admin/login |

## First admin user

```bash
pnpm admin:create --email director@example.com --name "Director" --password "your-long-password"
```

## Dev catalog seed

```bash
ALLOW_DEV_CATALOG_SEED=true pnpm seed:dev-catalog
```

Upserts deterministic published products (including slug `ameli`) for local E2E. See [storefront.md](./storefront.md).

## Common commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build

pnpm db:generate
pnpm db:migrate          # prisma migrate dev
pnpm db:migrate:deploy   # CI / prod-like
pnpm db:studio

pnpm test:e2e            # Playwright (build first; visual QA excluded by default)
pnpm test:e2e:visual     # Optional screenshot matrix
```

## Environment

- Root `.env` is the single local source (never commit it).
- `.env.example` lists all variables and conceptual groups.
- API validates env at startup via Zod and fails fast on invalid production config.
- Browser-exposed variables must use the `NEXT_PUBLIC_` prefix and must never contain secrets.

## PostgreSQL (Docker)

```bash
docker compose up -d
docker compose ps
docker compose logs -f postgres
docker compose down
```

Local Docker maps Postgres to host port **5433** by default (`POSTGRES_PORT`) to avoid clashes with an existing local Postgres on 5432.

## Testing notes

- API unit tests: Jest (`*.spec.ts`) — no Nest `build` required
- API integration tests: Jest + Supertest (`*.integration-spec.ts`) — Turbo runs package `build` first
- Web: small Node test runner checks for SEO/cart helpers
- E2E: Playwright smoke + storefront + commerce; visual QA via `pnpm test:e2e:visual`

## Production Docker

Application images and orchestration remain out of scope for local DX. Local Docker is PostgreSQL only — keep day-to-day workflow as `pnpm dev` / `pnpm build` + `start`.

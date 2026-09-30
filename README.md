# БУКЕТ №1

Flower commerce platform for Grodno, Belarus.

Modular monolith: public storefront + admin CMS + commerce API. Orders are accepted without depending on ERP availability (see [docs/commerce-invariants.md](docs/commerce-invariants.md)).

> Current status: **commerce live** (catalog, cart, checkout, tracking, admin) plus Belarus legal pages and **SiteFlower→ERP outbox foundation** (worker + simulator). Online payments and NewERP itself remain out of scope.

## Architecture (high level)

```
Storefront (Next.js) ─┐
Admin (/admin)        ├─→ Commerce API (NestJS) ─→ PostgreSQL
                      ┘         │
                                ├─→ transactional outbox → worker → Simulator / future NewERP
                                └─→ local media (masters + derivatives)
```

## Repository layout

```
apps/web          Next.js App Router — storefront + /admin
apps/api          NestJS REST API — /api/v1
packages/database Prisma 7 + PostgreSQL
packages/contracts Shared API contract types
packages/ui       Shared UI primitives
packages/config   Shared TypeScript / ESLint baselines
docs/             Architecture and operational documentation
e2e/              Playwright (smoke, storefront, commerce)
```

## Prerequisites

- Node.js 24 LTS
- pnpm 10.17+
- Docker (for local PostgreSQL)

## Quick start

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:generate
pnpm db:migrate
pnpm admin:create
pnpm seed:dev-catalog
pnpm build
pnpm --filter @bouquet-one/api start
pnpm --filter @bouquet-one/web start
```

Local Postgres is published on host port **5433** by default (see `POSTGRES_PORT` / `DATABASE_URL` in `.env.example`).

- Web: http://localhost:3000
- API health: http://localhost:3001/api/v1/health
- Swagger (dev only): http://localhost:3001/docs

## Quality gates

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

E2E (requires built apps; system Chrome recommended on Windows):

```bash
PLAYWRIGHT_USE_SYSTEM_CHROME=true pnpm test:e2e
```

Optional visual screenshot matrix:

```bash
RUN_VISUAL_QA=true PLAYWRIGHT_USE_SYSTEM_CHROME=true pnpm exec playwright test e2e/visual-qa.spec.ts
```

## Documentation

| Doc | Purpose |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | System design and module boundaries |
| [docs/development.md](docs/development.md) | Local workflow |
| [docs/orders.md](docs/orders.md) | Order lifecycle + idempotency |
| [docs/checkout.md](docs/checkout.md) | Checkout rules |
| [docs/security.md](docs/security.md) | Security baseline |
| [docs/security-hardening.md](docs/security-hardening.md) | Phase 4.2 hardening decisions |
| [docs/production-readiness.md](docs/production-readiness.md) | Production checklist |
| [docs/commerce-invariants.md](docs/commerce-invariants.md) | Non-negotiable commerce rules |

## Production Docker

Local Docker remains **PostgreSQL only** (`docker compose up -d`).

HostFly / Ubuntu production packaging (Nginx + Compose project `shopbuket1` + S3 media):

- Runbook: [docs/deployment-hostfly.md](docs/deployment-hostfly.md)
- First install: `sudo ./install.sh`
- Deploy: `./deploy.sh`
- Rollback: `./rollback.sh`
- Backup: `./backup.sh`
- Health: `./healthcheck.sh`
- Admin: `./admin-create.sh`

## License

Proprietary — all rights reserved.

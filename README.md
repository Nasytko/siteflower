# БУКЕТ №1

Flower commerce platform for Grodno, Belarus.

This repository is a **modular monolith** monorepo. The storefront stays simple for customers; the platform underneath is built for long-term reliability and extension (admin/CMS, payments, ERP, mobile apps, AI assistants).

> Current phase: **Foundation only**. No catalog, cart, checkout, payments, ERP, or AI yet.

## Architecture (high level)

```
Storefront (Next.js) ─┐
Admin (/admin)        ├─→ Commerce API (NestJS) ─→ PostgreSQL
Future Mobile App     ┘         │
                                ├─→ future ERP (outbox)
                                ├─→ future payments
                                └─→ future AI gateway
```

The customer website never depends on ERP availability for accepting orders. See [docs/commerce-invariants.md](docs/commerce-invariants.md).

## Repository layout

```
apps/web          Next.js App Router — storefront + future /admin
apps/api          NestJS REST API — /api/v1
packages/database Prisma 7 + PostgreSQL conventions
packages/contracts Shared API contract types
packages/ui       Shared UI primitives (shadcn-ready)
packages/config   Shared TypeScript / ESLint baselines
docs/             Architecture and operational documentation
e2e/              Playwright smoke tests
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
pnpm dev
```

Local Postgres is published on host port **5433** by default (see `POSTGRES_PORT` / `DATABASE_URL` in `.env.example`).

- Web: http://localhost:3000
- API health: http://localhost:3001/api/v1/health
- Swagger (dev): http://localhost:3001/docs

## Quality gates

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Optional smoke E2E (requires prior `pnpm build`):

```bash
pnpm test:e2e
```

## Documentation

| Doc | Purpose |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | System design and module boundaries |
| [docs/development.md](docs/development.md) | Local workflow |
| [docs/database.md](docs/database.md) | Prisma/PostgreSQL conventions |
| [docs/security.md](docs/security.md) | Security baseline and future auth |
| [docs/seo.md](docs/seo.md) | SEO foundation |
| [docs/admin-cms.md](docs/admin-cms.md) | Future admin/CMS design |
| [docs/site-health.md](docs/site-health.md) | Future Site Health checks |
| [docs/commerce-invariants.md](docs/commerce-invariants.md) | Non-negotiable commerce rules |
| [docs/media.md](docs/media.md) | Future media/storage architecture |
| [docs/ux-principles.md](docs/ux-principles.md) | Customer UX constraint |

## License

Proprietary — all rights reserved.

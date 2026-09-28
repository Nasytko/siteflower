# Architecture

## Why a modular monolith

We need one deployable commerce backend that can serve:

- Next.js storefront
- Next.js `/admin`
- Future React Native / Expo apps
- Future ERP / payment / AI integrations

Microservices would add operational cost without a proven scale or team-boundary need. Clear module boundaries inside one NestJS API keep the door open to extract services later if required.

## Runtime topology

```
┌─────────────┐     REST /api/v1      ┌──────────────┐
│  apps/web   │ ───────────────────▶ │  apps/api    │
│  Next.js    │                      │  NestJS      │
└─────────────┘                      └──────┬───────┘
                                            │ Prisma 7
                                            ▼
                                     ┌──────────────┐
                                     │ PostgreSQL   │
                                     └──────────────┘
```

Future mobile clients use the **same** Commerce API. They never talk to PostgreSQL or ERP directly.

## Module boundaries (API)

Logical modules (folders / Nest modules) should own their persistence access and public DTOs:

| Module (future) | Responsibility |
| --- | --- |
| `catalog` | Products, variants, taxonomies, promotions, bestsellers, budget ranges, media, publication — see [catalog-simplification-and-merchandising.md](./catalog-simplification-and-merchandising.md) |
| `checkout` | Carts, quotes, order submission |
| `orders` | Order lifecycle, snapshots, tracking tokens |
| `customers` | Optional accounts, addresses |
| `content` | CMS pages, banners, FAQ |
| `integrations` | ERP, payments, outbox workers |
| `ai-gateway` | Tool-restricted AI access to app APIs |
| `health` | Liveness/readiness style checks |
| `auth` / `admin-users` / `audit` | Admin sessions, RBAC, user admin, audit log |
| `media` | Storage port, upload validation, derivatives |

Cross-module imports should go through exported application services or contracts — not deep into another module’s repositories.

## Commerce (Phase 4)

- Guest cart is browser-local; checkout validate/create is server-authoritative (minor units BYN).
- Order + OrderItem snapshots + OrderEvent + OutboxEvent commit atomically — see [docs/orders.md](orders.md), [docs/outbox.md](outbox.md), [docs/checkout.md](checkout.md), [docs/cart.md](cart.md).
- Online payments and NewERP application code are out of this repo; SiteFlower ships a transactional outbox + optional worker/simulator for future ERP delivery.
- Legal/compliance Admin and public legal pages are part of the storefront control plane.

## Admin control plane

- Cookie sessions (HttpOnly) — not localStorage tokens
- Permissions centralized in `@bouquet-one/contracts`
- Controllers → services → repositories → Prisma
- See [docs/auth.md](auth.md) and [docs/permissions.md](permissions.md)

## Web application shape

`apps/web` hosts both public and admin UI:

- `(storefront)` — public SEO-capable routes
- `(admin)` — `/admin/*` foundation (auth later)

One Next.js app avoids duplicated design-system and deployment complexity at this stage.

## Integration principles

1. **Shop DB is the order source of truth** for accepted customer orders.
2. **ERP is asynchronous** — outage must not block checkout acceptance.
3. **Payments and AI** are adapters behind application ports.
4. **Contracts package** (`@bouquet-one/contracts`) holds shared DTO shapes for web, API, and later mobile.

## What is intentionally not here

Redis, Kafka, Elasticsearch, GraphQL, Kubernetes manifests, and microservice splits are deferred until a concrete requirement appears.

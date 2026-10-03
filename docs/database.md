# Database

## Stack

- PostgreSQL 17 (Docker Compose for local)
- Prisma ORM **7.10.0** (pinned; do not float to Prisma 8)
- Driver: `pg` + `@prisma/adapter-pg` (required by Prisma 7)

Package: `packages/database`

## Identifier strategy

- Primary keys: **UUID** (`uuid`, PostgreSQL `uuid` type)
- Generated with database/Prisma `@default(uuid())`
- Public order tracking uses unguessable tokens (hash stored) — never sequential order numbers alone

## Timestamps

- Columns: `created_at`, `updated_at` (snake_case in DB via `@map`)
- Stored as `timestamptz` (UTC)
- Business timezone is configurable (`BUSINESS_TIMEZONE`, default `Europe/Minsk`) for display and business-day rules — not for storage

## Naming

- Prisma models: PascalCase
- Tables/columns: snake_case via `@@map` / `@map`
- Enums: documented in schema; prefer Postgres enums for closed sets

## Migrations

- All schema changes go through Prisma Migrate
- `pnpm db:migrate` for local development
- `pnpm db:migrate:deploy` for CI/production-like applies
- Never edit applied migrations on shared branches; add a new migration instead

Catalog simplification migration: `20260926120000_catalog_simplification` — see [catalog-simplification-and-merchandising.md](./catalog-simplification-and-merchandising.md).

## Transactions

- Use Prisma interactive transactions for multi-step writes that must commit atomically
- Order create: Order + Items + OrderEvent + OutboxEvent in one transaction — see [outbox.md](outbox.md)

## Constraints & indexes

- Enforce uniqueness and foreign keys in the database, not only in application code
- Index foreign keys and hot filter columns (slug, status, published_at) when domain models land
- Partial indexes for “published only” queries are preferred over scanning drafts

## Money

**Never use JavaScript floating point as commercial source of truth.**

Chosen strategy:

1. Persist money as **integer minor units** (`BIGINT`) + ISO currency code (`CHAR(3)` / `VARCHAR(3)`), e.g. BYN kopecks
2. Alternative when needed: `DECIMAL(19, 4)` for rates/fees that need finer precision — still never `number` floats in business logic
3. Helpers live in `@bouquet-one/database` (`MoneyMinor`, `addMoneyMinor`, `formatMoneyMinor`) using `bigint`

Server calculates all commercial totals (see commerce invariants).

## Catalog tables

See [docs/catalog.md](catalog.md), [catalog-simplification-and-merchandising.md](catalog-simplification-and-merchandising.md), [docs/media.md](media.md), [docs/publishing.md](publishing.md).

**Products & composition**

- `products` (optional `bouquet_size_id`, optional `height_cm`; no `featured`)
- `product_variants`, `product_components`
- Join tables: `product_occasions`, `product_recipients`, `product_colors`

**Taxonomies & size**

- `flowers`, `occasions`, `recipients`, `colors` (optional `swatch`)
- `bouquet_sizes`

**Merchandising**

- `budget_ranges`
- `product_promotions`, `product_promotion_variant_prices`
- `bestseller_groups`, `bestseller_group_products`

**Media & redirects**

- `media_assets`, `media_derivatives`, `product_media`
- `slug_redirects`

### ProductMedia: one primary per product (SQL partial unique)

PostgreSQL enforces **at most one primary image per product** via a **partial unique index** created in migration `20260920190000_catalog_domain`:

```sql
CREATE UNIQUE INDEX "product_media_one_primary_per_product"
  ON "product_media"("product_id")
  WHERE "is_primary" = true;
```

This is intentional: a normal unique on `(product_id, is_primary)` would incorrectly forbid multiple `is_primary = false` rows.

**Prisma schema mismatch (documented, not a runtime bug):**  
`ProductMedia` in `schema.prisma` does **not** declare this partial unique. Prisma Migrate cannot express `WHERE is_primary = true` partial uniques in the schema DSL the same way as SQL, so the constraint lives in the SQL migration history only.

**Ops / migrate discipline:**

- Do **not** drop `product_media_one_primary_per_product` if a future `prisma migrate dev` / schema diff proposes removing “unknown” indexes.
- Before schema-only changes to `ProductMedia`, diff against the live DB (or use a shadow DB) and keep this index.
- Application code also promotes a next primary when the current primary is detached; the DB index is the hard invariant.

Money: `product_variants.price_minor` BIGINT with CHECK >= 0. Promotion sale prices and order line prices likewise use minor units.

**Removed tables** (historical migrations retained): `categories`, `styles`, `collections`, `collection_products`, and related join tables.

- Product lifecycle uses `ARCHIVED` (not a `deleted_at` column). Orders keep immutable line snapshots without product FKs.
- Hard delete only for disposable operational data with no audit/reference need
- Unique constraints involving soft-deleted rows should use partial unique indexes (`WHERE deleted_at IS NULL`) when introduced

## Admin auth tables

- `admin_users` — unique normalized email, Argon2id `password_hash`, role/status enums
- `admin_sessions` — unique `token_hash` (SHA-256 of opaque cookie token), absolute `expires_at`, `last_used_at`, soft revoke via `revoked_at`
- `audit_logs` — append-only security events with indexes for actor/action/time queries

Last active `SUPER_ADMIN` protection uses `SELECT … FOR UPDATE` inside a transaction.

## Commerce tables (Phase 4)

Migration: `20260921120000_orders_commerce` (+ catalog simplification columns on `order_items`).

- `fulfillment_settings` — singleton (id=1), time windows JSON, lead time, fees
- `order_number_sequences` — per Europe/Minsk business date counter
- `orders` — unique `order_number`, `tracking_token_hash`, `idempotency_key`; money BIGINTs with CHECKs
- `order_items` — immutable snapshots; quantity > 0; optional `original_unit_price_minor` + `promotion_type` when a promotion applied
- `order_events` — operational history
- `outbox_events` — transactional outbox for `ORDER_CREATED`

See [orders.md](orders.md) and [commerce-invariants.md](commerce-invariants.md).

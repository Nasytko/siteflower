# Catalog domain

## Product vs ERP

A **Product** is a commercial storefront offering. It is **not** ERP inventory.

Storefront commercial availability is independent from ERP physical stock. Products may remain orderable when ERP stock is insufficient. This phase does not query ERP and does not store ERP stock fields on Product.

## Lifecycle

| State | Meaning |
| --- | --- |
| `DRAFT` | Editable; not public; admin preview only |
| `PUBLISHED` | Eligible for storefront when schedule allows |
| `ARCHIVED` | Hidden from normal storefront; retained for history |

One lifecycle field — not boolean flags.

## Commercial availability

Separate from lifecycle: `AVAILABLE` | `TEMPORARILY_UNAVAILABLE` | `PREORDER` | `SEASONAL`.

Checkout enforcement comes in a later phase; catalog stores and exposes the value.

## Variants & pricing

Prices live on **ProductVariant** as integer minor units (`price_minor` BIGINT) + product `currency` (default `BYN`).

Display price is **derived** from active variants:

- single price when all active prices equal
- otherwise `от {min}` (`PriceRangeDto`)

Never denormalize a stale `product.price`.

## Composition

`ProductComponent` references optional `Flower` taxonomy + `displayName`, nullable `quantity`, `unit`.

## Taxonomies

Managed entities (slug, name, sortOrder, visibility VISIBLE|HIDDEN, SEO fields, version):

Flowers, Categories (flat M2M), Occasions, Recipients, Styles, Colors.

## Collections

- **MANUAL** — explicit `CollectionProduct` ordering
- **RULE_BASED** — structured JSON rules (category/occasion/…/price/availability); validated server-side; no arbitrary SQL

## Public vs admin API

- Admin: `/api/v1/admin/catalog/...` (RBAC)
- Public: `/api/v1/catalog/...` — only **effectively published** products

Effective publication: `lifecycle=PUBLISHED` AND schedule window includes now.

## Optimistic concurrency

`version` integer on Product / Collection / taxonomies. Updates send `expectedVersion`; mismatch → HTTP 409.

## Cache readiness (future)

Invalidate storefront cache on: `PRODUCT_PUBLISHED`, `PRODUCT_UPDATED`, `COLLECTION_UPDATED`. No Redis in this phase.

## Future storefront URLs

| Path | Entity |
| --- | --- |
| `/bukety`, `/bukety/[slug]` | categories / products |
| `/cvety/[slug]` | flowers |
| `/povod/[slug]` | occasions |
| `/komu/[slug]` | recipients |
| `/collections/[slug]` | collections |

Filter query URLs are **not** SEO landing pages.

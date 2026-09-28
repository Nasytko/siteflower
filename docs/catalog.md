# Catalog domain

> **Current model:** florist-first dimensions (budget, occasion, recipient, color, flower, size) plus promotions and bestsellers. Full product direction and migration notes: [catalog-simplification-and-merchandising.md](./catalog-simplification-and-merchandising.md).

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

Display price is **derived** from active variants (after any effective promotion):

- single price when all active effective prices equal
- otherwise `от {min}` (`PriceRangeDto`)

Never denormalize a stale `product.price`. Checkout uses `effectiveVariantPriceMinor` — never browser math. See [commerce-invariants.md](./commerce-invariants.md).

## Composition

`ProductComponent` references optional `Flower` taxonomy + `displayName`, nullable `quantity`, `unit`. Linking a flower on a component makes the bouquet discoverable under that flower filter (no separate `ProductFlower` table).

## Taxonomies & merchandising dimensions

Managed taxonomy entities (slug, name, sortOrder, visibility `VISIBLE`|`HIDDEN`, SEO fields, version):

| Entity | Role |
| --- | --- |
| Flowers | Composition + flower filter facet |
| Occasions | «Повод» |
| Recipients | «Кому» |
| Colors | Merchandising colors (optional `swatch`) |

Additional catalog config (not generic CMS taxonomies):

| Entity | Role |
| --- | --- |
| **BouquetSize** | Customer-facing size; optional FK on product |
| **BudgetRange** | Admin-managed min/max minor BYN filter labels |
| **ProductPromotion** | Sale (`PERCENT` or `FIXED`) with optional schedule |
| **BestsellerGroup** | Manual homepage tabs + product membership |

`heightCm` remains an optional factual attribute on the product; it is **not** a customer filter.

## Removed (not current product)

Category, Style, Collection (manual + rule-based), and product `featured` were removed end-to-end. Historical phase reports may still mention them; do not treat those as the live model.

## Public vs admin API

- Admin: `/api/v1/admin/catalog/...` (RBAC); also promotions, bestsellers, budget ranges
- Public: `/api/v1/catalog/...` — only **effectively published** products

Effective publication: `lifecycle=PUBLISHED` AND schedule window includes now.

## Optimistic concurrency

`version` integer on Product / taxonomies / promotions / bestseller groups / budget ranges. Updates send `expectedVersion`; mismatch → HTTP 409.

## Cache readiness (future)

Invalidate storefront cache on product publish/update and merchandising changes (promotions, bestsellers, homepage). No Redis in this phase.

## Storefront URLs

| Path | Entity |
| --- | --- |
| `/bukety`, `/bukety/[slug]` | Catalog listing / products |
| `/akcii` | Effective promotions |
| `/cvety`, `/cvety/[slug]` | Flowers hub / landing |
| `/povod`, `/povod/[slug]` | Occasions hub / landing |
| `/komu/[slug]` | Recipients |

Filter query URLs on `/bukety` are **not** SEO landing pages (canonical to `/bukety`, typically noindex). Legacy `/collections/*` permanently redirects away.

# Catalog domain

> **Current model:** sellable **Product** (+ in-card **ProductVariant**), optional **ProductFamily** (cross-product UX only), hierarchical **CatalogCategory**, flower dictionary (**FlowerType** → **FlowerVariety** → **FlowerItem** with origin/height), composition via **ProductComponent** → FlowerItem + quantity, plus discovery facets (budget, occasion, recipient, color, legacy composition Flower, size), promotions and bestsellers.

## Product vs Variant vs Family

| Concept | Role |
| --- | --- |
| **Product** | Independent sellable storefront card (own URL, media, price, SEO, lifecycle, availability). |
| **ProductVariant** | Choice *inside* one card (e.g. 9 / 15 / 21 roses). Unchanged; used by cart/checkout. |
| **ProductFamily** | Soft link between several Products the shopper sees as related options (e.g. Mondial 50 cm vs 60 cm). Not purchasable, no price/stock/lifecycle/media/sitemap. |

Switching a family member on the PDP navigates to that Product’s URL. Family never enters the cart.

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

Canonical field: `Product.availability`. Not warehouse stock and not lifecycle.

- Storefront listing can show non-`AVAILABLE` published products; purchase is blocked only for `TEMPORARILY_UNAVAILABLE` (cart/checkout validation).
- Admin Products Manager supports quick change via `PATCH /api/v1/admin/catalog/products/:id` (`CATALOG_UPDATE`, OCC `expectedVersion`) without opening the editor.
- Audit: `PRODUCT_UPDATED` with `previousAvailability` / `newAvailability` when the field changes.
- Bulk V1 (`POST /api/v1/admin/catalog/products/bulk`, max 50 items on the **current page** selection): `PUBLISH` / `UNPUBLISH` (`CATALOG_PUBLISH`) and `SET_AVAILABILITY` (`CATALOG_UPDATE`). Per-item OCC + partial success; reuses single-item domain methods.

## Variants & pricing

Prices live on **ProductVariant** as integer minor units (`price_minor` BIGINT) + product `currency` (default `BYN`).

Display price is **derived** from active variants (after any effective promotion):

- single price when all active effective prices equal
- otherwise `от {min}` (`PriceRangeDto`)

Never denormalize a stale `product.price`. Checkout uses `effectiveVariantPriceMinor` — never browser math. See [commerce-invariants.md](./commerce-invariants.md).

## Composition

`ProductComponent` holds quantity/unit and preferably references a reusable **FlowerItem** (concrete stem/SKU). Quantity is never stored on FlowerItem — one FlowerItem can appear in hundreds of products with different quantities.

Legacy optional `flowerId` → old `Flower` taxonomy still feeds `/cvety` discovery when set. Prefer `flowerItemId` for new work.

Duplicate product copies component rows but **reuses** the same FlowerItem / Flower references (no dictionary cloning).

Composition stays **product-level** (not per ProductVariant) so cart/checkout remain unchanged. Cross-height/origin “variants” continue as separate Products in a ProductFamily.

## Catalog navigation (CatalogCategory)

Hierarchical tree for storefront menus and PLPs (Цветы → Розы, Букеты → …). Separate from discovery taxonomies.

- Optional `listingKind`: `FLOWERS` | `BOUQUETS` | `COMPOSITIONS` | `GIFTS` | `OTHER` (UI hint for filters).
- Product.catalogCategoryId is nullable (legacy products stay valid until assigned).
- Public list filters by `categorySlug` expand to the category **and its descendants**.

## Flower dictionary

Do **not** confuse with legacy composition `Flower` taxonomy (`/cvety` SEO facet).

| Entity | Example | Role |
| --- | --- | --- |
| **FlowerType** | Роза | Dictionary level 1 |
| **FlowerVariety** | Мондиаль | Dictionary level 2 under type |
| **FlowerOrigin** | Эквадор | Shared origin dictionary |
| **FlowerItem** | Роза Мондиаль · Эквадор · 60 см | Concrete reusable stem/SKU |
| **Product.heightCm** | 60 | Bouquet/card height (ruler / legacy bands) |

Storefront filters for type / variety / origin / height match **either** composition → FlowerItem **or** legacy denormalized `Product.flowerTypeId` / `flowerVarietyId` / `flowerOriginId` / `heightCm` (kept for migration; deprecated as source of truth).

Used FlowerItems cannot be hard-deleted — archive with `visibility: HIDDEN`. Future ERP mapping should target FlowerItem (prefer a separate mapping table).

No universal attribute builder / PIM.

## Taxonomies & merchandising dimensions

Managed taxonomy entities (slug, name, sortOrder, visibility `VISIBLE`|`HIDDEN`, SEO fields, version):

| Entity | Role |
| --- | --- |
| Flowers | Composition + flower filter facet (not catalog tree) |
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
| **CatalogCategory** | Navigation / PLP hierarchy |
| **ProductFamily** | Cross-product related options |

## Public vs admin API

- Admin: `/api/v1/admin/catalog/...` (RBAC); categories, flower-refs, product-families, promotions, bestsellers, budget ranges
- Public: `/api/v1/catalog/...` — only **effectively published** products; `categories/tree`, flower-types/varieties/origins, product filters (`categorySlug`, `flowerVarietySlug`, `flowerOriginSlug`, `heightBand`, …)

Effective publication: `lifecycle=PUBLISHED` AND schedule window includes now.

## Optimistic concurrency

`version` integer on Product / taxonomies / promotions / bestseller groups / budget ranges. Updates send `expectedVersion`; mismatch → HTTP 409.

## Duplicate product

`POST /api/v1/admin/catalog/products/:id/duplicate` (`CATALOG_CREATE`) creates a new **DRAFT** from an existing product in one DB transaction:

- New product / variant / component IDs; unique slug (`…-kopiya`, then `-2`, …)
- Copies catalog template fields (name + « — копия», descriptions, taxonomies, composition, media links, manual SEO overrides)
- **Reuses** existing `MediaAsset` rows (no S3 copy)
- **Does not** copy promotions, bestseller membership, or publish schedule
- **Does not** create stock / supply / inventory (Product is not ERP inventory)
- Source may be `DRAFT`, `PUBLISHED`, or **`ARCHIVED`** — archive is allowed as a template source; the copy is always `DRAFT`
- Indexability: lifecycle `DRAFT` keeps the copy out of the public catalog and sitemap until explicit publish (independent of `noIndex`)

Audit: `PRODUCT_DUPLICATED` with `sourceProductId` / `slug` (only on successful commit).

## Cache readiness (future)

Invalidate storefront cache on product publish/update and merchandising changes (promotions, bestsellers, homepage). No Redis in this phase.

## Storefront URLs

| Path | Entity |
| --- | --- |
| `/katalog/[slug]` | CatalogCategory PLP (filters via `var`, `color`, `h`, `orig`) |
| `/bukety`, `/bukety/[slug]` | Bouquet listing / **Product PDP** (canonical product URL) |
| `/akcii` | Effective promotions |
| `/cvety`, `/cvety/[slug]` | Composition-flower discovery hub (legacy facet, not CatalogCategory) |
| `/povod`, `/povod/[slug]` | Occasions hub / landing |
| `/komu/[slug]` | Recipients |

Primary nav is driven by `GET /catalog/categories/tree` (not hardcoded React lists). Legacy slug `bukety` keeps `/bukety` href.

Each Product remains its own indexable page. ProductFamily has **no** sitemap entry. Filter query URLs on `/bukety` and `/katalog/*` are typically noindex; canonical points at the clean path.

## Migration notes (catalog structure)

Additive migration `20261004120000_catalog_family_categories`: new tables + nullable Product FKs + seed categories / flower refs. Existing products keep `null` category/family/flower fields — **no** automatic name-based classification.

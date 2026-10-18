# Catalog simplification and merchandising

Product direction for **БУКЕТ №1**: a florist-first catalog, not a generic CMS.

Customers discover bouquets through clear dimensions plus merchandising surfaces. Obsolete generic catalog concepts were removed end-to-end (schema, API, Admin, storefront, seed, tests).

## Final domain model

| Concept | Role | Source of truth |
|---|---|---|
| **BudgetRange** | Customer budget filter labels + min/max minor BYN | Admin-managed table `budget_ranges` |
| **Occasion** | «Повод» | Taxonomy + `product_occasions` |
| **Recipient** | «Кому» | Taxonomy + `product_recipients` |
| **Color** | Merchandising colors (optional swatch) | Taxonomy + `product_colors` |
| **FlowerType / FlowerItem** | Stem dictionary + composition | `flower_types`, `flower_items`, `product_components.flower_item_id` |
| **ProductVariant** | In-card size / price choice (e.g. «7 шт», «15 шт») | `product_variants` |
| **ProductPromotion** | Sale (PERCENT or FIXED) with schedule | `product_promotions` (+ variant fixed prices) |
| **BestsellerGroup** | Manual homepage tabs | `bestseller_groups` + `bestseller_group_products` |

### Deliberate choices

- **Customer-facing “size” is a ProductVariant name**, not a separate BouquetSize entity. Managers add variants (9 / 15 / 21 stems, «Стандарт», etc.) with their own prices.
- **Flower discovery uses the flower dictionary.** `ProductComponent` → **FlowerItem**; public filters and `/cvety` landings use **FlowerType** (via composition), not a legacy composition-Flower table.
- **`bouquetHeightCm` on Product** is optional factual bouquet height (ruler); stem length stays on **FlowerItem**.
- **Budget is not a taxonomy.** Ranges are configuration rows; matching uses active variant prices (server-side).
- **Promotions:** product-level `PERCENT` applies to all active variants; `FIXED` sale prices are per-variant. Exactly one mode. Effective state is evaluated at read/checkout time (Europe/Minsk-aware timestamps stored as timestamptz).
- **Bestsellers are manual.** No rule engine.

## Removed concepts

Fully removed from production code and schema (historical migrations retained):

- `Category` / `ProductCategory`
- `Style` / `ProductStyle`
- `Collection` / `CollectionProduct` / `CollectionType`
- RULE_BASED collection engine / preview rules
- Product `featured` flag (migrated into default bestseller group «Все»)
- Legacy composition **`Flower`**, **`BouquetSize`**, **`ProductLine`**
- Admin **composition-setup** / `needsCompositionMigration` migration tooling
- `SlugEntityType` values: `CATEGORY`, `STYLE`, `COLLECTION` (replaced enum; obsolete redirects deleted)
- Audit actions `COLLECTION_CREATED` / `COLLECTION_UPDATED`
- Public `/collections/*` pages and Admin Collections UI
- Category / Style Admin and filters

Legacy URLs: `/collections` and `/collections/:slug` permanently redirect (see `apps/web/next.config.ts`). `?featured=` query is stripped toward the catalog.

## Filter semantics

Primary catalog: `/bukety`.

| Dimension | URL param | Multi | Match |
|---|---|---|---|
| Бюджет | `budget` (BudgetRange **id**) | yes | OR within; product matches if any active variant price falls in range |
| Повод | `occasion` (slug) | yes | OR within |
| Кому | `recipient` (slug) | yes | OR within |
| Цвет | `color` (slug) | yes | OR within |
| Вид цветка | `flowerType` (FlowerType slug) | yes | OR within (via `ProductComponent` → FlowerItem) |
| Сортировка | `sort` | — | `recommended` \| `price_asc` \| `price_desc` \| `newest` |

**Across dimensions: AND. Within a dimension: OR.**

`recommended` is Admin merchandising / deterministic ordering — not a fake «popularity» metric.

Filtered query URLs remain noindex / canonical to the catalog where SEO rules already require it.

## Promotions

- Admin enables promotion on a product: type `PERCENT` (1–99) or `FIXED` (per-variant sale prices).
- Optional `startsAt` / `endsAt`.
- API returns `promotion` on list/detail with original + sale price ranges and display `percentOff`.
- Checkout / cart validation uses `effectiveVariantPriceMinor` — never browser math.
- `OrderItem` stores final `unitPriceMinor`, plus optional `originalUnitPriceMinor` and `promotionType` snapshot.
- Public destination: `/akcii` (effective promotions only).

## Bestsellers

- Admin page «Бестселлеры»: groups (tabs), product membership, reorder.
- Public `GET /catalog/bestsellers` returns active groups with currently public products only.
- Homepage section kind: `bestsellers`.

## Homepage

Fixed layout with configurable content. Section kinds:

`bestsellers` | `promotions` | `occasions` | `recipients` | `discovery` | `help` | `delivery`

Legacy stored kinds `featured` / `collection` are migrated to `bestsellers` / `promotions` on load.

## Admin navigation

- Работа → Заказы
- Каталог → Товары, Справочники (вкладки), Цветы (FlowerItem), Акции, Бестселлеры
- Витрина → Instagram, Настройки магазина (+ бюджетные диапазоны), Получение и доставка, Юридическая информация
- Система → ERP, Пользователи, Аудит, Медиа / Site Health

Homepage block editor is not part of admin UI (layout fixed / seeded).

## Migration notes (`20260926120000_catalog_simplification`)

**Created:** `budget_ranges`, `product_promotions`, `product_promotion_variant_prices`, `bestseller_groups`, `bestseller_group_products`; enum `PromotionType`.

**Altered:** `colors.swatch`; `order_items.original_unit_price_minor`, `promotion_type`; drop `products.featured`.

**Dropped:** `collection_products`, `collections`, `product_categories`, `product_styles`, `categories`, `styles`; enum `CollectionType`.

Later migrations removed `bouquet_sizes`, legacy `flowers`, `product_lines`, product-level flower FKs, and composition-setup fields — composition is **FlowerItem-only**.

**Enums rebuilt:** `SlugEntityType`, `AuditAction` (safe recreate; collection audit rows remapped).

**Data migrated:** featured products → bestseller group `vse`; default budget ranges seeded.

**Discarded:** category/style/collection membership and rules (no longer part of the product).

## Related docs

Update reading order: [catalog.md](./catalog.md), [database.md](./database.md), [storefront.md](./storefront.md), [admin-cms.md](./admin-cms.md), [seo.md](./seo.md), [commerce-invariants.md](./commerce-invariants.md).

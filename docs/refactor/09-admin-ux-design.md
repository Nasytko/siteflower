# Task 01 — Admin UX design (catalog)

**Status:** design for review — **not implemented**  
**Aligns with:** [06](./06-target-architecture.md) D1/D6 · [08](./08-catalog-seo-design.md) S1/S4 · [10](./10-implementation-roadmap.md) B3/B6/C4  
**Nav SoT today:** `apps/web/src/components/admin/admin-shell-nav-data.ts`

---

## Goal

| Job | Place |
| --- | --- |
| Sellable goods | Товары `/admin/catalog/products` |
| Stem dictionary | Цветы `/admin/catalog/flower-structure` |
| Hubs + thematic SEO/merch | Страницы каталога `/admin/catalog/pages` |
| Discounts / shelves | Акции / Подборки |
| Homepage / menu | Сайт |

---

## Decision U1 — Single nav story for pages/SEO

**Rationale:** Landings and categories routes already redirect; writable dual CMS must not return.

**Chosen:** sole page editor = catalog pages; remove stubs after cutover; SEO health links to pages/products only.

**Alternatives:** restore landings CRUD nav — rejected.

**Files:** `admin-shell-nav-data.ts`; `seo/landings/page.tsx`; `catalog/categories/page.tsx`; `seo/page.tsx`.

**Acceptance:** sidebar never offers a writable landings surface after B3; copy says «страница каталога».

---

## Decision U2 — Product editor: hybrid composition UX

**Rationale:** [06](./06) D1–D2; precision state exists in `product-editor.tsx` but managers lack a clear APPROXIMATE/DESCRIPTIVE control (server often defaults empty→EXACT).

**Chosen:** explicit precision control (RU labels); kind read-only via contracts `deriveCompositionKind`; palette separate; AUTHORIAL trait checkbox; Family link explicit; no diameter.

**Alternatives:** infer precision from qty — rejected; editable kind — rejected.

**Files:** `product-editor.tsx`, composition tab, related/placement panels; contracts helpers.

**Acceptance:** manager can set APPROXIMATE/DESCRIPTIVE; kind preview uses same function as API; suggest-palette never silent-overwrites; duplicate does not auto-join Family.

---

## Decision U3 — Pages manager: SEO + merch + filters

**Rationale:** one desk for rules, pins, excludes, SEO fields; filters must live here (R26).

**Chosen:** keep `catalog-pages-manager.tsx`; embed `CategoryFiltersEditor` (or equivalent) for selected page; server preview only for match.

**Alternatives:** second categories manager — rejected.

**Files:** `catalog-pages-manager.tsx`; `category-filters-editor.tsx`; retire orphan mount in `catalog-categories-manager.tsx` after move.

**Acceptance:** facets toggled from pages UI; no UI writes `SeoLandingPage`; authorial shortcut still maps to `traitKeys`.

---

## Decision U4 — Flower dictionary stays hierarchical

**Rationale:** composition requires FlowerItem identity.

**Files:** `flower-structure-manager.tsx`; `/admin/catalog/[kind]` taxonomies.

**Acceptance:** composition lines require FlowerItem; dictionary color does not rewrite bouquet `ProductColor` silently.

---

## Decision U5 — No forked business rules in React

**Rationale:** [06](./06) D7.

**Chosen:** import `@bouquet-one/contracts` for pure helpers; match/preview via API; consolidate rule blurb with API helper when doing B5.

**Acceptance:** no duplicated `deriveCompositionKind` implementation; after cutover no component calls `seoLandings*` endpoints.

---

## File matrix

| Path | Action |
| --- | --- |
| `admin-shell-nav-data.ts` | Keep; drop landings from active matching when stub gone |
| `catalog-pages-manager.tsx` | Keep; embed filters; RU copy |
| `category-filters-editor.tsx` | Keep logic; remount under pages |
| `catalog-categories-manager.tsx` | Remove or demote after B6 |
| Product editor composition | Add precision UI |
| `product-placement-panel.tsx` | Links to pages only |
| `seo/landings`, `catalog/categories` pages | Remove stubs after B3/B6 |
| `admin-endpoints.ts` `seoLandings*` | Remove when unused |
| `flower-type-landing.tsx` | Remove (storefront dead) |

---

## Permissions

Reuse `CATALOG_READ` / `CATALOG_WRITE`. Do not add `SEO_LANDING_*`.

**Acceptance:** no separate landings role after cutover.

# Task 01 — Target architecture (catalog)

**Status:** design for architectural review — **not implemented**  
**Inputs:** Task 00 ([00](./00-baseline.md)–[05](./05-proposed-changes.md)), live Prisma/contracts/API/web  
**Constraints:** no business-code, schema, or migration edits in this task; no DB integration runs (R21); no VPS  

Downstream detail: [07](./07-prisma-design.md) · [08](./08-catalog-seo-design.md) · [09](./09-admin-ux-design.md) · [10](./10-implementation-roadmap.md)

---

## Shared architecture contract

One model for all Task 01 docs:

| Concern | Target SoT |
| --- | --- |
| Sellable goods | `Product` + `ProductVariant` |
| Composition lines | `ProductComponent` → `FlowerItem` |
| Kind | Cached `compositionKind` derived in contracts on save |
| Precision | `EXACT` \| `APPROXIMATE` \| **`DESCRIPTIVE`** (add) \| `UNKNOWN` (unset) |
| Bouquet color filters | `ProductColor` only |
| Pages / SEO / page filters | `CatalogCategory` + pins/excludes + filter attachments |
| Cross-PDP link | `ProductFamily` (keep) |
| Non-derivable flags | `ProductTrait` / AUTHORIAL (keep) |
| Legacy SEO tables | `SeoLandingPage*` — sequential retire, then DROP |
| Admin | One editor per concern ([09](./09-admin-ux-design.md)) |
| Cutover | Sequential — no dual public primary ([10](./10-implementation-roadmap.md)) |

---

## Principles

| ID | Principle |
| --- | --- |
| P1 | One product model |
| P2 | Hybrid composition (precision modes) |
| P3 | Auto MONO/MIXED/UNKNOWN only from reliable PRIMARY types |
| P4 | Palette independent of composition |
| P5 | Single page/SEO/filter spine = CatalogCategory |
| P6 | Manual pins/excludes (+ separate promotions/bestsellers) |
| P7 | Keep Family/Traits only with proven jobs |
| P8 | Simple admin — no duplicate settings |
| P9 | Rules live in contracts (+ API persist); web does not fork policy |
| P10 | No parallel competing public implementations |

---

## Decision D1 — Hybrid bouquet composition

**Rationale:** Florist catalog needs exact recipes (filters), flexible recipes, and storytelling lines without trustworthy counts — without a second product entity.

**Chosen:** lines via `ProductComponent`/`FlowerItem`; manager sets precision; kind auto-derived.

**Today:** enum is `EXACT|APPROXIMATE|UNKNOWN` only (`schema.prisma`, contracts).

**Alternatives:** (A) add `DESCRIPTIVE`, UNKNOWN=unset — **chosen**; (B) overload UNKNOWN as descriptive — rejected; (C) free-text only — rejected; (D) separate recipe table — rejected (breaks P1).

**Files:** `packages/contracts/src/catalog.ts`; `apps/api/src/catalog/products.service.ts` (`normalizeCompositionComponents`); `products.repository.ts`; `apps/web/.../product-editor.tsx`; `packages/database/prisma/schema.prisma` (later).

**Acceptance:** EXACT requires PRIMARY qty≥1; DESCRIPTIVE/APPROXIMATE never unlock qty filters; greenery ignored for kind; admin cannot set kind manually; non-BOUQUET/COMPOSITION kinds store kind UNKNOWN.

---

## Decision D2 — Automatic MONO / MIXED / UNKNOWN

**Rationale:** Merchandising (e.g. mono-bouquets) must match composition truth; manual kind creates dual truth.

**Chosen:** `deriveCompositionKind` on PRIMARY flower types; `resolveStoredCompositionKind` gates by `productKind`. Persist on save.

**Alternatives:** classify by variety/color — rejected; admin override — rejected; derive-only at read (no column) — rejected (filter index needs cache).

**Files:** `packages/contracts/src/catalog.ts` (+ tests); save path in `products.service.ts`; filters/rules consumers in repository / page rules.

**Acceptance:** save recomputes kind; STEM/GIFT never persist MONO; thematic mono filters align with derivation.

---

## Decision D3 — Catalog listing, filters, pins

**Rationale:** One listing engine for hubs, thematic rules, gift subtypes, and facets.

**Chosen:** `resolveCategoryListingScope` + `resolveCatalogPageRules` + `CatalogMatchService` + listing util; facets via filter definitions; palette facet = `ProductColor`; excludes via `CatalogPageExclude`; **pins must merge on public PLP** (parity with admin preview) — gap R25.

**Alternatives:** SeoLanding as public list engine — rejected (P10); pins admin-only — rejected.

**Files:** `packages/contracts/src/catalog.ts`, `catalog-page-rules.ts`; `catalog-match.service.ts`; `catalog-listing.util.ts`; `public-catalog.service.ts`; `catalog-pages.service.ts` (preview reference); `catalog-filters.service.ts`; storefront `catalog/**`.

**Acceptance:** public thematic list = pins first → rule matches − excludes; hubs filter by productKind; qty facets EXACT-only; storefront does not need `/seo-landings/*`.

---

## Decision D4 — SEO on CatalogCategory only (sequential)

**Rationale:** Dual SeoLanding + Category causes sitemap orphans and dual writes (R01/R03/R05).

**Chosen:** write already on Category; next stop public dual-read/sitemap merge; then remove admin write + web helpers; later VPS proof + DROP.

**Alternatives:** eternal dual-read — rejected; big-bang DROP+code — rejected; new SeoPage table — rejected.

**Files / detail:** [08](./08-catalog-seo-design.md).

**Acceptance:** sitemap thematic URLs from published categories only; admin edits only `/admin/catalog/pages`; legacy `/p` redirect retained until traffic proof.

---

## Decision D5 — Keep ProductFamily and AUTHORIAL traits

**Rationale:** PDP switcher and thematic “authorial” rules are live and not replaceable by variants/categories without loss.

**Alternatives:** drop Family for ad-hoc links — rejected; encode AUTHORIAL as category-only — rejected (duplicates page model).

**Files:** `ProductFamily*`; `product-family-switcher.tsx`; `product-families.service.ts`; `ProductTrait*`; `catalog-pages-manager.tsx` authorial shortcut.

**Acceptance:** Family not used as category/SEO; no TraitDefinition full CMS required in v1.

---

## Decision D6 — Simple admin

**Rationale:** Managers already redirected from landings/categories stubs; remaining orphans (filters UI, precision control) must join the pages/product editors.

**Detail:** [09](./09-admin-ux-design.md).

**Acceptance:** one writable page CMS; precision editable; filters reachable from pages manager (R26/B6).

---

## Decision D7 — Rule ownership

**Rationale:** Duplicated match/kind/price logic across layers causes silent drift.

**Chosen:** contracts (+ API) own semantics; web may import pure helpers; consolidate human rule summaries when touching B5.

**Forbidden:** re-implement match SQL in React; revive `getSeoLanding` after cutover.

---

## Open questions

1. Approve `DESCRIPTIVE` + UNKNOWN=unset?  
2. Public pin order = admin preview (pins first)? **Propose yes.**  
3. SeoLanding DROP timing after code cutover?  
4. Migrate `pageKind=LEGACY` before B1 or allow read-only linger?

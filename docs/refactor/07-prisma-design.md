# Task 01 — Prisma / data design (catalog)

**Status:** design only — **do not apply migrations in this task**  
**Schema today:** `packages/database/prisma/schema.prisma`  
**Aligns with:** [06](./06-target-architecture.md) shared contract  

---

## Decision P1 — Keep core commerce & composition tables

**Rationale:** Existing `Product` / `ProductVariant` / `ProductComponent` / `FlowerItem` (+ flower dictionary) already implement P1–P2.

**Alternatives:** new listing-product table / free-text composition — rejected.

**Files:** `schema.prisma` models above; API `products.*`, `flower-item.util.ts`.

**Acceptance:** no second sellable product model introduced in Task 01 design.

---

## Decision P2 — Extend `CompositionPrecision` with `DESCRIPTIVE`

**Rationale:** see [06](./06-target-architecture.md) D1 — UNKNOWN must not mean both “unset” and “descriptive”.

**Chosen target enum:** `EXACT | APPROXIMATE | DESCRIPTIVE | UNKNOWN`

| Value | Meaning | Qty filters |
| --- | --- | --- |
| EXACT | Fixed recipe | Yes |
| APPROXIMATE | Flexible | No |
| DESCRIPTIVE | Storytelling lines | No |
| UNKNOWN | Unset / incomplete | No |

**Alternatives:** overload UNKNOWN — rejected; nullable precision — defer.

**Files (future together):** `schema.prisma`; new forward migration; `packages/contracts/src/catalog.ts` (+ tests); `products.service.ts`, `products.repository.ts`, DTOs; admin product editor.

**Acceptance:** expand-only migration; contracts match Prisma; repository qty filters remain EXACT-only; backfill policy documented (owner chooses leave-UNKNOWN vs PUBLISHED→DESCRIPTIVE).

---

## Decision P3 — Keep `CompositionKind` cache

**Rationale:** listing/thematic filters need indexed MONO/MIXED.

**Alternatives:** compute only at read — rejected for now.

**Files:** `Product.compositionKind`; derivation in contracts; write in `products.service.ts`.

**Acceptance:** values remain `MONO|MIXED|UNKNOWN`; no admin-writable column semantics.

---

## Decision P4 — Three color channels unchanged structurally

**Rationale:** dictionary (`FlowerItem.colorId`), line snapshot (`ProductComponent.colorId`), bouquet palette (`ProductColor`) serve different jobs ([06](./06) P4).

**Alternatives:** single channel — rejected.

**Files:** models in `schema.prisma`; repository color filters; admin palette vs composition UI.

**Acceptance:** PLP bouquet color facet uses `ProductColor`; component filters may OR line + flowerItem color as today.

---

## Decision P5 — CatalogCategory spine is the only page model

**Rationale:** [06](./06) D4 / [08](./08).

**Keep tables:** `catalog_categories`, `catalog_page_products`, `catalog_page_excludes`, `catalog_filter_definitions`, `catalog_category_filters`.

**pageKind:** SYSTEM_HUB / THEMATIC / GIFT_SUBTYPE; LEGACY = transitional data only.

**Alternatives:** new SeoPage table — rejected.

**Acceptance:** no new SEO page Prisma model in the design.

---

## Decision P6 — Keep Family & Traits tables

**Rationale:** [06](./06) D5.

**Files:** `ProductFamily`, `ProductFamilyMember` (`productId` unique); `ProductTraitDefinition`, `ProductTrait`.

**Acceptance:** no family price/media/sitemap; Trait definitions stay seed/migration-managed for v1.

---

## Decision P7 — Retire `SeoLandingPage*` (later DROP)

**Sequence:** keep tables → code cutover ([08](./08) / roadmap B*) → authorized VPS proof → forward DROP → remove models.

**Alternatives:** DROP before cutover — rejected (R01/R23).

**Files:** models ~SeoLanding*; migration new folder only; stop API usage first.

**Acceptance:** grep no runtime `seoLandingPage` after D2; staging migrate + smoke; never rewrite historical unify migration.

---

## Decision P8 — Later remove `Product.diameterCm`

**Rationale:** deprecated; admin UI already dropped.

**Acceptance:** separate mini-proof; scrub DTO/mapper; forward migration.

---

## Migration order (with code — see [10](./10-implementation-roadmap.md))

1. Code stops depending on SeoLanding for public paths.  
2. ADD `DESCRIPTIVE`.  
3. Optional precision backfill.  
4. DROP SeoLanding / diameter after proofs.

**Non-goals:** squash prod history; soft-delete framework rewrite; infer VPS columns from local DB.

# Deferred / contract migrations

Scripts here are **not** applied by `prisma migrate deploy`.

| File | Status | Gate |
|------|--------|------|
| `20261102230000_simplify_product_composition_contract.sql` | **BLOCKED** | Staging inventory + manual `FlowerType.composition_class` + MONO/MIXED equivalence + owner approval |

## Expand (active)

`prisma/migrations/20261102220000_flower_type_composition_class/`

- Adds nullable `flower_types.composition_class` (no backfill).
- Makes `product_components.display_name` nullable so Prisma Client can insert rows without writing legacy columns.

## Temporary compatibility (until CONTRACT)

| Layer | State |
|-------|--------|
| Prisma schema | Target model: `ProductComponent` without role/qty/unit/color/displayName; no `@@unique` yet |
| DB after expand only | Still has legacy columns; `display_name` nullable + `DEFAULT ''`; `role`/`unit` defaults reaffirmed |
| Prisma Client `createMany` | Writes only `productId`, `flowerItemId`, `sortOrder` (+ timestamps). Requires expand (`display_name` DEFAULT/nullable) or INSERT fails on NOT NULL. Omit → `display_name=''` (rollback-safe for old Prisma `String`) |
| Runtime classification | **Only** `FlowerType.compositionClass` via `deriveCompositionKind` / `recomputeCompositionKindForFlowerTypes`. Never reads `ComponentRole` |
| `Product.compositionKind` cache | Updated on product composition save **and** when FlowerType.compositionClass changes (or variety move between types) |

## Order (do not skip)

1. **EXPAND** — apply `20261102220000_flower_type_composition_class` (additive).
2. **CLASSIFY** — managers set `FlowerType.composition_class` (null stays UNKNOWN; never auto-BLOOM).
3. **VALIDATE** — staging inventory SQL + MONO/MIXED page equivalence sample.
4. **CONTRACT** — only after owner approval; promote deferred SQL into `prisma/migrations`.

**Removal task:** promote contract SQL into `prisma/migrations` after gates; then delete this deferred entry.

**Out of scope here (Task 02):** manual `ProductColor` palette (`suggestVisualPaletteColorIds` already removed from contracts).

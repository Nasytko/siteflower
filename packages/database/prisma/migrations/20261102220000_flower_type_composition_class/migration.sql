-- EXPAND ONLY: FlowerType.composition_class for MONO/MIXED dictionary classification.
-- No backfill of existing types (null = unclassified).
-- No DROP of ProductComponent role/qty/precision — that is CONTRACT (deferred).
-- DB validation: BLOCKED until applied on a real PostgreSQL instance.
--
-- ProductComponent write-compat (new Prisma Client omits legacy columns):
--   display_name  — was NOT NULL without DEFAULT → INSERT omit would fail.
--                   SET DEFAULT '' so omit inserts '' (rollback-safe for old
--                   Prisma String reads); DROP NOT NULL for extra headroom.
--   quantity      — already nullable (catalog_domain); omit → NULL.
--   unit          — NOT NULL DEFAULT 'UNSPECIFIED' (reaffirmed below).
--   role          — NOT NULL DEFAULT 'PRIMARY' (reaffirmed below).
--   color_id      — already nullable FK; omit → NULL.
-- Products legacy columns kept until CONTRACT still have DB defaults:
--   composition_precision DEFAULT 'UNKNOWN', composition_primary_complete DEFAULT false.

-- FlowerTypeCompositionClass: BLOOM | DECORATIVE; column nullable = unclassified.
CREATE TYPE "FlowerTypeCompositionClass" AS ENUM ('BLOOM', 'DECORATIVE');

ALTER TABLE "flower_types"
  ADD COLUMN "composition_class" "FlowerTypeCompositionClass";

-- Soften legacy composition columns so new Client can stop writing them before CONTRACT DROP.
-- Does not delete data or drop columns.
ALTER TABLE "product_components"
  ALTER COLUMN "display_name" SET DEFAULT '',
  ALTER COLUMN "display_name" DROP NOT NULL,
  ALTER COLUMN "unit" SET DEFAULT 'UNSPECIFIED',
  ALTER COLUMN "role" SET DEFAULT 'PRIMARY';

COMMENT ON COLUMN "flower_types"."composition_class" IS
  'BLOOM | DECORATIVE | NULL(unclassified). NULL forces product composition_kind UNKNOWN. No auto-backfill.';

COMMENT ON COLUMN "product_components"."display_name" IS
  'Legacy label. Expand: nullable + DEFAULT ''''. New app omits it; old app rollback still reads a string.';

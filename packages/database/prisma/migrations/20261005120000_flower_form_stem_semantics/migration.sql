-- FlowerForm (contextual under FlowerType) + FlowerItem.flower_form_id
-- Rename semantics: flower_items.height_cm remains stem length; products.height_cm remains bouquet height.
-- Rebuild FlowerItem.identity_key to include form segment.

CREATE TABLE "flower_forms" (
    "id" UUID NOT NULL,
    "flower_type_id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "visibility" "TaxonomyVisibility" NOT NULL DEFAULT 'VISIBLE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "flower_forms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "flower_forms_flower_type_id_slug_key" ON "flower_forms"("flower_type_id", "slug");
CREATE INDEX "flower_forms_flower_type_id_sort_order_idx" ON "flower_forms"("flower_type_id", "sort_order");
CREATE INDEX "flower_forms_visibility_sort_order_idx" ON "flower_forms"("visibility", "sort_order");

ALTER TABLE "flower_forms"
  ADD CONSTRAINT "flower_forms_flower_type_id_fkey"
  FOREIGN KEY ("flower_type_id") REFERENCES "flower_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "flower_items"
  ADD COLUMN "flower_form_id" UUID;

CREATE INDEX "flower_items_flower_form_id_idx" ON "flower_items"("flower_form_id");

ALTER TABLE "flower_items"
  ADD CONSTRAINT "flower_items_flower_form_id_fkey"
  FOREIGN KEY ("flower_form_id") REFERENCES "flower_forms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- identity_key was: type|variety|origin|height
-- now:           type|form|variety|origin|height
UPDATE "flower_items"
SET "identity_key" =
  "flower_type_id"
  || '|' || COALESCE("flower_form_id"::text, '_')
  || '|' || COALESCE("flower_variety_id"::text, '_')
  || '|' || COALESCE("flower_origin_id"::text, '_')
  || '|' || CASE WHEN "height_cm" IS NULL THEN '_' ELSE "height_cm"::text END,
  "updated_at" = CURRENT_TIMESTAMP;

-- Seed common rose forms when a Роза type exists (idempotent by slug).
INSERT INTO "flower_forms" ("id", "flower_type_id", "slug", "name", "sort_order", "visibility", "version", "created_at", "updated_at")
SELECT gen_random_uuid(), t.id, v.slug, v.name, v.sort_order, 'VISIBLE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "flower_types" t
CROSS JOIN (
  VALUES
    ('klassicheskaya', 'Классическая', 10),
    ('kustovaya', 'Кустовая', 20),
    ('pionovidnaya', 'Пионовидная', 30),
    ('sadovaya', 'Садовая', 40)
) AS v(slug, name, sort_order)
WHERE lower(t.slug) IN ('roza', 'rozy', 'rosa')
  AND NOT EXISTS (
    SELECT 1 FROM "flower_forms" f WHERE f.flower_type_id = t.id AND f.slug = v.slug
  );

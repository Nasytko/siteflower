-- Personal occasion vs calendar holiday on the shared occasions table.
CREATE TYPE "OccasionKind" AS ENUM ('OCCASION', 'HOLIDAY');

ALTER TABLE "occasions"
  ADD COLUMN "kind" "OccasionKind" NOT NULL DEFAULT 'OCCASION';

-- Known calendar holidays already seeded as occasions → reclassify.
UPDATE "occasions"
SET "kind" = 'HOLIDAY'
WHERE "slug" IN (
  '8-marta',
  '8-marta-den-zhenshchin',
  '14-fevralya',
  'den-svyatogo-valentina',
  'novyy-god',
  'rozhdestvo',
  'den-materi',
  'den-uchitelya',
  '1-sentyabrya',
  'den-znaniy',
  'pasha',
  'halloween',
  'den-zashchitnika',
  '23-fevralya'
);

CREATE INDEX "occasions_kind_visibility_sort_order_idx"
  ON "occasions"("kind", "visibility", "sort_order");

-- Ensure common calendar holidays exist (idempotent upsert by slug).
INSERT INTO "occasions" (
  "id", "slug", "name", "description", "kind", "sort_order", "visibility",
  "version", "seo_title", "seo_description", "no_index", "created_at", "updated_at"
)
VALUES
  (gen_random_uuid(), '8-marta', '8 марта', 'Букеты к Международному женскому дню', 'HOLIDAY', 10, 'VISIBLE', 1, NULL, NULL, false, NOW(), NOW()),
  (gen_random_uuid(), '14-fevralya', '14 февраля', 'Букеты ко Дню святого Валентина', 'HOLIDAY', 20, 'VISIBLE', 1, NULL, NULL, false, NOW(), NOW()),
  (gen_random_uuid(), '23-fevralya', '23 февраля', 'Букеты ко Дню защитника Отечества', 'HOLIDAY', 30, 'VISIBLE', 1, NULL, NULL, false, NOW(), NOW()),
  (gen_random_uuid(), 'novyy-god', 'Новый год', 'Букеты и композиции к Новому году', 'HOLIDAY', 40, 'VISIBLE', 1, NULL, NULL, false, NOW(), NOW()),
  (gen_random_uuid(), 'den-materi', 'День матери', 'Букеты ко Дню матери', 'HOLIDAY', 50, 'VISIBLE', 1, NULL, NULL, false, NOW(), NOW()),
  (gen_random_uuid(), '1-sentyabrya', '1 сентября', 'Букеты ко Дню знаний', 'HOLIDAY', 60, 'VISIBLE', 1, NULL, NULL, false, NOW(), NOW()),
  (gen_random_uuid(), 'den-uchitelya', 'День учителя', 'Букеты ко Дню учителя', 'HOLIDAY', 70, 'VISIBLE', 1, NULL, NULL, false, NOW(), NOW())
ON CONFLICT ("slug") DO UPDATE
SET
  "kind" = 'HOLIDAY',
  "updated_at" = NOW();

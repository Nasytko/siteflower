-- ProductLine taxonomy (formats / lines) + M2M with Product.
-- No SlugEntityType / SEO landings yet.

CREATE TABLE "product_lines" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "visibility" "TaxonomyVisibility" NOT NULL DEFAULT 'VISIBLE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "product_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_lines_slug_key" ON "product_lines"("slug");
CREATE INDEX "product_lines_visibility_sort_order_idx" ON "product_lines"("visibility", "sort_order");

CREATE TABLE "product_product_lines" (
    "product_id" UUID NOT NULL,
    "product_line_id" UUID NOT NULL,
    CONSTRAINT "product_product_lines_pkey" PRIMARY KEY ("product_id","product_line_id")
);

CREATE INDEX "product_product_lines_product_line_id_idx" ON "product_product_lines"("product_line_id");

ALTER TABLE "product_product_lines"
  ADD CONSTRAINT "product_product_lines_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_product_lines"
  ADD CONSTRAINT "product_product_lines_product_line_id_fkey"
  FOREIGN KEY ("product_line_id") REFERENCES "product_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

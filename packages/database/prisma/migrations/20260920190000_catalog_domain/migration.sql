-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_PUBLISHED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_UNPUBLISHED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_ARCHIVED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_VARIANT_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_MEDIA_ADDED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_MEDIA_REMOVED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_MEDIA_REORDERED';
ALTER TYPE "AuditAction" ADD VALUE 'TAXONOMY_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'TAXONOMY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'COLLECTION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'COLLECTION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'SEO_UPDATED';

-- CreateEnum
CREATE TYPE "ProductLifecycle" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "CommercialAvailability" AS ENUM ('AVAILABLE', 'TEMPORARILY_UNAVAILABLE', 'PREORDER', 'SEASONAL');
CREATE TYPE "VariantStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "TaxonomyVisibility" AS ENUM ('VISIBLE', 'HIDDEN');
CREATE TYPE "CollectionType" AS ENUM ('MANUAL', 'RULE_BASED');
CREATE TYPE "ComponentUnit" AS ENUM ('PIECE', 'STEM', 'BUNCH', 'UNSPECIFIED');
CREATE TYPE "SlugEntityType" AS ENUM ('PRODUCT', 'CATEGORY', 'OCCASION', 'RECIPIENT', 'STYLE', 'COLOR', 'FLOWER', 'COLLECTION');
CREATE TYPE "MediaFormat" AS ENUM ('JPEG', 'PNG', 'WEBP', 'AVIF');

-- CreateTable
CREATE TABLE "flowers" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "visibility" "TaxonomyVisibility" NOT NULL DEFAULT 'VISIBLE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "seo_title" VARCHAR(200),
    "seo_description" VARCHAR(500),
    "no_index" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "flowers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "visibility" "TaxonomyVisibility" NOT NULL DEFAULT 'VISIBLE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "seo_title" VARCHAR(200),
    "seo_description" VARCHAR(500),
    "no_index" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "occasions" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "visibility" "TaxonomyVisibility" NOT NULL DEFAULT 'VISIBLE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "seo_title" VARCHAR(200),
    "seo_description" VARCHAR(500),
    "no_index" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "occasions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recipients" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "visibility" "TaxonomyVisibility" NOT NULL DEFAULT 'VISIBLE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "seo_title" VARCHAR(200),
    "seo_description" VARCHAR(500),
    "no_index" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "recipients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "styles" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "visibility" "TaxonomyVisibility" NOT NULL DEFAULT 'VISIBLE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "seo_title" VARCHAR(200),
    "seo_description" VARCHAR(500),
    "no_index" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "styles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "colors" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "visibility" "TaxonomyVisibility" NOT NULL DEFAULT 'VISIBLE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "seo_title" VARCHAR(200),
    "seo_description" VARCHAR(500),
    "no_index" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "colors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "short_description" VARCHAR(500),
    "description" TEXT,
    "lifecycle" "ProductLifecycle" NOT NULL DEFAULT 'DRAFT',
    "availability" "CommercialAvailability" NOT NULL DEFAULT 'AVAILABLE',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "currency" CHAR(3) NOT NULL DEFAULT 'BYN',
    "published_at" TIMESTAMPTZ(3),
    "publish_at" TIMESTAMPTZ(3),
    "unpublish_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "seo_title" VARCHAR(200),
    "seo_description" VARCHAR(500),
    "no_index" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_variants" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "price_minor" BIGINT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "VariantStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_components" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "flower_id" UUID,
    "display_name" VARCHAR(160) NOT NULL,
    "quantity" INTEGER,
    "unit" "ComponentUnit" NOT NULL DEFAULT 'UNSPECIFIED',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "product_components_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_categories" (
    "product_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("product_id","category_id")
);

CREATE TABLE "product_occasions" (
    "product_id" UUID NOT NULL,
    "occasion_id" UUID NOT NULL,
    CONSTRAINT "product_occasions_pkey" PRIMARY KEY ("product_id","occasion_id")
);

CREATE TABLE "product_recipients" (
    "product_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    CONSTRAINT "product_recipients_pkey" PRIMARY KEY ("product_id","recipient_id")
);

CREATE TABLE "product_styles" (
    "product_id" UUID NOT NULL,
    "style_id" UUID NOT NULL,
    CONSTRAINT "product_styles_pkey" PRIMARY KEY ("product_id","style_id")
);

CREATE TABLE "product_colors" (
    "product_id" UUID NOT NULL,
    "color_id" UUID NOT NULL,
    CONSTRAINT "product_colors_pkey" PRIMARY KEY ("product_id","color_id")
);

CREATE TABLE "collections" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(2000),
    "type" "CollectionType" NOT NULL DEFAULT 'MANUAL',
    "rules" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "visibility" "TaxonomyVisibility" NOT NULL DEFAULT 'VISIBLE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "seo_title" VARCHAR(200),
    "seo_description" VARCHAR(500),
    "no_index" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "collection_products" (
    "collection_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "collection_products_pkey" PRIMARY KEY ("collection_id","product_id")
);

CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "storage_key" VARCHAR(512) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "format" "MediaFormat" NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "checksum_sha256" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "media_derivatives" (
    "id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "width" INTEGER NOT NULL,
    "format" "MediaFormat" NOT NULL,
    "storage_key" VARCHAR(512) NOT NULL,
    "byte_size" INTEGER NOT NULL,
    CONSTRAINT "media_derivatives_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_media" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "alt" VARCHAR(300),
    "caption" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_media_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "slug_redirects" (
    "id" UUID NOT NULL,
    "entity_type" "SlugEntityType" NOT NULL,
    "from_slug" VARCHAR(160) NOT NULL,
    "to_slug" VARCHAR(160) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "slug_redirects_pkey" PRIMARY KEY ("id")
);

-- Indexes & uniques
CREATE UNIQUE INDEX "flowers_slug_key" ON "flowers"("slug");
CREATE INDEX "flowers_visibility_sort_order_idx" ON "flowers"("visibility", "sort_order");
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");
CREATE INDEX "categories_visibility_sort_order_idx" ON "categories"("visibility", "sort_order");
CREATE UNIQUE INDEX "occasions_slug_key" ON "occasions"("slug");
CREATE INDEX "occasions_visibility_sort_order_idx" ON "occasions"("visibility", "sort_order");
CREATE UNIQUE INDEX "recipients_slug_key" ON "recipients"("slug");
CREATE INDEX "recipients_visibility_sort_order_idx" ON "recipients"("visibility", "sort_order");
CREATE UNIQUE INDEX "styles_slug_key" ON "styles"("slug");
CREATE INDEX "styles_visibility_sort_order_idx" ON "styles"("visibility", "sort_order");
CREATE UNIQUE INDEX "colors_slug_key" ON "colors"("slug");
CREATE INDEX "colors_visibility_sort_order_idx" ON "colors"("visibility", "sort_order");

CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");
CREATE INDEX "products_lifecycle_publish_at_idx" ON "products"("lifecycle", "publish_at");
CREATE INDEX "products_lifecycle_availability_idx" ON "products"("lifecycle", "availability");
CREATE INDEX "products_featured_idx" ON "products"("featured");
CREATE INDEX "products_updated_at_idx" ON "products"("updated_at" DESC);

CREATE INDEX "product_variants_product_id_sort_order_idx" ON "product_variants"("product_id", "sort_order");
CREATE INDEX "product_variants_product_id_status_idx" ON "product_variants"("product_id", "status");
CREATE INDEX "product_components_product_id_sort_order_idx" ON "product_components"("product_id", "sort_order");
CREATE INDEX "product_categories_category_id_idx" ON "product_categories"("category_id");
CREATE INDEX "product_occasions_occasion_id_idx" ON "product_occasions"("occasion_id");
CREATE INDEX "product_recipients_recipient_id_idx" ON "product_recipients"("recipient_id");
CREATE INDEX "product_styles_style_id_idx" ON "product_styles"("style_id");
CREATE INDEX "product_colors_color_id_idx" ON "product_colors"("color_id");

CREATE UNIQUE INDEX "collections_slug_key" ON "collections"("slug");
CREATE INDEX "collections_visibility_sort_order_idx" ON "collections"("visibility", "sort_order");
CREATE INDEX "collection_products_collection_id_sort_order_idx" ON "collection_products"("collection_id", "sort_order");
CREATE INDEX "collection_products_product_id_idx" ON "collection_products"("product_id");

CREATE UNIQUE INDEX "media_assets_storage_key_key" ON "media_assets"("storage_key");
CREATE UNIQUE INDEX "media_derivatives_storage_key_key" ON "media_derivatives"("storage_key");
CREATE UNIQUE INDEX "media_derivatives_media_asset_id_width_format_key" ON "media_derivatives"("media_asset_id", "width", "format");
CREATE INDEX "media_derivatives_media_asset_id_idx" ON "media_derivatives"("media_asset_id");
CREATE INDEX "product_media_product_id_sort_order_idx" ON "product_media"("product_id", "sort_order");
CREATE INDEX "product_media_media_asset_id_idx" ON "product_media"("media_asset_id");
CREATE UNIQUE INDEX "product_media_one_primary_per_product" ON "product_media"("product_id") WHERE "is_primary" = true;

CREATE UNIQUE INDEX "slug_redirects_entity_type_from_slug_key" ON "slug_redirects"("entity_type", "from_slug");
CREATE INDEX "slug_redirects_entity_type_to_slug_idx" ON "slug_redirects"("entity_type", "to_slug");

-- Checks
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_price_minor_nonnegative" CHECK ("price_minor" >= 0);

-- FKs
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_components" ADD CONSTRAINT "product_components_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_components" ADD CONSTRAINT "product_components_flower_id_fkey" FOREIGN KEY ("flower_id") REFERENCES "flowers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_occasions" ADD CONSTRAINT "product_occasions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_occasions" ADD CONSTRAINT "product_occasions_occasion_id_fkey" FOREIGN KEY ("occasion_id") REFERENCES "occasions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_recipients" ADD CONSTRAINT "product_recipients_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_recipients" ADD CONSTRAINT "product_recipients_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_styles" ADD CONSTRAINT "product_styles_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_styles" ADD CONSTRAINT "product_styles_style_id_fkey" FOREIGN KEY ("style_id") REFERENCES "styles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_colors" ADD CONSTRAINT "product_colors_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_colors" ADD CONSTRAINT "product_colors_color_id_fkey" FOREIGN KEY ("color_id") REFERENCES "colors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_derivatives" ADD CONSTRAINT "media_derivatives_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

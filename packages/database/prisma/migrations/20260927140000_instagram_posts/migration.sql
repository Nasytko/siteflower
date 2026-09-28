-- Curated Instagram posts for the homepage gallery.
CREATE TABLE "instagram_posts" (
    "id" TEXT NOT NULL,
    "image_url" VARCHAR(1000) NOT NULL,
    "post_url" VARCHAR(1000),
    "caption" VARCHAR(500),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "instagram_posts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "instagram_posts_enabled_sort_order_idx" ON "instagram_posts"("enabled", "sort_order");

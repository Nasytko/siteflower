-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'STOREFRONT_SETTINGS_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'HOMEPAGE_CONFIG_UPDATED';

-- CreateTable
CREATE TABLE "storefront_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "brand_name" VARCHAR(120) NOT NULL DEFAULT 'БУКЕТ №1',
    "city" VARCHAR(120) NOT NULL DEFAULT 'Гродно',
    "phone" VARCHAR(40),
    "email" VARCHAR(320),
    "address" VARCHAR(300),
    "working_hours" VARCHAR(500),
    "delivery_summary" VARCHAR(2000),
    "about_summary" VARCHAR(4000),
    "instagram_url" VARCHAR(500),
    "telegram_url" VARCHAR(500),
    "substitution_note" VARCHAR(1000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "storefront_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homepage_config" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "config" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "homepage_config_pkey" PRIMARY KEY ("id")
);

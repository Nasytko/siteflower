-- Phase 4: Orders, fulfillment settings, transactional outbox

-- AlterEnum (AuditAction)
ALTER TYPE "AuditAction" ADD VALUE 'ORDER_STATUS_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'ORDER_CANCELLED';
ALTER TYPE "AuditAction" ADD VALUE 'FULFILLMENT_SETTINGS_UPDATED';

-- CreateEnum
CREATE TYPE "FulfillmentType" AS ENUM ('DELIVERY', 'PICKUP');
CREATE TYPE "OrderStatus" AS ENUM ('RECEIVED', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERING', 'COMPLETED', 'CANCELLED');
CREATE TYPE "OrderEventType" AS ENUM (
  'ORDER_CREATED',
  'ORDER_CONFIRMED',
  'ORDER_PREPARING',
  'ORDER_READY',
  'ORDER_OUT_FOR_DELIVERY',
  'ORDER_COMPLETED',
  'ORDER_CANCELLED'
);

-- CreateTable
CREATE TABLE "fulfillment_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "delivery_enabled" BOOLEAN NOT NULL DEFAULT true,
    "pickup_enabled" BOOLEAN NOT NULL DEFAULT true,
    "delivery_fee_minor" BIGINT NOT NULL DEFAULT 0,
    "min_lead_time_minutes" INTEGER NOT NULL DEFAULT 120,
    "max_advance_days" INTEGER NOT NULL DEFAULT 14,
    "time_windows" JSONB NOT NULL,
    "pickup_instructions" VARCHAR(1000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fulfillment_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fulfillment_settings_delivery_fee_nonneg" CHECK ("delivery_fee_minor" >= 0),
    CONSTRAINT "fulfillment_settings_lead_nonneg" CHECK ("min_lead_time_minutes" >= 0),
    CONSTRAINT "fulfillment_settings_advance_pos" CHECK ("max_advance_days" >= 1)
);

CREATE TABLE "order_number_sequences" (
    "business_date" CHAR(10) NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "order_number_sequences_pkey" PRIMARY KEY ("business_date"),
    CONSTRAINT "order_number_sequences_last_value_nonneg" CHECK ("last_value" >= 0)
);

CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "order_number" VARCHAR(32) NOT NULL,
    "tracking_token_hash" CHAR(64) NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'RECEIVED',
    "fulfillment_type" "FulfillmentType" NOT NULL,
    "purchaser_name" VARCHAR(120) NOT NULL,
    "purchaser_phone_e164" VARCHAR(20) NOT NULL,
    "recipient_name" VARCHAR(120),
    "recipient_phone_e164" VARCHAR(20),
    "surprise" BOOLEAN NOT NULL DEFAULT false,
    "address_known" BOOLEAN NOT NULL DEFAULT true,
    "delivery_address" VARCHAR(500),
    "address_details" VARCHAR(500),
    "fulfillment_date" CHAR(10) NOT NULL,
    "time_window_id" VARCHAR(64) NOT NULL,
    "time_window_label" VARCHAR(120) NOT NULL,
    "time_window_start_minutes" INTEGER NOT NULL,
    "time_window_end_minutes" INTEGER NOT NULL,
    "card_message" VARCHAR(500),
    "anonymous_card" BOOLEAN NOT NULL DEFAULT false,
    "customer_comment" VARCHAR(1000),
    "currency" CHAR(3) NOT NULL DEFAULT 'BYN',
    "subtotal_minor" BIGINT NOT NULL,
    "delivery_fee_minor" BIGINT NOT NULL DEFAULT 0,
    "total_minor" BIGINT NOT NULL,
    "cancellation_reason" VARCHAR(500),
    "cancelled_at" TIMESTAMPTZ(3),
    "confirmed_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "orders_subtotal_nonneg" CHECK ("subtotal_minor" >= 0),
    CONSTRAINT "orders_delivery_fee_nonneg" CHECK ("delivery_fee_minor" >= 0),
    CONSTRAINT "orders_total_nonneg" CHECK ("total_minor" >= 0),
    CONSTRAINT "orders_window_range" CHECK ("time_window_end_minutes" > "time_window_start_minutes")
);

CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "product_id" UUID,
    "variant_id" UUID,
    "product_name" VARCHAR(200) NOT NULL,
    "product_slug" VARCHAR(160) NOT NULL,
    "variant_name" VARCHAR(120) NOT NULL,
    "primary_image_url" VARCHAR(1000),
    "unit_price_minor" BIGINT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "line_total_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'BYN',

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "order_items_quantity_pos" CHECK ("quantity" > 0),
    CONSTRAINT "order_items_unit_price_nonneg" CHECK ("unit_price_minor" >= 0),
    CONSTRAINT "order_items_line_total_nonneg" CHECK ("line_total_minor" >= 0)
);

CREATE TABLE "order_events" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "type" "OrderEventType" NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus",
    "message" VARCHAR(500),
    "actor_admin_user_id" UUID,
    "request_id" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "event_type" VARCHAR(64) NOT NULL,
    "aggregate_type" VARCHAR(64) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- Indexes / uniques
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");
CREATE UNIQUE INDEX "orders_tracking_token_hash_key" ON "orders"("tracking_token_hash");
CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "orders"("idempotency_key");
CREATE INDEX "orders_status_fulfillment_date_idx" ON "orders"("status", "fulfillment_date");
CREATE INDEX "orders_fulfillment_date_time_window_start_minutes_idx" ON "orders"("fulfillment_date", "time_window_start_minutes");
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at" DESC);
CREATE INDEX "orders_purchaser_phone_e164_idx" ON "orders"("purchaser_phone_e164");

CREATE INDEX "order_items_order_id_sort_order_idx" ON "order_items"("order_id", "sort_order");
CREATE INDEX "order_events_order_id_created_at_idx" ON "order_events"("order_id", "created_at");
CREATE INDEX "outbox_events_processed_at_created_at_idx" ON "outbox_events"("processed_at", "created_at");
CREATE INDEX "outbox_events_aggregate_type_aggregate_id_idx" ON "outbox_events"("aggregate_type", "aggregate_id");

-- FKs
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default fulfillment settings (singleton)
INSERT INTO "fulfillment_settings" (
  "id",
  "delivery_enabled",
  "pickup_enabled",
  "delivery_fee_minor",
  "min_lead_time_minutes",
  "max_advance_days",
  "time_windows",
  "pickup_instructions",
  "version",
  "updated_at"
) VALUES (
  1,
  true,
  true,
  0,
  120,
  14,
  '[
    {"id":"tw-10-12","label":"10:00–12:00","startMinutes":600,"endMinutes":720,"active":true,"sortOrder":10,"appliesTo":"BOTH"},
    {"id":"tw-12-14","label":"12:00–14:00","startMinutes":720,"endMinutes":840,"active":true,"sortOrder":20,"appliesTo":"BOTH"},
    {"id":"tw-14-16","label":"14:00–16:00","startMinutes":840,"endMinutes":960,"active":true,"sortOrder":30,"appliesTo":"BOTH"},
    {"id":"tw-16-18","label":"16:00–18:00","startMinutes":960,"endMinutes":1080,"active":true,"sortOrder":40,"appliesTo":"BOTH"},
    {"id":"tw-18-20","label":"18:00–20:00","startMinutes":1080,"endMinutes":1200,"active":true,"sortOrder":50,"appliesTo":"BOTH"}
  ]'::jsonb,
  NULL,
  1,
  CURRENT_TIMESTAMP
);

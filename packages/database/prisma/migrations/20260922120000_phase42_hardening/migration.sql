-- Phase 4.2: Idempotency recovery + durable commercial CHECKs

CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "scope" VARCHAR(64) NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "resource_type" VARCHAR(64) NOT NULL,
    "resource_id" UUID NOT NULL,
    "encrypted_recovery_payload" BYTEA NOT NULL,
    "encryption_key_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "idempotency_records_key_version_pos" CHECK ("encryption_key_version" >= 1)
);

CREATE UNIQUE INDEX "idempotency_records_scope_key_key"
  ON "idempotency_records"("scope", "idempotency_key");

CREATE INDEX "idempotency_records_expires_at_idx"
  ON "idempotency_records"("expires_at");

CREATE INDEX "idempotency_records_resource_idx"
  ON "idempotency_records"("resource_type", "resource_id");

-- Strengthen money / window invariants (forward-only; existing data must already satisfy)
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_total_equals_parts"
  CHECK ("total_minor" = "subtotal_minor" + "delivery_fee_minor");

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_window_minutes_range"
  CHECK (
    "time_window_start_minutes" >= 0 AND "time_window_start_minutes" < 1440
    AND "time_window_end_minutes" > 0 AND "time_window_end_minutes" <= 1440
  );

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_line_equals_unit_qty"
  CHECK ("line_total_minor" = "unit_price_minor" * "quantity");

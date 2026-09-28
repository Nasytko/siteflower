-- Secure ERP integration foundation: outbox delivery states + simulator tables

CREATE TYPE "OutboxDeliveryStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'RETRY',
  'DELIVERED',
  'FAILED'
);

ALTER TYPE "AuditAction" ADD VALUE 'INTEGRATION_ENABLED';
ALTER TYPE "AuditAction" ADD VALUE 'INTEGRATION_DISABLED';
ALTER TYPE "AuditAction" ADD VALUE 'INTEGRATION_CONFIG_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'INTEGRATION_TEST_CONNECTION';
ALTER TYPE "AuditAction" ADD VALUE 'INTEGRATION_EVENT_MANUAL_RETRY';
ALTER TYPE "AuditAction" ADD VALUE 'INTEGRATION_TEST_EVENT_SENT';

-- Extend outbox_events (preserve historical rows)
ALTER TABLE "outbox_events"
  ADD COLUMN IF NOT EXISTS "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "status" "OutboxDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_attempt_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "next_attempt_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "delivered_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "lease_owner" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "lease_expires_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "failure_category" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "last_error_sanitized" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "remote_reference" VARCHAR(200);

-- Backfill from legacy columns
UPDATE "outbox_events"
SET
  "attempt_count" = COALESCE("attempts", 0),
  "status" = CASE
    WHEN "processed_at" IS NOT NULL THEN 'DELIVERED'::"OutboxDeliveryStatus"
    ELSE 'PENDING'::"OutboxDeliveryStatus"
  END,
  "delivered_at" = "processed_at",
  "available_at" = COALESCE("created_at", CURRENT_TIMESTAMP)
WHERE TRUE;

CREATE INDEX IF NOT EXISTS "outbox_events_status_available_at_created_at_idx"
  ON "outbox_events"("status", "available_at", "created_at");

CREATE INDEX IF NOT EXISTS "outbox_events_lease_expires_at_idx"
  ON "outbox_events"("lease_expires_at");

CREATE TABLE IF NOT EXISTS "integration_worker_heartbeats" (
  "id" VARCHAR(120) NOT NULL,
  "last_seen_at" TIMESTAMPTZ(3) NOT NULL,
  "hostname" VARCHAR(200),
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "integration_worker_heartbeats_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "integration_replay_nonces" (
  "id" TEXT NOT NULL,
  "key_id" VARCHAR(120) NOT NULL,
  "nonce" VARCHAR(128) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "integration_replay_nonces_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "integration_replay_nonces_key_id_nonce_key"
  ON "integration_replay_nonces"("key_id", "nonce");

CREATE INDEX IF NOT EXISTS "integration_replay_nonces_expires_at_idx"
  ON "integration_replay_nonces"("expires_at");

CREATE TABLE IF NOT EXISTS "integration_simulator_receipts" (
  "id" TEXT NOT NULL,
  "event_id" UUID NOT NULL,
  "external_order_id" UUID,
  "event_type" VARCHAR(64) NOT NULL,
  "schema_version" INTEGER NOT NULL,
  "accepted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "remote_reference" VARCHAR(200) NOT NULL,
  CONSTRAINT "integration_simulator_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "integration_simulator_receipts_event_id_key"
  ON "integration_simulator_receipts"("event_id");

CREATE INDEX IF NOT EXISTS "integration_simulator_receipts_external_order_id_idx"
  ON "integration_simulator_receipts"("external_order_id");

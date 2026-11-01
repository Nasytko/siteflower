-- Additive: payment + sync status on orders; delivery attempt history; new event type.

CREATE TYPE "PaymentMethod" AS ENUM ('CASH_ON_DELIVERY', 'CARD_ONLINE');
CREATE TYPE "PaymentStatus" AS ENUM ('NOT_REQUIRED', 'AWAITING_PAYMENT', 'PAID', 'FAILED', 'CANCELLED');
CREATE TYPE "ErpSyncStatus" AS ENUM ('PENDING', 'RETRYING', 'SYNCED', 'FAILED', 'DISABLED');
CREATE TYPE "TelegramNotifyStatus" AS ENUM ('PENDING', 'RETRYING', 'SENT', 'FAILED', 'SKIPPED', 'DISABLED');
CREATE TYPE "IntegrationChannel" AS ENUM ('ERP', 'TELEGRAM');
CREATE TYPE "IntegrationAttemptOutcome" AS ENUM ('SUCCESS', 'FAILURE', 'SKIPPED');

ALTER TYPE "OrderEventType" ADD VALUE 'PAYMENT_STATUS_CHANGED';

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "payment_method" "PaymentMethod" NOT NULL DEFAULT 'CASH_ON_DELIVERY',
  ADD COLUMN IF NOT EXISTS "payment_status" "PaymentStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN IF NOT EXISTS "paid_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "payment_provider" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "payment_external_id" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "erp_sync_status" "ErpSyncStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "erp_remote_reference" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "telegram_notify_status" "TelegramNotifyStatus" NOT NULL DEFAULT 'PENDING';

CREATE INDEX IF NOT EXISTS "orders_payment_status_idx" ON "orders"("payment_status");
CREATE INDEX IF NOT EXISTS "orders_erp_sync_status_idx" ON "orders"("erp_sync_status");
CREATE INDEX IF NOT EXISTS "orders_telegram_notify_status_idx" ON "orders"("telegram_notify_status");

CREATE TABLE IF NOT EXISTS "integration_delivery_attempts" (
  "id" UUID NOT NULL,
  "channel" "IntegrationChannel" NOT NULL,
  "order_id" UUID NOT NULL,
  "outbox_event_id" UUID,
  "attempt_number" INTEGER NOT NULL,
  "outcome" "IntegrationAttemptOutcome" NOT NULL,
  "remote_reference" VARCHAR(200),
  "error_code" VARCHAR(64),
  "error_sanitized" VARCHAR(500),
  "next_attempt_at" TIMESTAMPTZ(3),
  "meta" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "integration_delivery_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "integration_delivery_attempts_order_id_created_at_idx"
  ON "integration_delivery_attempts"("order_id", "created_at");
CREATE INDEX IF NOT EXISTS "integration_delivery_attempts_channel_created_at_idx"
  ON "integration_delivery_attempts"("channel", "created_at");
CREATE INDEX IF NOT EXISTS "integration_delivery_attempts_outbox_event_id_idx"
  ON "integration_delivery_attempts"("outbox_event_id");

ALTER TABLE "integration_delivery_attempts"
  DROP CONSTRAINT IF EXISTS "integration_delivery_attempts_order_id_fkey";
ALTER TABLE "integration_delivery_attempts"
  ADD CONSTRAINT "integration_delivery_attempts_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

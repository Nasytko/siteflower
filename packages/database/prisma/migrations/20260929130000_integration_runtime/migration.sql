-- Admin-controllable pause for ERP outbox worker (singleton row id=1)

CREATE TABLE IF NOT EXISTS "integration_runtime_settings" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "paused" BOOLEAN NOT NULL DEFAULT false,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "integration_runtime_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "integration_runtime_settings" ("id", "paused", "updated_at")
VALUES (1, false, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- CreateTable
CREATE TABLE "foundation_probes" (
    "id" UUID NOT NULL,
    "label" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "foundation_probes_pkey" PRIMARY KEY ("id")
);

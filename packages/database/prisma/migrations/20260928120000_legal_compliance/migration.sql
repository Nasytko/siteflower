-- Belarus legal/compliance: seller entity + versioned legal documents

-- AlterEnum (AuditAction)
ALTER TYPE "AuditAction" ADD VALUE 'SELLER_LEGAL_DETAILS_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'BANK_DETAILS_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'TRADE_REGISTER_DETAILS_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'LEGAL_DOCUMENT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'LEGAL_DOCUMENT_PUBLISHED';

CREATE TYPE "LegalDocumentKind" AS ENUM (
  'ORDER_TERMS',
  'PRIVACY_POLICY',
  'RETURNS_POLICY',
  'DELIVERY_PAYMENT',
  'SUBSTITUTION_POLICY'
);

CREATE TYPE "LegalDocumentVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED');

CREATE TABLE "legal_entity_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "seller_type" VARCHAR(40) NOT NULL DEFAULT 'INDIVIDUAL_ENTREPRENEUR',
    "legal_name" VARCHAR(300) NOT NULL,
    "unp" VARCHAR(20) NOT NULL,
    "legal_address" VARCHAR(500) NOT NULL,
    "postal_code" VARCHAR(20),
    "state_registration_date" DATE,
    "state_registration_number" VARCHAR(120),
    "registering_authority" VARCHAR(300),
    "trade_register_number" VARCHAR(120),
    "trade_register_date" DATE,
    "seller_phone" VARCHAR(40),
    "seller_email" VARCHAR(320),
    "business_hours" VARCHAR(500),
    "consumer_claims_contact_name" VARCHAR(200),
    "consumer_claims_phone" VARCHAR(40),
    "consumer_claims_email" VARCHAR(320),
    "physical_store_address" VARCHAR(500),
    "pickup_address" VARCHAR(500),
    "actual_offline_payment_description" VARCHAR(2000),
    "failed_delivery_policy" VARCHAR(2000),
    "bank_account_iban" VARCHAR(34),
    "bank_name" VARCHAR(200),
    "bank_address" VARCHAR(500),
    "bank_swift" VARCHAR(20),
    "bank_unp" VARCHAR(20),
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "legal_entity_settings_pkey" PRIMARY KEY ("id")
);

-- Owner-provided seller + bank seed (NOT secrets). Missing registration/trade fields stay null.
INSERT INTO "legal_entity_settings" (
  "id",
  "seller_type",
  "legal_name",
  "unp",
  "legal_address",
  "postal_code",
  "bank_account_iban",
  "bank_name",
  "bank_address",
  "bank_swift",
  "bank_unp",
  "version",
  "updated_at"
) VALUES (
  1,
  'INDIVIDUAL_ENTREPRENEUR',
  'Индивидуальный предприниматель Олизар Антон Геннадьевич',
  '591673107',
  '231606, Республика Беларусь, Гродненская область, Мостовский район, деревня Каменчаны, дом 17',
  '231606',
  'BY31POIS30130185611201933001',
  'ОАО «Паритетбанк»',
  '220002, г. Минск, ул. Киселева, 61А',
  'POISBY2X',
  '100233809',
  1,
  NOW()
);

CREATE TABLE "legal_documents" (
    "id" UUID NOT NULL,
    "kind" "LegalDocumentKind" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "legal_documents_kind_key" ON "legal_documents"("kind");

CREATE TABLE "legal_document_versions" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "LegalDocumentVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "title" VARCHAR(200) NOT NULL,
    "body_markdown" TEXT NOT NULL,
    "effective_at" TIMESTAMPTZ(3),
    "published_at" TIMESTAMPTZ(3),
    "created_by_admin_user_id" UUID,
    "updated_by_admin_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "legal_document_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "legal_document_versions_document_id_version_key" ON "legal_document_versions"("document_id", "version");
CREATE INDEX "legal_document_versions_document_id_status_idx" ON "legal_document_versions"("document_id", "status");
CREATE INDEX "legal_document_versions_document_id_published_at_idx" ON "legal_document_versions"("document_id", "published_at" DESC);

ALTER TABLE "legal_document_versions"
  ADD CONSTRAINT "legal_document_versions_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "legal_documents"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

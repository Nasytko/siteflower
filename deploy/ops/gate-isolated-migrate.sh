#!/usr/bin/env bash
# Isolated migrate gate for Task 05 — NEVER targets bouquet_one / production names.
set -euo pipefail

export PATH="${HOME}/scoop/apps/postgresql/current/bin:/c/Users/Pavel/scoop/apps/postgresql/current/bin:${PATH}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB="siteflower_gate_$(date -u +%Y%m%d%H%M%S)"
MIG_ROOT="${ROOT}/packages/database/prisma/migrations"
DIAM_MIG="20261102010000_drop_product_diameter_cm"
STASH="${ROOT}/packages/database/prisma/.gate-stash-${DIAM_MIG}"

cleanup_stash() {
  if [[ -d "$STASH" ]]; then
    mv "$STASH" "${MIG_ROOT}/${DIAM_MIG}"
  fi
}
trap cleanup_stash EXIT

psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 \
  -c "CREATE DATABASE ${DB} OWNER ${PGUSER};"
echo "CREATED ${DB}"

export DATABASE_URL="postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${DB}?schema=public"
cd "$ROOT"

# Phase 1: migrate without diameter drop, seed non-null diameter_cm, then apply drop.
mv "${MIG_ROOT}/${DIAM_MIG}" "$STASH"
pnpm --filter @bouquet-one/database migrate:deploy

psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO products (
  id, slug, name, currency, lifecycle, availability, version,
  product_kind, composition_kind, composition_precision, composition_primary_complete,
  no_index, diameter_cm, created_at, updated_at
) VALUES (
  '00000000-0000-4000-8000-0000000000aa',
  'gate-diameter-probe',
  'Gate Diameter Probe',
  'BYN',
  'DRAFT',
  'AVAILABLE',
  1,
  'BOUQUET',
  'UNKNOWN',
  'UNKNOWN',
  false,
  false,
  55,
  NOW(),
  NOW()
);

SELECT count(*)::int AS non_null_diameter_before
FROM products
WHERE diameter_cm IS NOT NULL;
SQL

mv "$STASH" "${MIG_ROOT}/${DIAM_MIG}"
STASH=""
pnpm --filter @bouquet-one/database migrate:deploy

psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB" -v ON_ERROR_STOP=1 <<'SQL'
SELECT migration_name, (finished_at IS NOT NULL) AS finished
FROM _prisma_migrations
WHERE migration_name IN (
  '20261028120000_order_payment_sync_telegram',
  '20261101220000_product_erp_sku',
  '20261102010000_drop_product_diameter_cm'
)
ORDER BY migration_name;

SELECT count(*)::int AS erp_sku_pk
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
WHERE t.relname = 'erp_sku_registry' AND c.contype = 'p';

SELECT count(*)::int AS diameter_col
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'diameter_cm';

SELECT product_id::text, diameter_cm
FROM "_archive_product_diameter_cm"
ORDER BY diameter_cm;

SELECT count(*)::int AS payment_telegram_cols
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'orders'
  AND column_name IN ('payment_status', 'telegram_notify_status');
SQL

pnpm --filter @bouquet-one/database migrate:deploy
echo "IDEMPOTENT_MIGRATE_OK"
echo "GATE_DB=${DB}"
echo "READ_ONLY_VPS_QUERY=SELECT count(*) AS non_null_diameter FROM products WHERE diameter_cm IS NOT NULL;"

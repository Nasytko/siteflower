#!/usr/bin/env bash
# Re-run isolated migrate proof for Release 01 (never bouquet_one).
set -euo pipefail
export PATH="/c/Users/Pavel/scoop/apps/postgresql/current/bin:${PATH}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
PGHOST=127.0.0.1
PGPORT=5432
PGUSER=postgres
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB="siteflower_rel01_$(date -u +%Y%m%d%H%M%S)"
MIG_ROOT="${ROOT}/packages/database/prisma/migrations"
DIAM=20261102010000_drop_product_diameter_cm
STASH="${ROOT}/packages/database/prisma/.gate-stash-${DIAM}"

cleanup() {
  if [[ -d "$STASH" ]]; then
    mv "$STASH" "${MIG_ROOT}/${DIAM}" || true
  fi
}
trap cleanup EXIT

psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${DB} OWNER ${PGUSER};"
echo "CREATED ${DB}"
export DATABASE_URL="postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${DB}?schema=public"
cd "$ROOT"

mv "${MIG_ROOT}/${DIAM}" "$STASH"
pnpm --filter @bouquet-one/database migrate:deploy
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB" -v ON_ERROR_STOP=1 -c \
  "INSERT INTO products (id, slug, name, currency, lifecycle, availability, version, product_kind, composition_kind, composition_precision, composition_primary_complete, no_index, diameter_cm, created_at, updated_at) VALUES ('00000000-0000-4000-8000-0000000000bb','rel01-diameter','Rel01', 'BYN','DRAFT','AVAILABLE',1,'BOUQUET','UNKNOWN','UNKNOWN',false,false,77,NOW(),NOW()); SELECT count(*) AS non_null_before FROM products WHERE diameter_cm IS NOT NULL;"

mv "$STASH" "${MIG_ROOT}/${DIAM}"
STASH=""
pnpm --filter @bouquet-one/database migrate:deploy

psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB" -v ON_ERROR_STOP=1 <<'SQL'
SELECT migration_name FROM _prisma_migrations
 WHERE migration_name IN (
   '20261028120000_order_payment_sync_telegram',
   '20261101220000_product_erp_sku',
   '20261102010000_drop_product_diameter_cm'
 ) AND finished_at IS NOT NULL ORDER BY 1;
SELECT count(*) AS erp_pk FROM pg_constraint c JOIN pg_class t ON c.conrelid=t.oid WHERE t.relname='erp_sku_registry' AND c.contype='p';
SELECT count(*) AS diam_col FROM information_schema.columns WHERE table_name='products' AND column_name='diameter_cm';
SELECT diameter_cm FROM "_archive_product_diameter_cm";
SELECT count(*) AS seo_drop_in_migrations FROM _prisma_migrations WHERE migration_name LIKE '%drop_seo_landing%';
SQL
pnpm --filter @bouquet-one/database migrate:deploy
echo IDEMPOTENT_OK
# prove SEO cleanup migration NOT in normal history
test ! -d "${MIG_ROOT}/20261102020000_drop_seo_landing_pages"
echo SEO_CLEANUP_NOT_IN_NORMAL_MIGRATIONS_OK
echo GATE_DB=$DB

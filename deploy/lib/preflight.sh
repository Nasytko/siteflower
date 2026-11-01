#!/usr/bin/env bash
# shopbuket1 release preflight helpers (backup + isolated migration rehearsal).
# shellcheck shell=bash
#
# Never points migrations at the live POSTGRES_DB name.
# Temporary DBs must be named shopbuket1_preflight_*.

SHOPBUKET1_PREFLIGHT_DIR="${SHOPBUKET1_PREFLIGHT_DIR:-${SHOPBUKET1_STATE_DIR}/preflight}"
SHOPBUKET1_PREFLIGHT_MAX_AGE_SECONDS="${SHOPBUKET1_PREFLIGHT_MAX_AGE_SECONDS:-14400}"
SHOPBUKET1_PREFLIGHT_MIN_DISK_MB="${SHOPBUKET1_PREFLIGHT_MIN_DISK_MB:-2048}"

# Tables counted if present (schema-version safe).
PREFLIGHT_COUNT_TABLES=(
  products
  product_variants
  catalog_categories
  flower_types
  flower_items
  product_components
  navigation_menu_items
  seo_landing_pages
  slug_redirects
  orders
  erp_sku_registry
  product_option_values
)

preflight_require_tools() {
  local c
  for c in docker git curl flock df; do
    require_cmd "$c"
  done
  docker info >/dev/null 2>&1 || die "Docker not reachable"
  docker compose version >/dev/null 2>&1 || die "Docker Compose plugin required"
}

preflight_disk_ok() {
  local target="${SHOPBUKET1_BACKUP_DIR}"
  mkdir -p "$target"
  local avail_kb
  avail_kb="$(df -Pk "$target" | awk 'NR==2 {print $4}')"
  [[ "$avail_kb" =~ ^[0-9]+$ ]] || die "Cannot determine free disk for $target"
  local avail_mb=$((avail_kb / 1024))
  if [[ "$avail_mb" -lt "$SHOPBUKET1_PREFLIGHT_MIN_DISK_MB" ]]; then
    die "Insufficient disk for backup/rehearsal: ${avail_mb}MiB free (need ≥${SHOPBUKET1_PREFLIGHT_MIN_DISK_MB}MiB) under $target"
  fi
  log "Disk OK: ${avail_mb}MiB free under $target"
}

preflight_postgres_ready() {
  local i status
  compose up -d postgres >/dev/null
  for i in $(seq 1 40); do
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' shopbuket1-postgres 2>/dev/null || echo missing)"
    if [[ "$status" == "healthy" || "$status" == "running" ]]; then
      compose exec -T postgres \
        pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1 \
        && return 0
    fi
    sleep 2
  done
  die "shopbuket1-postgres not ready"
}

# Run SQL against the production DB name (read-only queries only by convention).
preflight_psql_prod() {
  compose exec -T postgres \
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$1"
}

# Run SQL against an isolated rehearsal DB.
preflight_psql_db() {
  local db="$1"
  local sql="$2"
  assert_preflight_db_name "$db"
  compose exec -T postgres \
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$db" -tAc "$sql"
}

assert_preflight_db_name() {
  local db="$1"
  [[ "$db" =~ ^shopbuket1_preflight_[A-Za-z0-9_]+$ ]] \
    || die "Refusing non-preflight database name: $db"
  [[ "$db" != "$POSTGRES_DB" ]] || die "Refusing to use production database name as rehearsal target"
}

table_exists_prod() {
  local table="$1"
  local n
  n="$(preflight_psql_prod "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='${table}'")"
  [[ "$(echo "$n" | tr -d '[:space:]')" == "1" ]]
}

preflight_inventory_json() {
  local table n
  local json="{"
  local first=1
  for table in "${PREFLIGHT_COUNT_TABLES[@]}"; do
    if [[ "$first" -eq 1 ]]; then
      first=0
    else
      json+=","
    fi
    if table_exists_prod "$table"; then
      n="$(preflight_psql_prod "SELECT count(*)::int FROM ${table}")"
      n="$(echo "$n" | tr -d '[:space:]')"
      json+="\"${table}\":${n}"
      log "Inventory ${table}=${n}"
    else
      json+="\"${table}\":null"
      log "Inventory ${table}=missing (ok for older schema)"
    fi
  done
  json+="}"
  printf '%s\n' "$json"
}

preflight_migration_status() {
  # Best-effort: list applied migrations via prisma inside API image if present,
  # else read _prisma_migrations from Postgres.
  if table_exists_prod "_prisma_migrations"; then
    local applied pending_hint
    applied="$(preflight_psql_prod "SELECT count(*)::int FROM _prisma_migrations WHERE finished_at IS NOT NULL")"
    applied="$(echo "$applied" | tr -d '[:space:]')"
    log "Prisma migrations applied (finished): ${applied}"
    printf '%s\n' "$applied"
  else
    log "WARN _prisma_migrations missing — fresh or non-Prisma DB"
    printf '0\n'
  fi
}

# Active failed Prisma row: started but neither finished nor rolled back.
# Historical rolled_back_at rows (often paired with a later successful apply) are OK.
PREFLIGHT_PRISMA_ACTIVE_FAILED_SQL="SELECT count(*)::int FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL"

# Fail closed on active failed Prisma rows or duplicate migration folder names in the checkout.
preflight_check_migration_conflicts() {
  local root
  root="$(repo_root)"
  local mig_dir="${root}/packages/database/prisma/migrations"
  [[ -d "$mig_dir" ]] || die "Migrations directory missing: $mig_dir"

  local names_list
  names_list="$(find "$mig_dir" -mindepth 1 -maxdepth 1 -type d \
    | while IFS= read -r d; do basename "$d"; done | sort)"
  local dup
  dup="$(printf '%s\n' "$names_list" | uniq -d || true)"
  [[ -z "$dup" ]] || die "Conflicting duplicate migration folder name(s): $dup"

  local prefix_dup
  prefix_dup="$(printf '%s\n' "$names_list" \
    | awk '{print substr($0,1,14)}' \
    | grep -E '^[0-9]{14}$' \
    | sort | uniq -d || true)"
  [[ -z "$prefix_dup" ]] \
    || die "Conflicting migration timestamps sharing prefix: ${prefix_dup}"

  local mig_n
  mig_n="$(find "$mig_dir" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
  log "Migration folders OK (${mig_n} directories)"

  if table_exists_prod "_prisma_migrations"; then
    local failed
    failed="$(preflight_psql_prod "${PREFLIGHT_PRISMA_ACTIVE_FAILED_SQL}")"
    failed="$(echo "$failed" | tr -d '[:space:]')"
    if [[ -z "$failed" || ! "$failed" =~ ^[0-9]+$ ]]; then
      die "Production _prisma_migrations query failed or returned non-numeric count — resolve DB access before deploy"
    fi
    if [[ "$failed" != "0" ]]; then
      die "Production _prisma_migrations has ${failed} failed/unfinished row(s) (finished_at IS NULL AND rolled_back_at IS NULL) — resolve before deploy"
    fi
  fi
}

preflight_create_backup() {
  local label="preflight"
  local root
  root="$(repo_root)"
  log "Creating preflight backup via backup.sh"
  "$root/backup.sh" "$label"
  # Resolve newest matching dump
  local latest
  latest="$(ls -1t "${SHOPBUKET1_BACKUP_DIR}"/shopbuket1-*-preflight.dump 2>/dev/null | head -n1 || true)"
  [[ -n "$latest" && -f "$latest" ]] || die "Preflight backup artifact not found"
  local size
  size="$(wc -c <"$latest" | tr -d ' ')"
  [[ "$size" -gt 100 ]] || die "Preflight backup too small (${size} bytes)"
  printf '%s\n' "$latest"
}

preflight_drop_db_if_exists() {
  local db="$1"
  assert_preflight_db_name "$db"
  compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${db}' AND pid <> pg_backend_pid();" \
    >/dev/null 2>&1 || true
  compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c \
    "DROP DATABASE IF EXISTS \"${db}\";" >/dev/null
}

preflight_create_rehearsal_db() {
  local db="$1"
  assert_preflight_db_name "$db"
  preflight_drop_db_if_exists "$db"
  compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c \
    "CREATE DATABASE \"${db}\" OWNER \"${POSTGRES_USER}\";" >/dev/null
}

preflight_restore_dump() {
  local db="$1"
  local dump="$2"
  assert_preflight_db_name "$db"
  [[ -f "$dump" ]] || die "Dump missing: $dump"
  log "Restoring dump into isolated DB ${db} (not ${POSTGRES_DB})"
  # Stream dump into pg_restore inside postgres container.
  # --clean/--if-exists safe for empty new DB; never target POSTGRES_DB.
  if ! compose exec -T postgres \
    pg_restore -U "$POSTGRES_USER" -d "$db" --no-owner --no-acl --exit-on-error <"$dump"; then
    die "pg_restore into ${db} failed"
  fi
}

preflight_migrate_rehearsal() {
  local db="$1"
  assert_preflight_db_name "$db"
  local enc url
  enc="$(urlencode "$POSTGRES_PASSWORD")"
  url="postgresql://${POSTGRES_USER}:${enc}@postgres:5432/${db}?schema=public"
  [[ "$url" == *"/${db}?"* ]] || die "Rehearsal DATABASE_URL must target ${db}"
  [[ "$url" != *"/${POSTGRES_DB}?"* ]] || die "Refusing rehearsal URL that targets production DB name"
  log "Applying prisma migrate deploy on isolated DB ${db}"
  compose run --rm --no-deps \
    -e "DATABASE_URL=${url}" \
    api \
    sh -lc 'cd /app/node_modules/@bouquet-one/database && exec /app/node_modules/.bin/prisma migrate deploy'
}

# True when the checkout includes Task 04A ERP SKU migration (fail-closed gate).
release_requires_erp_sku_registry() {
  local root mig
  root="$(repo_root)"
  mig="${root}/packages/database/prisma/migrations/20261101220000_product_erp_sku"
  [[ -d "$mig" ]]
}

# Fail closed: erp_sku_registry table + primary key must exist on $1 (DB name).
# Uses preflight_psql_db — never call against production name unless caller intends live gate.
verify_erp_sku_registry_db() {
  local db="$1"
  local label="${2:-verify}"
  local exists sku_pk n
  exists="$(preflight_psql_db "$db" "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='erp_sku_registry'")"
  exists="$(echo "$exists" | tr -d '[:space:]')"
  if [[ "$exists" != "1" ]]; then
    log "FAIL ${label}: erp_sku_registry table missing (Task 04A required)"
    return 1
  fi
  sku_pk="$(preflight_psql_db "$db" "SELECT count(*)::int FROM pg_constraint c JOIN pg_class t ON c.conrelid=t.oid WHERE t.relname='erp_sku_registry' AND c.contype='p'")"
  sku_pk="$(echo "$sku_pk" | tr -d '[:space:]')"
  if [[ "$sku_pk" != "1" ]]; then
    log "FAIL ${label}: erp_sku_registry missing primary key"
    return 1
  fi
  n="$(preflight_psql_db "$db" "SELECT count(*)::int FROM erp_sku_registry")"
  n="$(echo "$n" | tr -d '[:space:]')"
  log "${label}: erp_sku_registry=${n} (table+PK OK)"
  return 0
}

# Live production DB gate (after migrate deploy). Same rules, via prod helper.
verify_erp_sku_registry_prod() {
  local exists sku_pk n
  exists="$(preflight_psql_prod "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='erp_sku_registry'")"
  exists="$(echo "$exists" | tr -d '[:space:]')"
  if [[ "$exists" != "1" ]]; then
    log "FAIL live: erp_sku_registry table missing after migrate (Task 04A)"
    return 1
  fi
  sku_pk="$(preflight_psql_prod "SELECT count(*)::int FROM pg_constraint c JOIN pg_class t ON c.conrelid=t.oid WHERE t.relname='erp_sku_registry' AND c.contype='p'")"
  sku_pk="$(echo "$sku_pk" | tr -d '[:space:]')"
  if [[ "$sku_pk" != "1" ]]; then
    log "FAIL live: erp_sku_registry missing primary key after migrate"
    return 1
  fi
  n="$(preflight_psql_prod "SELECT count(*)::int FROM erp_sku_registry")"
  n="$(echo "$n" | tr -d '[:space:]')"
  log "Live erp_sku_registry=${n} (table+PK OK)"
  return 0
}

# Schema state after migrate: trust DB catalog, not only migrate deploy exit code.
verify_live_schema_state() {
  local fails=0
  local mig
  for mig in \
    20261028120000_order_payment_sync_telegram \
    20261101220000_product_erp_sku
  do
    local n
    n="$(preflight_psql_prod "SELECT count(*)::int FROM _prisma_migrations WHERE migration_name='${mig}' AND finished_at IS NOT NULL")"
    n="$(echo "$n" | tr -d '[:space:]')"
    if [[ "$n" != "1" ]]; then
      log "FAIL schema state: migration ${mig} not finished in _prisma_migrations"
      fails=1
    else
      log "Schema state OK: ${mig} finished"
    fi
  done

  if [[ -d "$(repo_root)/packages/database/prisma/migrations/20261102010000_drop_product_diameter_cm" ]]; then
    local diam_mig diam_col
    diam_mig="$(preflight_psql_prod "SELECT count(*)::int FROM _prisma_migrations WHERE migration_name='20261102010000_drop_product_diameter_cm' AND finished_at IS NOT NULL")"
    diam_mig="$(echo "$diam_mig" | tr -d '[:space:]')"
    diam_col="$(preflight_psql_prod "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='diameter_cm'")"
    diam_col="$(echo "$diam_col" | tr -d '[:space:]')"
    if [[ "$diam_mig" != "1" ]]; then
      log "FAIL schema state: diameter drop migration not finished"
      fails=1
    fi
    if [[ "$diam_col" != "0" ]]; then
      log "FAIL schema state: products.diameter_cm still present after drop migration"
      fails=1
    else
      log "Schema state OK: products.diameter_cm absent"
    fi
  fi

  if release_requires_erp_sku_registry; then
    verify_erp_sku_registry_prod || fails=1
  fi

  local pay
  pay="$(preflight_psql_prod "SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name IN ('payment_status','telegram_notify_status')")"
  pay="$(echo "$pay" | tr -d '[:space:]')"
  if [[ "$pay" != "2" ]]; then
    log "FAIL schema state: orders payment/telegram columns missing (got ${pay})"
    fails=1
  else
    log "Schema state OK: orders payment_status + telegram_notify_status"
  fi

  return "$fails"
}

preflight_verify_rehearsal() {
  local db="$1"
  assert_preflight_db_name "$db"
  local table n fails=0
  for table in products catalog_categories orders slug_redirects; do
    local exists
    exists="$(preflight_psql_db "$db" "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='${table}'")"
    exists="$(echo "$exists" | tr -d '[:space:]')"
    if [[ "$exists" != "1" ]]; then
      log "WARN rehearsal missing table ${table}"
      continue
    fi
    n="$(preflight_psql_db "$db" "SELECT count(*)::int FROM ${table}")"
    n="$(echo "$n" | tr -d '[:space:]')"
    log "Rehearsal ${table}=${n}"
  done
  # FK integrity: orphan product_variants
  if [[ "$(preflight_psql_db "$db" "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='product_variants'")" =~ 1 ]]; then
    local orphans
    orphans="$(preflight_psql_db "$db" "SELECT count(*)::int FROM product_variants v LEFT JOIN products p ON p.id = v.product_id WHERE p.id IS NULL")"
    orphans="$(echo "$orphans" | tr -d '[:space:]')"
    if [[ "$orphans" != "0" ]]; then
      log "FAIL rehearsal orphan product_variants=${orphans}"
      fails=1
    fi
  fi
  # Task 04A: mandatory when migration is in the checkout (fail closed — not WARN).
  if release_requires_erp_sku_registry; then
    if ! verify_erp_sku_registry_db "$db" "rehearsal"; then
      fails=1
    fi
  fi
  return "$fails"
}

# Read-only SEO legacy inventory — never DROP seo_landing_pages here.
seo_reconcile_report() {
  log "SEO reconcile (read-only) — no DROP / TRUNCATE"
  local seo_n cat_n redir_n
  if table_exists_prod "seo_landing_pages"; then
    seo_n="$(preflight_psql_prod "SELECT count(*)::int FROM seo_landing_pages")"
    seo_n="$(echo "$seo_n" | tr -d '[:space:]')"
  else
    seo_n="missing"
  fi
  if table_exists_prod "catalog_categories"; then
    cat_n="$(preflight_psql_prod "SELECT count(*)::int FROM catalog_categories")"
    cat_n="$(echo "$cat_n" | tr -d '[:space:]')"
  else
    cat_n="missing"
  fi
  if table_exists_prod "slug_redirects"; then
    redir_n="$(preflight_psql_prod "SELECT count(*)::int FROM slug_redirects")"
    redir_n="$(echo "$redir_n" | tr -d '[:space:]')"
  else
    redir_n="missing"
  fi
  local orphans="n/a"
  if table_exists_prod "seo_landing_pages" && table_exists_prod "catalog_categories"; then
    orphans="$(preflight_psql_prod "
      SELECT count(*)::int
      FROM seo_landing_pages s
      LEFT JOIN catalog_categories c
        ON c.slug = s.slug AND c.page_kind = 'THEMATIC'
      WHERE s.status = 'PUBLISHED' AND c.id IS NULL
    ")"
    orphans="$(echo "$orphans" | tr -d '[:space:]')"
  fi
  cat <<EOF
=== SEO legacy reconciliation (read-only) ===
seo_landing_pages:   ${seo_n}
catalog_categories:  ${cat_n}
slug_redirects:      ${redir_n}
published orphans (legacy without THEMATIC category): ${orphans}

Policy: do NOT DROP seo_landing_pages via normal deploy.
Use ./deploy.sh production --cleanup-plan deploy/cleanup-plans/task05-seo-landing-drop.v1.json
only after status=approved + SHOPBUKET1_CLEANUP_APPROVAL_TOKEN + restore-test.
EOF
}

preflight_report_path() {
  local rev="$1"
  printf '%s/%s.json\n' "$SHOPBUKET1_PREFLIGHT_DIR" "$rev"
}

write_preflight_report() {
  local rev="$1"
  local status="$2"
  local backup="$3"
  local rehearsal_db="$4"
  local inventory_json="$5"
  local migrations_applied="$6"
  local reason="${7:-}"

  mkdir -p "$SHOPBUKET1_PREFLIGHT_DIR"
  chmod 750 "$SHOPBUKET1_PREFLIGHT_DIR" || true
  local file stamp
  stamp="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  file="$(preflight_report_path "$rev")"
  umask 077
  cat >"$file" <<EOF
{
  "status": "$(printf '%s' "$status" | sed 's/"/\\"/g')",
  "revision": "$(printf '%s' "$rev" | sed 's/"/\\"/g')",
  "checked_at": "${stamp}",
  "backup_path": "$(printf '%s' "$backup" | sed 's/"/\\"/g')",
  "rehearsal_db": "$(printf '%s' "$rehearsal_db" | sed 's/"/\\"/g')",
  "production_db": "$(printf '%s' "$POSTGRES_DB" | sed 's/"/\\"/g')",
  "migrations_applied_count": ${migrations_applied:-0},
  "inventory": ${inventory_json},
  "reason": "$(printf '%s' "$reason" | sed 's/"/\\"/g')"
}
EOF
  chmod 600 "$file"
  # Pointer to latest successful/failed report for this checkout
  printf '%s\n' "$file" >"${SHOPBUKET1_PREFLIGHT_DIR}/latest"
  log "Preflight report: $file (status=${status})"
  printf '%s\n' "$file"
}

require_preflight_pass() {
  local rev="$1"
  local file
  file="$(preflight_report_path "$rev")"
  [[ -f "$file" ]] || die "No preflight report for revision ${rev}. Run: ./scripts/release.sh preflight"
  local status checked backup
  status="$(json_field "$file" status)"
  checked="$(json_field "$file" checked_at)"
  backup="$(json_field "$file" backup_path)"
  [[ "$status" == "PASS" ]] || die "Preflight status is '${status}' for ${rev} (need PASS)"
  [[ -n "$backup" && -f "$backup" ]] || die "Preflight backup missing: ${backup}"
  # Age check (GNU date); fail closed if unparsable.
  if command -v date >/dev/null 2>&1; then
    local now_s then_s age
    now_s="$(date -u +%s)"
    then_s="$(date -u -d "$checked" +%s 2>/dev/null || date -u -j -f '%Y-%m-%dT%H:%M:%SZ' "$checked" +%s 2>/dev/null || echo "")"
    if [[ -n "$then_s" ]]; then
      age=$((now_s - then_s))
      if [[ "$age" -gt "$SHOPBUKET1_PREFLIGHT_MAX_AGE_SECONDS" ]]; then
        die "Preflight report too old (${age}s > ${SHOPBUKET1_PREFLIGHT_MAX_AGE_SECONDS}s). Re-run preflight."
      fi
    else
      log "WARN could not parse preflight checked_at=${checked}; continuing"
    fi
  fi
  log "Preflight PASS verified for ${rev}"
  printf '%s\n' "$file"
}

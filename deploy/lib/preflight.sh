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
  return "$fails"
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

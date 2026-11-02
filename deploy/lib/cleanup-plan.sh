#!/usr/bin/env bash
# shopbuket1 — approved cleanup-plan helpers (Task 05).
# shellcheck shell=bash
#
# Cleanup migrations live under packages/database/prisma/cleanup-plans/<id>/migrations
# and are installed into prisma/migrations ONLY for an approved --cleanup-plan deploy.
# Never invent DROP statements from schema diff.

cleanup_plan_json_field() {
  local file="$1" key="$2"
  # Supports string and boolean (true/false without quotes).
  local line
  line="$(grep -E "\"${key}\"[[:space:]]*:" "$file" | head -n1 || true)"
  [[ -n "$line" ]] || return 0
  if echo "$line" | grep -qE ':[[:space:]]*(true|false)[[:space:],}]*$'; then
    echo "$line" | sed -n 's/.*:[[:space:]]*\(true\|false\).*/\1/p'
    return 0
  fi
  echo "$line" | sed -n 's/.*:[[:space:]]*"\([^"]*\)".*/\1/p'
}

assert_safe_cleanup_plan_id() {
  local id="$1"
  [[ "$id" =~ ^[a-z0-9][a-z0-9._-]*$ ]] || die "Unsafe cleanup plan id: $id"
}

load_cleanup_plan() {
  local path="$1"
  [[ -f "$path" ]] || die "Cleanup plan not found: $path"
  CLEANUP_PLAN_PATH="$path"
  CLEANUP_PLAN_ID="$(cleanup_plan_json_field "$path" id)"
  CLEANUP_PLAN_STATUS="$(cleanup_plan_json_field "$path" status)"
  CLEANUP_PLAN_TOKEN="$(cleanup_plan_json_field "$path" approvalToken)"
  CLEANUP_PLAN_MIG_REL="$(cleanup_plan_json_field "$path" migrationsRelDir)"
  CLEANUP_PLAN_REQUIRES_SEO="$(cleanup_plan_json_field "$path" requiresSeoReconcilePass)"
  CLEANUP_PLAN_REQUIRES_RESTORE="$(cleanup_plan_json_field "$path" requiresExplicitRestoreTest)"
  assert_safe_cleanup_plan_id "${CLEANUP_PLAN_ID:-}"
  [[ -n "$CLEANUP_PLAN_MIG_REL" ]] || die "Plan missing migrationsRelDir"
  [[ -n "$CLEANUP_PLAN_TOKEN" ]] || die "Plan missing approvalToken"
}

validate_cleanup_plan_approval() {
  local path="${CLEANUP_PLAN_PATH:?}"
  load_cleanup_plan "$path"
  if [[ "$CLEANUP_PLAN_STATUS" != "approved" ]]; then
    die "Cleanup plan status is '${CLEANUP_PLAN_STATUS}' (need approved). Edit ${path} only after explicit operator confirmation."
  fi
  local got="${SHOPBUKET1_CLEANUP_APPROVAL_TOKEN:-}"
  [[ -n "$got" ]] || die "Set SHOPBUKET1_CLEANUP_APPROVAL_TOKEN to the plan approvalToken (not committed)."
  if [[ "$got" != "$CLEANUP_PLAN_TOKEN" ]]; then
    die "SHOPBUKET1_CLEANUP_APPROVAL_TOKEN does not match plan approvalToken"
  fi
  local root mig_src
  root="$(repo_root)"
  mig_src="${root}/${CLEANUP_PLAN_MIG_REL}"
  [[ -d "$mig_src" ]] || die "Plan migrations directory missing: $mig_src"
  local count
  count="$(find "$mig_src" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
  [[ "$count" -ge 1 ]] || die "Plan has no migration folders under $mig_src"
  log "Cleanup plan OK: id=${CLEANUP_PLAN_ID} migrations=${count}"
}

# Copy plan migrations into prisma/migrations (idempotent if identical).
install_cleanup_plan_migrations() {
  local root mig_src mig_dst
  root="$(repo_root)"
  mig_src="${root}/${CLEANUP_PLAN_MIG_REL}"
  mig_dst="${root}/packages/database/prisma/migrations"
  [[ -d "$mig_dst" ]] || die "Missing $mig_dst"
  local src_dir base dest
  while IFS= read -r src_dir; do
    [[ -d "$src_dir" ]] || continue
    base="$(basename "$src_dir")"
    dest="${mig_dst}/${base}"
    if [[ -d "$dest" ]]; then
      if ! diff -rq "$src_dir" "$dest" >/dev/null 2>&1; then
        die "Cleanup migration ${base} already exists with different content — refuse overwrite"
      fi
      log "Cleanup migration already installed: ${base}"
      continue
    fi
    log "Installing cleanup migration ${base} into prisma/migrations"
    mkdir -p "$dest"
    cp -a "${src_dir}/." "$dest/"
  done < <(find "$mig_src" -mindepth 1 -maxdepth 1 -type d | sort)
}

# SQL gates for SEO drop (read-only). Fail closed on orphans / CRITICAL-like conditions.
cleanup_plan_seo_sql_gates() {
  log "Cleanup SEO SQL gates (read-only)"
  if ! table_exists_prod "seo_landing_pages"; then
    log "seo_landing_pages already absent — DROP migration will be no-op / already applied"
    return 0
  fi
  local orphans
  orphans="$(preflight_psql_prod "
    SELECT count(*)::int
    FROM seo_landing_pages s
    LEFT JOIN catalog_categories c
      ON c.slug = s.slug AND c.page_kind = 'THEMATIC'
    WHERE s.status = 'PUBLISHED' AND c.id IS NULL
  ")"
  orphans="$(echo "$orphans" | tr -d '[:space:]')"
  if [[ "$orphans" != "0" ]]; then
    die "Cleanup blocked: ${orphans} PUBLISHED seo_landing_pages slug(s) without THEMATIC catalog_categories"
  fi
  log "SEO SQL gate OK: no published orphan landings"
}

# diameter_cm pre-drop inventory (informational for normal migrate; blocking only if env set).
preflight_diameter_cm_inventory() {
  if ! table_exists_prod "products"; then
    return 0
  fi
  local col
  col="$(preflight_psql_prod "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='diameter_cm'")"
  col="$(echo "$col" | tr -d '[:space:]')"
  if [[ "$col" != "1" ]]; then
    log "products.diameter_cm already absent"
    return 0
  fi
  local n
  n="$(preflight_psql_prod "SELECT count(*)::int FROM products WHERE diameter_cm IS NOT NULL")"
  n="$(echo "$n" | tr -d '[:space:]')"
  log "Inventory products.diameter_cm non-null=${n} (will be dropped by 20261102010000)"
  if [[ "${SHOPBUKET1_BLOCK_DIAMETER_DROP_IF_DATA:-0}" == "1" && "$n" != "0" ]]; then
    die "Refusing diameter_cm drop: ${n} non-null row(s). Unset SHOPBUKET1_BLOCK_DIAMETER_DROP_IF_DATA to proceed."
  fi
}

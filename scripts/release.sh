#!/usr/bin/env bash
# shopbuket1 — two-stage release entry point (pull-based GitHub → server).
#
# Usage (on the production VPS, from the git checkout):
#   ./deploy.sh production [--dry-run] [git-ref]   # preferred one-command wrapper
#   ./scripts/release.sh production [git-ref]      # preflight + deploy
#   ./scripts/release.sh dry-run [git-ref]
#   ./scripts/release.sh preflight [git-ref]
#   ./scripts/release.sh deploy    [git-ref]
#   ./scripts/release.sh restore-test --dump <path> --db shopbuket1_preflight_<name>
#   ./scripts/release.sh releases
#   ./scripts/release.sh seo-reconcile
#   ./scripts/release.sh rollback  [release-metadata.json]
#   ./scripts/release.sh status
#
# Does NOT deploy from Cursor. Does NOT touch erpbuket1.
# Keeps the existing ./deploy.sh / ./backup.sh / ./rollback.sh / ./healthcheck.sh stack.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../deploy/lib/common.sh
source "${ROOT_DIR}/deploy/lib/common.sh"
# shellcheck source=../deploy/lib/nginx.sh
source "${ROOT_DIR}/deploy/lib/nginx.sh"
SHOPBUKET1_NGINX_LIB_LOADED=1
# shellcheck source=../deploy/lib/health.sh
source "${ROOT_DIR}/deploy/lib/health.sh"
# shellcheck source=../deploy/lib/preflight.sh
source "${ROOT_DIR}/deploy/lib/preflight.sh"
# shellcheck source=../deploy/lib/cleanup-plan.sh
source "${ROOT_DIR}/deploy/lib/cleanup-plan.sh"

export SHOPBUKET1_ENV_FILE="${SHOPBUKET1_ENV_FILE:-/etc/shopbuket1/production.env}"
export ROOT_DIR
# Optional: path set by ./deploy.sh production --cleanup-plan <file>
CLEANUP_PLAN_PATH="${SHOPBUKET1_CLEANUP_PLAN:-}"

CMD="${1:-}"
shift || true
# Remaining args: git-ref for most commands, or --dump/--db for restore-test.
REF="${1:-}"
RESTORE_DUMP=""
RESTORE_DB=""

usage() {
  cat <<'EOF'
Usage:
  ./deploy.sh production [--dry-run] [git-ref]
  ./deploy.sh production --cleanup-plan <approved-plan.json> [git-ref]
  ./scripts/release.sh production   [git-ref]
  ./scripts/release.sh dry-run      [git-ref]
  ./scripts/release.sh preflight    [git-ref]
  ./scripts/release.sh deploy       [git-ref]
  ./scripts/release.sh restore-test --dump <path> --db shopbuket1_preflight_<name>
  ./scripts/release.sh releases
  ./scripts/release.sh seo-reconcile
  ./scripts/release.sh rollback     [release-metadata.json]
  ./scripts/release.sh status
  ./scripts/release.sh seo-smoke

production    — preflight then deploy for the same commit SHA (non-interactive)
--cleanup-plan— deep cleanup: install ONLY the approved plan migrations (via env SHOPBUKET1_CLEANUP_PLAN)
dry-run       — strictly read-only plan (no git mutate, docker, backup, DB, release writes)
preflight     — backup + isolated migration rehearsal + PASS/FAIL report
deploy        — requires matching recent preflight PASS; then runs ./deploy.sh
restore-test  — FULL pg_restore into an EXPLICIT isolated DB (not TOC-only; never production)
releases      — list release metadata JSON (newest first)
seo-reconcile — read-only SEO legacy table counts (no DROP)
rollback      — application container rollback (DB not auto-restored)
status        — show current/previous release + latest preflight
seo-smoke     — post-deploy SEO route checks

Note: backup.sh pg_restore -l is structural validation only — not a restore-test.
Normal production never installs cleanup-plan migrations.
EOF
}

parse_restore_test_args() {
  RESTORE_DUMP=""
  RESTORE_DB=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dump)
        [[ $# -ge 2 ]] || die "restore-test: --dump requires a path"
        RESTORE_DUMP="$2"
        shift 2
        ;;
      --db)
        [[ $# -ge 2 ]] || die "restore-test: --db requires a database name"
        RESTORE_DB="$2"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "restore-test: unknown argument '$1' (need --dump PATH --db shopbuket1_preflight_NAME)"
        ;;
    esac
  done
  [[ -n "$RESTORE_DUMP" ]] || die "restore-test: --dump PATH is required (no automatic dump selection)"
  [[ -n "$RESTORE_DB" ]] || die "restore-test: --db shopbuket1_preflight_NAME is required (no automatic DB name)"
  assert_preflight_db_name "$RESTORE_DB"
}

resolve_release_ref() {
  # Reuse deploy.sh resolve_ref by sourcing carefully would run traps — call git here.
  cd "$ROOT_DIR"
  require_cmd git
  if [[ -n "$REF" ]]; then
    validate_git_ref "$REF"
    log "Fetching and checking out ref: $REF"
    git fetch --tags --prune origin 1>&2
    git rev-parse --verify "$REF^{commit}" >/dev/null
    git checkout --detach "$REF" 1>&2
  else
    local dirty branch
    dirty="$(git status --porcelain)"
    if [[ -n "$dirty" ]]; then
      printf '%s\n' "$dirty" >&2
      die "Working tree is dirty. Commit/stash, or pass an explicit ref."
    fi
    branch="$(git rev-parse --abbrev-ref HEAD)"
    if [[ "$branch" != "HEAD" ]]; then
      git fetch --tags --prune origin 1>&2
      if git show-ref --verify --quiet "refs/remotes/origin/${branch}"; then
        git pull --ff-only origin "$branch" 1>&2
      fi
    fi
  fi
  local sha
  sha="$(git rev-parse HEAD)"
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || die "Invalid HEAD SHA"
  printf '%s\n' "$sha"
}

ensure_api_image_for_migrate() {
  local rev="$1"
  local short="${rev:0:12}"
  local image="shopbuket1-api:${short}"
  if docker image inspect "$image" >/dev/null 2>&1; then
    export SHOPBUKET1_API_IMAGE="$image"
    log "Using existing API image $image"
    return 0
  fi
  if docker image inspect shopbuket1-api:local >/dev/null 2>&1; then
    export SHOPBUKET1_API_IMAGE="shopbuket1-api:local"
    log "Using shopbuket1-api:local for preflight migrate"
    return 0
  fi
  log "Building API image ${image} for migration rehearsal"
  docker build \
    -f "$ROOT_DIR/deploy/Dockerfile.api" \
    -t "$image" \
    -t shopbuket1-api:local \
    "$ROOT_DIR"
  export SHOPBUKET1_API_IMAGE="$image"
}

cmd_preflight() {
  acquire_lock
  preflight_require_tools
  [[ -f "$SHOPBUKET1_ENV_FILE" ]] || die "Missing $SHOPBUKET1_ENV_FILE"
  validate_production_env
  preflight_disk_ok

  # Nginx/domain gate (existing)
  local rc=0
  run_healthcheck_mode preflight || rc=$?
  [[ "$rc" -eq 0 ]] || die "Nginx/domain preflight failed: ${HEALTH_LAST_REASON:-unknown}"

  local rev
  rev="$(resolve_release_ref)"
  rev="${rev//$'\r'/}"
  log "Preflight revision ${rev}"

  preflight_postgres_ready
  ensure_database_url
  preflight_check_migration_conflicts
  preflight_diameter_cm_inventory

  local migrations_applied inventory backup rehearsal_db report
  migrations_applied="$(preflight_migration_status)"
  inventory="$(preflight_inventory_json)"
  backup="$(preflight_create_backup)"
  backup="$(echo "$backup" | tr -d '\r' | tail -n1)"

  rehearsal_db="shopbuket1_preflight_${rev:0:12}"
  assert_preflight_db_name "$rehearsal_db"

  ensure_api_image_for_migrate "$rev"

  local ok=1
  reason=""
  if ! preflight_create_rehearsal_db "$rehearsal_db"; then
    ok=0
    reason="create_rehearsal_db_failed"
  elif ! preflight_restore_dump "$rehearsal_db" "$backup"; then
    ok=0
    reason="restore_failed"
  elif ! preflight_migrate_rehearsal "$rehearsal_db"; then
    ok=0
    reason="migrate_failed"
  elif ! preflight_verify_rehearsal "$rehearsal_db"; then
    ok=0
    reason="verify_failed"
  fi

  # Always drop isolated DB after rehearsal (success or fail).
  preflight_drop_db_if_exists "$rehearsal_db" || true

  if [[ "$ok" -eq 1 ]]; then
    report="$(write_preflight_report "$rev" "PASS" "$backup" "$rehearsal_db" "$inventory" "$migrations_applied" "")"
    log "PREFLIGHT PASS for ${rev}"
    log "Review report: ${report}"
    log "Next: ./scripts/release.sh deploy ${rev}"
    exit 0
  fi

  report="$(write_preflight_report "$rev" "FAIL" "$backup" "$rehearsal_db" "$inventory" "$migrations_applied" "$reason")"
  die "PREFLIGHT FAIL (${reason}). Report: ${report}. Production schema was not modified."
}

cmd_deploy() {
  acquire_lock
  preflight_require_tools
  [[ -f "$SHOPBUKET1_ENV_FILE" ]] || die "Missing $SHOPBUKET1_ENV_FILE"
  validate_production_env

  local rev
  rev="$(resolve_release_ref)"
  rev="${rev//$'\r'/}"
  require_preflight_pass "$rev" >/dev/null

  log "Delegating to ./deploy.sh for revision ${rev}"
  # Release flock so deploy.sh can acquire the same lock file; pass SHA for determinism.
  exec 9>&- || true
  export SHOPBUKET1_REQUIRE_PREFLIGHT=1
  exec "$ROOT_DIR/deploy.sh" "$rev"
}

cmd_rollback() {
  exec "$ROOT_DIR/rollback.sh" "${REF:-}"
}

cmd_dry_run() {
  # Strictly read-only: no flock, git fetch/checkout/pull, docker, backup, DB, or release writes.
  log "=== DRY-RUN (production path) — strictly read-only ==="
  cd "$ROOT_DIR"
  require_cmd git
  local current target
  current="$(git rev-parse HEAD)"
  if [[ -n "$REF" ]]; then
    validate_git_ref "$REF"
    # rev-parse only — never fetch/checkout in dry-run.
    target="$(git rev-parse --verify "${REF}^{commit}")"
  else
    target="$current"
  fi
  log "Current HEAD:  ${current}"
  log "Target commit: ${target}"
  if [[ "$current" != "$target" ]]; then
    log "Note: live run would checkout/detach to ${target} (dry-run does not)"
  fi
  if [[ -f "$SHOPBUKET1_CURRENT_FILE" ]]; then
    local meta
    meta="$(tr -d '\r\n' <"$SHOPBUKET1_CURRENT_FILE" 2>/dev/null || true)"
    if [[ -n "$meta" && -f "$meta" ]]; then
      log "Live release:  $(json_field "$meta" revision)"
      log "  api_image=$(json_field "$meta" api_image)"
      log "  web_image=$(json_field "$meta" web_image)"
    fi
  else
    log "Live release:  (none recorded)"
  fi
  if [[ -f "${SHOPBUKET1_ENV_FILE}" ]]; then
    log "Env file: present (${SHOPBUKET1_ENV_FILE})"
  else
    log "Env file: MISSING (${SHOPBUKET1_ENV_FILE}) — live run would fail"
  fi
  local mig_dir="${ROOT_DIR}/packages/database/prisma/migrations"
  local mig_n=0
  if [[ -d "$mig_dir" ]]; then
    mig_n="$(find "$mig_dir" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
  fi
  log "Migration folders in checkout: ${mig_n}"
  if release_requires_erp_sku_registry; then
    log "Task 04A gate: erp_sku_registry verify is mandatory after migrate"
  fi
  if [[ -n "${CLEANUP_PLAN_PATH}" ]]; then
    log "Cleanup plan path: ${CLEANUP_PLAN_PATH}"
    if [[ -f "${CLEANUP_PLAN_PATH}" ]]; then
      load_cleanup_plan "${CLEANUP_PLAN_PATH}"
      log "Cleanup plan id=${CLEANUP_PLAN_ID} status=${CLEANUP_PLAN_STATUS} (dry-run does not install)"
    else
      log "Cleanup plan MISSING at path (live run would fail)"
    fi
  else
    log "Cleanup plan: none (normal deploy — SEO DROP migrations stay out of prisma/migrations)"
  fi
  cat <<EOF >&2
Planned stages for ./deploy.sh production ${REF:-}:
  1. flock ${SHOPBUKET1_LOCK_FILE}
  2. validate env + Nginx/domain preflight
  3. resolve git to ${target}
  4. check migration conflicts + inventory (+ diameter_cm inventory)
  5. ./backup.sh preflight → ${SHOPBUKET1_BACKUP_DIR} (TOC structural check only)
  6. restore + prisma migrate deploy on shopbuket1_preflight_<sha12> only
  7. verify rehearsal (erp_sku_registry table+PK mandatory); drop temp DB
  8. on PASS: build images, pre-migrate backup, live migrate, erp_sku live verify, switch api/web
  9. healthchecks; write release metadata; prune old images/metadata only
  On migrate failure: running app not switched.
  On health failure after schema advance: refuse auto app rollback (avoid schema mismatch).
Never: docker system prune --volumes, erpbuket1, ad-hoc schema DROP, DB auto-rollback.
Dry-run itself performs none of the stages above.
Cleanup DROP of seo_landing_* requires --cleanup-plan with status=approved + token.
EOF
  log "DRY-RUN complete — no changes made"
}

cmd_production() {
  # One-command: preflight then deploy for the same SHA. Non-interactive.
  log "Stage: production one-command (preflight → deploy)"
  acquire_lock
  preflight_require_tools
  [[ -f "$SHOPBUKET1_ENV_FILE" ]] || die "Missing $SHOPBUKET1_ENV_FILE"
  validate_production_env
  preflight_disk_ok

  local rc=0
  run_healthcheck_mode preflight || rc=$?
  [[ "$rc" -eq 0 ]] || die "Nginx/domain preflight failed: ${HEALTH_LAST_REASON:-unknown}"

  local rev
  rev="$(resolve_release_ref)"
  rev="${rev//$'\r'/}"
  log "Production pipeline revision ${rev}"

  preflight_postgres_ready
  ensure_database_url
  preflight_check_migration_conflicts
  preflight_diameter_cm_inventory

  # Approved cleanup-plan: install gated migrations before rehearsal/live migrate.
  if [[ -n "${CLEANUP_PLAN_PATH}" ]]; then
    log "Stage: cleanup-plan ${CLEANUP_PLAN_PATH}"
    load_cleanup_plan "${CLEANUP_PLAN_PATH}"
    validate_cleanup_plan_approval
    if [[ "${CLEANUP_PLAN_REQUIRES_RESTORE}" == "true" ]]; then
      [[ "${SHOPBUKET1_CLEANUP_RESTORE_TEST_OK:-0}" == "1" ]] \
        || die "Cleanup plan requires restore-test first. Run restore-test, then export SHOPBUKET1_CLEANUP_RESTORE_TEST_OK=1"
    fi
    if [[ "${CLEANUP_PLAN_REQUIRES_SEO}" == "true" ]]; then
      cleanup_plan_seo_sql_gates
    fi
    install_cleanup_plan_migrations
  fi

  local migrations_applied inventory backup rehearsal_db report
  migrations_applied="$(preflight_migration_status)"
  inventory="$(preflight_inventory_json)"
  backup="$(preflight_create_backup)"
  backup="$(echo "$backup" | tr -d '\r' | tail -n1)"

  rehearsal_db="shopbuket1_preflight_${rev:0:12}"
  assert_preflight_db_name "$rehearsal_db"
  ensure_api_image_for_migrate "$rev"

  local ok=1
  reason=""
  if ! preflight_create_rehearsal_db "$rehearsal_db"; then
    ok=0
    reason="create_rehearsal_db_failed"
  elif ! preflight_restore_dump "$rehearsal_db" "$backup"; then
    ok=0
    reason="restore_failed"
  elif ! preflight_migrate_rehearsal "$rehearsal_db"; then
    ok=0
    reason="migrate_failed"
  elif ! preflight_verify_rehearsal "$rehearsal_db"; then
    ok=0
    reason="verify_failed"
  fi
  preflight_drop_db_if_exists "$rehearsal_db" || true

  if [[ "$ok" -ne 1 ]]; then
    report="$(write_preflight_report "$rev" "FAIL" "$backup" "$rehearsal_db" "$inventory" "$migrations_applied" "$reason")"
    die "PREFLIGHT FAIL (${reason}). Report: ${report}. Production schema was not modified."
  fi
  report="$(write_preflight_report "$rev" "PASS" "$backup" "$rehearsal_db" "$inventory" "$migrations_applied" "")"
  log "PREFLIGHT PASS for ${rev} — continuing to deploy"
  log "Report: ${report}"

  # Release flock so deploy.sh can acquire the same lock.
  exec 9>&- || true
  export SHOPBUKET1_REQUIRE_PREFLIGHT=1
  # Pass SHA only — cleanup migrations already installed into prisma/migrations for this checkout.
  exec "$ROOT_DIR/deploy.sh" "$rev"
}

cmd_restore_test() {
  # Full restore proof on an EXPLICIT isolated DB. Never targets POSTGRES_DB.
  # Distinct from backup.sh TOC validation (pg_restore -l), which is structural only.
  parse_restore_test_args "$@"
  acquire_lock
  preflight_require_tools
  [[ -f "$SHOPBUKET1_ENV_FILE" ]] || die "Missing $SHOPBUKET1_ENV_FILE"
  load_env_file "$SHOPBUKET1_ENV_FILE"
  ensure_database_url
  preflight_postgres_ready
  preflight_disk_ok

  local dump="$RESTORE_DUMP"
  local db="$RESTORE_DB"
  [[ -f "$dump" ]] || die "Dump file not found: $dump"
  [[ "$db" != "$POSTGRES_DB" ]] || die "Refusing restore-test against production DB name"
  log "Restore-test dump: $dump"
  log "Restore-test isolated DB: $db (explicit; production=${POSTGRES_DB})"

  local size
  size="$(wc -c <"$dump" | tr -d ' ')"
  [[ "$size" -gt 1000 ]] || die "Dump too small (${size} bytes): $dump"
  log "Dump size ${size} bytes — proceeding to FULL pg_restore (TOC-only is insufficient)"

  if ! preflight_create_rehearsal_db "$db"; then
    die "restore-test: could not create ${db}"
  fi
  local failed=0
  if ! preflight_restore_dump "$db" "$dump"; then
    failed=1
  else
    local n
    n="$(preflight_psql_db "$db" "SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public'")"
    n="$(echo "$n" | tr -d '[:space:]')"
    log "Restore-test public tables: ${n}"
    if [[ ! "$n" =~ ^[0-9]+$ ]] || [[ "$n" -le 0 ]]; then
      failed=1
    fi
  fi
  preflight_drop_db_if_exists "$db" || true
  [[ "$failed" -eq 0 ]] || die "restore-test FAILED for $dump → ${db} (production DB untouched)"
  log "RESTORE-TEST PASS: full restore into ${db} succeeded; temp DB dropped; production untouched"
}

cmd_releases() {
  list_release_metadata
}

cmd_seo_reconcile() {
  [[ -f "$SHOPBUKET1_ENV_FILE" ]] || die "Missing $SHOPBUKET1_ENV_FILE"
  load_env_file "$SHOPBUKET1_ENV_FILE"
  preflight_postgres_ready
  seo_reconcile_report
}

cmd_status() {
  echo "SHOPBUKET1_ENV_FILE=${SHOPBUKET1_ENV_FILE}"
  echo "BACKUP_DIR=${SHOPBUKET1_BACKUP_DIR}"
  echo "STATE_DIR=${SHOPBUKET1_STATE_DIR}"
  if [[ -f "$SHOPBUKET1_CURRENT_FILE" ]]; then
    local cur
    cur="$(tr -d '\r\n' <"$SHOPBUKET1_CURRENT_FILE")"
    echo "CURRENT_META=${cur}"
    if [[ -f "$cur" ]]; then
      echo "  revision=$(json_field "$cur" revision)"
      echo "  api_image=$(json_field "$cur" api_image)"
      echo "  web_image=$(json_field "$cur" web_image)"
      echo "  deployed_at=$(json_field "$cur" deployed_at)"
    fi
  else
    echo "CURRENT_META=(none)"
  fi
  if [[ -f "$SHOPBUKET1_PREVIOUS_FILE" ]]; then
    local prev
    prev="$(tr -d '\r\n' <"$SHOPBUKET1_PREVIOUS_FILE")"
    echo "PREVIOUS_META=${prev}"
  else
    echo "PREVIOUS_META=(none)"
  fi
  if [[ -f "${SHOPBUKET1_PREFLIGHT_DIR}/latest" ]]; then
    local pf
    pf="$(tr -d '\r\n' <"${SHOPBUKET1_PREFLIGHT_DIR}/latest")"
    echo "LATEST_PREFLIGHT=${pf}"
    if [[ -f "$pf" ]]; then
      echo "  status=$(json_field "$pf" status)"
      echo "  revision=$(json_field "$pf" revision)"
      echo "  checked_at=$(json_field "$pf" checked_at)"
    fi
  else
    echo "LATEST_PREFLIGHT=(none)"
  fi
}

# Non-mutating SEO/route smoke against local loopback (post-deploy).
cmd_seo_smoke() {
  require_cmd curl
  local base="${SHOPBUKET1_SMOKE_BASE:-http://127.0.0.1:3000}"
  local fail=0
  check_code() {
    local path="$1" expect="$2"
    local code
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "${base}${path}" || echo 000)"
    if [[ "$code" == "$expect" ]]; then
      log "OK  ${path} → ${code}"
    else
      log "FAIL ${path} → ${code} (want ${expect})"
      fail=1
    fi
  }
  check_redirect() {
    local path="$1" expect_loc_substr="$2"
    local code loc
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "${base}${path}" || echo 000)"
    loc="$(curl -sS -o /dev/null -w '%{redirect_url}' --max-time 15 "${base}${path}" || true)"
    if [[ "$code" =~ ^30[18]$ ]] && [[ "$loc" == *"$expect_loc_substr"* ]]; then
      log "OK  ${path} → ${code} ${loc}"
    else
      # Next may return 308; also accept Location header via -D
      local headers
      headers="$(curl -sS -D - -o /dev/null --max-time 15 "${base}${path}" || true)"
      if echo "$headers" | grep -qiE '^HTTP/.* 30[18]' \
        && echo "$headers" | grep -qi "location:.*${expect_loc_substr}"; then
        log "OK  ${path} redirect contains ${expect_loc_substr}"
      else
        log "FAIL ${path} redirect (code=${code} loc=${loc})"
        fail=1
      fi
    fi
  }

  check_code "/" "200"
  check_code "/catalog" "200"
  check_code "/catalog/bouquets" "200"
  check_code "/catalog/stems" "200"
  check_code "/sitemap.xml" "200"
  check_code "/robots.txt" "200"
  check_redirect "/bukety" "/catalog/bouquets"
  check_redirect "/cvety" "/catalog/stems"
  check_redirect "/katalog" "/catalog"

  # Sitemap must not advertise legacy product hubs.
  local sm
  sm="$(curl -fsS --max-time 20 "${base}/sitemap.xml" || true)"
  if echo "$sm" | grep -qE '/bukety/|/katalog/|/cvety/'; then
    log "FAIL sitemap contains legacy catalog paths"
    fail=1
  else
    log "OK  sitemap has no /bukety|/katalog|/cvety product paths"
  fi

  [[ "$fail" -eq 0 ]] || die "SEO smoke failed"
  log "SEO smoke PASS"
}

main() {
  case "$CMD" in
    production) cmd_production ;;
    dry-run) cmd_dry_run ;;
    preflight) cmd_preflight ;;
    deploy) cmd_deploy ;;
    restore-test) cmd_restore_test "$@" ;;
    releases) cmd_releases ;;
    seo-reconcile) cmd_seo_reconcile ;;
    rollback) cmd_rollback ;;
    status) cmd_status ;;
    seo-smoke) cmd_seo_smoke ;;
    -h|--help|help|"") usage; [[ -n "$CMD" ]] || exit 1; exit 0 ;;
    *) usage; die "Unknown command: $CMD" ;;
  esac
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi

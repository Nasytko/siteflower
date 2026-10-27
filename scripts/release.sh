#!/usr/bin/env bash
# shopbuket1 — two-stage release entry point (pull-based GitHub → server).
#
# Usage (on the production VPS, from the git checkout):
#   ./scripts/release.sh preflight [git-ref]
#   ./scripts/release.sh deploy    [git-ref]
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

export SHOPBUKET1_ENV_FILE="${SHOPBUKET1_ENV_FILE:-/etc/shopbuket1/production.env}"
export ROOT_DIR

CMD="${1:-}"
REF="${2:-}"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/release.sh preflight [git-ref]
  ./scripts/release.sh deploy    [git-ref]
  ./scripts/release.sh rollback  [release-metadata.json]
  ./scripts/release.sh status
  ./scripts/release.sh seo-smoke

preflight  — backup + isolated migration rehearsal + PASS/FAIL report (no live schema change)
deploy     — requires matching recent preflight PASS; then runs ./deploy.sh
rollback   — application container rollback via ./rollback.sh (DB not auto-restored)
status     — show current/previous release + latest preflight
seo-smoke  — post-deploy SEO route checks (catalog URLs, redirects, sitemap)
EOF
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
    preflight) cmd_preflight ;;
    deploy) cmd_deploy ;;
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

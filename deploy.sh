#!/usr/bin/env bash
# shopbuket1 — normal application deployment (does NOT reinstall the VPS).
# Usage:
#   ./deploy.sh staging [--dry-run] [git-ref]      # VPS/dev-staging: backup + migrate + switch (no rehearsal DB)
#   ./deploy.sh production [--dry-run] [git-ref]   # future production: preflight rehearsal then deploy
#   ./deploy.sh [--dry-run] [git-ref]              # direct deploy (prefer release preflight)
#   ./deploy.sh --help
#
# Never runs docker system prune --volumes.
# Never deletes erpbuket1 or other non-shopbuket1 Docker resources.
# Never auto-rolls back PostgreSQL.
# Never prisma migrate reset / db push / DROP DATABASE.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib/common.sh
source "${SCRIPT_DIR}/deploy/lib/common.sh"
# shellcheck source=deploy/lib/nginx.sh
source "${SCRIPT_DIR}/deploy/lib/nginx.sh"
SHOPBUKET1_NGINX_LIB_LOADED=1
# shellcheck source=deploy/lib/health.sh
source "${SCRIPT_DIR}/deploy/lib/health.sh"
# shellcheck source=deploy/lib/migrate-image.sh
source "${SCRIPT_DIR}/deploy/lib/migrate-image.sh"

# Compose file interpolates ${SHOPBUKET1_ENV_FILE}; always export the default path.
export SHOPBUKET1_ENV_FILE="${SHOPBUKET1_ENV_FILE:-/etc/shopbuket1/production.env}"

MODE=""
DRY_RUN=0
REF=""
CLEANUP_PLAN=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    staging) MODE="staging"; shift ;;
    production) MODE="production"; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --cleanup-plan)
      [[ $# -ge 2 ]] || die "--cleanup-plan requires a path to an approved plan JSON"
      CLEANUP_PLAN="$2"
      shift 2
      ;;
    -h|--help|help)
      cat <<'EOF'
Usage:
  ./deploy.sh staging [--dry-run] [git-ref]
  ./deploy.sh production [--dry-run] [git-ref]
  ./deploy.sh production --cleanup-plan <approved-plan.json> [git-ref]
  ./deploy.sh [--dry-run] [git-ref]

staging        — update current VPS/dev stack: backup + verified SHA image + migrate on
                 current DB + switch api/web (NO isolated rehearsal DB)
production     — future prod path: preflight rehearsal then deploy (strict)
--cleanup-plan — deep cleanup: only a prepared+approved plan's migrations (never ad-hoc DROP)
--dry-run      — print current/target SHA and planned stages; no mutate
<git-ref>      — optional explicit commit SHA / tag / branch (validated)

Forbidden: prisma migrate reset, db push, DROP DATABASE, docker volume prune.
Also see: ./scripts/release.sh {preflight|deploy|status|releases|restore-test|rollback}
EOF
      exit 0
      ;;
    *)
      if [[ -z "$REF" ]]; then
        REF="$1"
        shift
      else
        die "Unexpected argument: $1"
      fi
      ;;
  esac
done
export SHOPBUKET1_CLEANUP_PLAN="${CLEANUP_PLAN}"

NEW_API_IMAGE=""
NEW_WEB_IMAGE=""
PREV_API_IMAGE=""
PREV_WEB_IMAGE=""
# Immutable API image id pinned by preflight (rehearsal); live migrate must reuse it.
PREFLIGHT_PINNED_API_IMAGE_ID=""
# Set only after containers are about to be replaced (rollback applies then).
DEPLOY_STARTED=0
DEPLOY_INTERRUPTED=0
# Set after successful live migrate in this process — blocks unsafe app-image rollback.
SCHEMA_ADVANCED=0

rollback_app_images() {
  if [[ "${SCHEMA_ADVANCED:-0}" -eq 1 ]]; then
    log "Refusing automatic app-image rollback: live schema was advanced by this deploy."
    log "Previous images may be incompatible with the current DB. Prefer a forward fix."
    log "DB restore requires explicit operator approval — not performed here."
    return 1
  fi
  if [[ -z "${PREV_API_IMAGE:-}" || -z "${PREV_WEB_IMAGE:-}" ]]; then
    log "No previous release images recorded — cannot auto-rollback containers"
    return 0
  fi
  assert_shopbuket1_owned_name "$PREV_API_IMAGE" "image"
  assert_shopbuket1_owned_name "$PREV_WEB_IMAGE" "image"
  log "Rolling back containers to ${PREV_API_IMAGE} / ${PREV_WEB_IMAGE}"
  export SHOPBUKET1_API_IMAGE="$PREV_API_IMAGE"
  export SHOPBUKET1_WEB_IMAGE="$PREV_WEB_IMAGE"
  compose up -d api web || true
}

on_err() {
  local code=$?
  if [[ "$DEPLOY_INTERRUPTED" -eq 1 ]]; then
    exit "$code"
  fi
  if [[ "$DEPLOY_STARTED" -eq 1 ]]; then
    log "Deploy failed after container switch (exit ${code})."
    log "Database migrations are NOT reverted automatically."
    if ! rollback_app_images; then
      log "Left new containers in place (or failed switch) to avoid schema/app mismatch."
    fi
  else
    log "Deploy aborted early (exit ${code}) before container switch — running app untouched."
  fi
  exit "$code"
}

on_interrupt() {
  DEPLOY_INTERRUPTED=1
  log "Deploy interrupted (SIGINT/SIGTERM). Lock will release on process exit."
  if [[ "$DEPLOY_STARTED" -eq 1 ]]; then
    log "Interrupt after container switch — evaluating app rollback safety."
    rollback_app_images || true
  else
    log "Interrupt before container switch — running app untouched."
  fi
  exit 130
}

trap on_err ERR
trap on_interrupt INT TERM

require_docker_access() {
  require_cmd docker
  docker info >/dev/null 2>&1 || die "Docker not reachable (join 'docker' group or use sudo carefully)"
}

resolve_ref() {
  # Prints ONLY the commit SHA on stdout. All diagnostics go via log/die → stderr
  # so callers can safely use: rev="$(resolve_ref)"
  cd "$SCRIPT_DIR"
  require_cmd git
  if [[ -n "$REF" ]]; then
    validate_git_ref "$REF"
    log "Fetching and checking out ref: $REF"
    git fetch --tags --prune origin 1>&2
    git rev-parse --verify "$REF^{commit}" >/dev/null
    git checkout --detach "$REF" 1>&2
  else
    local dirty
    dirty="$(git status --porcelain)"
    if [[ -n "$dirty" ]]; then
      log "Dirty paths:"
      printf '%s\n' "$dirty" >&2
      die "Working tree is dirty. Commit/stash mode changes, or deploy an explicit ref: ./deploy.sh <sha>"
    fi
    local branch
    branch="$(git rev-parse --abbrev-ref HEAD)"
    if [[ "$branch" != "HEAD" ]]; then
      log "Fetching origin/${branch}"
      git fetch --tags --prune origin 1>&2
      if git show-ref --verify --quiet "refs/remotes/origin/${branch}"; then
        git pull --ff-only "origin" "$branch" 1>&2
      else
        log "No origin/${branch} remote-tracking branch — using local HEAD"
      fi
    fi
  fi
  local sha
  sha="$(git rev-parse HEAD)"
  if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
    die "git rev-parse HEAD returned invalid SHA: ${sha}"
  fi
  printf '%s\n' "$sha"
}

tag_images() {
  local rev="$1"
  if [[ ! "$rev" =~ ^[0-9a-f]{40}$ ]]; then
    die "tag_images expects a 40-char commit SHA, got: ${rev}"
  fi
  local short="${rev:0:12}"
  NEW_API_IMAGE="shopbuket1-api:${short}"
  NEW_WEB_IMAGE="shopbuket1-web:${short}"
  assert_shopbuket1_owned_name "$NEW_API_IMAGE" "image"
  assert_shopbuket1_owned_name "$NEW_WEB_IMAGE" "image"
  export SHOPBUKET1_API_IMAGE="$NEW_API_IMAGE"
  export SHOPBUKET1_WEB_IMAGE="$NEW_WEB_IMAGE"
}

remember_previous_images() {
  if [[ -f "$SHOPBUKET1_CURRENT_FILE" ]]; then
    local meta
    meta="$(cat "$SHOPBUKET1_CURRENT_FILE" 2>/dev/null || true)"
    if [[ -n "$meta" && -f "$meta" ]]; then
      PREV_API_IMAGE="$(json_field "$meta" api_image || true)"
      PREV_WEB_IMAGE="$(json_field "$meta" web_image || true)"
    fi
  fi
}

build_images() {
  local rev_for_label="${rev:-}"
  [[ "$rev_for_label" =~ ^[0-9a-f]{40}$ ]] || die "build_images requires deploy revision SHA in scope"

  # Prefer the immutable image already pinned in preflight (same commit).
  # Never treat unverified shopbuket1-api:local as the migrate source of truth.
  if [[ -n "${PREFLIGHT_PINNED_API_IMAGE_ID:-}" ]]; then
    if ! docker image inspect "$PREFLIGHT_PINNED_API_IMAGE_ID" >/dev/null 2>&1; then
      die "Preflight-pinned API image id ${PREFLIGHT_PINNED_API_IMAGE_ID} unavailable — re-run preflight"
    fi
    if ! docker image inspect "$NEW_API_IMAGE" >/dev/null 2>&1 \
      || [[ "$(docker_image_id "$NEW_API_IMAGE")" != "$PREFLIGHT_PINNED_API_IMAGE_ID" ]]; then
      die "Preflight-pinned API image id ${PREFLIGHT_PINNED_API_IMAGE_ID} is not tagged as ${NEW_API_IMAGE} — re-run preflight"
    fi
    export SHOPBUKET1_API_IMAGE_ID="$PREFLIGHT_PINNED_API_IMAGE_ID"
    export SHOPBUKET1_API_IMAGE="$NEW_API_IMAGE"
    export SHOPBUKET1_API_IMAGE_TAG="$NEW_API_IMAGE"
    export SHOPBUKET1_API_IMAGE_GIT_SHA="$rev_for_label"
    # Full re-verify: id + OCI git SHA + migration manifest
    assert_pinned_api_image "$rev_for_label"
    log "Reusing preflight-pinned API image ${NEW_API_IMAGE} id=${PREFLIGHT_PINNED_API_IMAGE_ID}"
    cleanup_stale_api_local_alias "$NEW_API_IMAGE"
    sync_api_local_alias "$NEW_API_IMAGE"
  elif release_api_image_usable "$NEW_API_IMAGE" "$rev_for_label"; then
    log "Reusing verified API image ${NEW_API_IMAGE} after full label+manifest check"
    cleanup_stale_api_local_alias "$NEW_API_IMAGE"
    sync_api_local_alias "$NEW_API_IMAGE"
    pin_release_api_image_identity "$NEW_API_IMAGE" "$rev_for_label"
  else
    log "Building API image ${NEW_API_IMAGE} (SITEFLOWER_GIT_SHA=${rev_for_label})"
    docker build \
      -f "$SCRIPT_DIR/deploy/Dockerfile.api" \
      --build-arg "SITEFLOWER_GIT_SHA=${rev_for_label}" \
      -t "$NEW_API_IMAGE" \
      "$SCRIPT_DIR"
    pin_release_api_image_identity "$NEW_API_IMAGE" "$rev_for_label"
  fi
  export SHOPBUKET1_API_IMAGE="$NEW_API_IMAGE"

  log "Building Web image ${NEW_WEB_IMAGE}"
  docker build \
    -f "$SCRIPT_DIR/deploy/Dockerfile.web" \
    --build-arg "API_URL=http://api:3001" \
    --build-arg "NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}" \
    --build-arg "S3_PUBLIC_BASE_URL=${S3_PUBLIC_BASE_URL:-}" \
    --build-arg "MEDIA_PUBLIC_BASE_URL=${MEDIA_PUBLIC_BASE_URL:-}" \
    -t "$NEW_WEB_IMAGE" \
    -t shopbuket1-web:local \
    "$SCRIPT_DIR"
}

backup_before_migrate() {
  local label="${1:-pre-migrate}"
  log "Taking pre-migrate PostgreSQL backup (label=${label})"
  "$SCRIPT_DIR/backup.sh" "$label"
}

migrate() {
  local image="${SHOPBUKET1_API_IMAGE:-}"
  local live_id rev_for_label="${rev:-}"
  [[ -n "$image" ]] || die "SHOPBUKET1_API_IMAGE unset before live migrate"
  [[ "$image" == "$NEW_API_IMAGE" ]] \
    || die "Live migrate image (${image}) must equal release tag (${NEW_API_IMAGE})"
  [[ "$rev_for_label" =~ ^[0-9a-f]{40}$ ]] || die "migrate requires deploy revision SHA"
  export SHOPBUKET1_API_IMAGE_GIT_SHA="$rev_for_label"
  assert_pinned_api_image "$rev_for_label"
  live_id="$(docker_image_id "$SHOPBUKET1_API_IMAGE_ID")"
  if [[ -n "${PREFLIGHT_PINNED_API_IMAGE_ID:-}" ]]; then
    [[ "$live_id" == "$PREFLIGHT_PINNED_API_IMAGE_ID" ]] \
      || die "Live migrate image id (${live_id}) != preflight-pinned id (${PREFLIGHT_PINNED_API_IMAGE_ID})"
  fi
  log "Running prisma migrate deploy via immutable id=${live_id} (tag=${image})"
  # DEPLOY_STARTED is still 0 — migrate failure leaves production API/Web untouched.
  compose_migrate_with_pinned_api_image "${DATABASE_URL}"
  SCHEMA_ADVANCED=1
  log "Live migrate finished — SCHEMA_ADVANCED=1 (auto app rollback disabled)"
}

# Post-migrate gate before switching api/web.
# Uses live catalog/_prisma_migrations — not migrate deploy exit code alone.
post_migrate_verify() {
  # shellcheck source=deploy/lib/preflight.sh
  source "${SCRIPT_DIR}/deploy/lib/preflight.sh"
  log "Stage: verify live schema state (migrations + erp_sku + payment/telegram)"
  verify_live_schema_state || die "Live schema state verification failed — refusing container switch"
}

bring_up() {
  log "Starting shopbuket1 stack"
  compose up -d postgres
  compose up -d --force-recreate api web
  if [[ "${INTEGRATION_ENABLED:-false}" == "true" && "${INTEGRATION_MODE:-DISABLED}" != "DISABLED" ]]; then
    log "Integrations enabled — starting worker profile"
    compose --profile integrations up -d --force-recreate worker
  fi
}

# Static domain/Nginx checks before build/migrate (permanent failures only).
preflight_storefront() {
  log "Stage: preflight storefront (domain + Nginx site/HSTS/cert)"
  local rc=0
  run_healthcheck_mode preflight || rc=$?
  if [[ "$rc" -ne 0 ]]; then
    die "Preflight failed (exit ${rc}): ${HEALTH_LAST_REASON:-fix production.env / shopbuket1 Nginx site for ${SHOPBUKET1_CANONICAL_PUBLIC_HOST}}. No containers were switched."
  fi
  log "Preflight OK for ${SHOPBUKET1_CANONICAL_PUBLIC_HOST}"
}

# Wait until local containers answer (502/starting = retry).
wait_startup_ready() {
  local i rc max_attempts="${SHOPBUKET1_STARTUP_ATTEMPTS:-36}"
  local sleep_s="${SHOPBUKET1_STARTUP_SLEEP_SECONDS:-5}"
  log "Waiting for startup readiness (up to ${max_attempts}×${sleep_s}s)"
  for i in $(seq 1 "$max_attempts"); do
    rc=0
    SHOPBUKET1_HEALTH_QUIET=1 run_healthcheck_mode startup || rc=$?
    if [[ "$rc" -eq 0 ]]; then
      log "Startup ready (attempt ${i}/${max_attempts})"
      return 0
    fi
    if [[ "$rc" -eq 2 ]]; then
      die "Startup hit a permanent error (attempt ${i}): ${HEALTH_LAST_REASON:-unknown}"
    fi
    log "Startup not ready yet (${i}/${max_attempts}): ${HEALTH_LAST_REASON:-containers warming}; retry in ${sleep_s}s"
    sleep "$sleep_s"
  done
  # One verbose dump for diagnosis.
  run_healthcheck_mode startup || true
  die "Startup readiness timed out after ${max_attempts} attempts. Last: ${HEALTH_LAST_REASON:-unknown}. Check: docker logs shopbuket1-web --tail 80"
}

# Final public HTTPS/HSTS gate; short retry for residual 502 only.
wait_production_healthy() {
  local i rc max_attempts="${SHOPBUKET1_PRODUCTION_ATTEMPTS:-12}"
  local sleep_s="${SHOPBUKET1_PRODUCTION_SLEEP_SECONDS:-5}"
  log "Running production healthcheck (up to ${max_attempts}×${sleep_s}s)"
  for i in $(seq 1 "$max_attempts"); do
    rc=0
    run_healthcheck_mode production || rc=$?
    if [[ "$rc" -eq 0 ]]; then
      log "Production healthcheck OK (attempt ${i}/${max_attempts})"
      return 0
    fi
    if [[ "$rc" -eq 2 ]]; then
      die "Production healthcheck permanent failure (attempt ${i}): ${HEALTH_LAST_REASON:-fix Nginx/HSTS/domain}. ERP was not modified."
    fi
    log "Production not ready yet (${i}/${max_attempts}): ${HEALTH_LAST_REASON:-transient}; retry in ${sleep_s}s"
    sleep "$sleep_s"
  done
  die "Production healthcheck timed out after ${max_attempts} attempts. Last: ${HEALTH_LAST_REASON:-unknown}"
}

prune_old_shopbuket1_images() {
  log "Pruning old shopbuket1 images only (keeping newest 5 tags each; never erpbuket1)"
  local repo
  for repo in shopbuket1-api shopbuket1-web; do
    assert_shopbuket1_owned_name "$repo" "image-repo"
    docker images "$repo" --format '{{.CreatedAt}} {{.Repository}}:{{.Tag}} {{.ID}}' \
      | sort -r \
      | awk 'NR>5 {print $NF, $(NF-1)}' \
      | while read -r id ref; do
          assert_shopbuket1_owned_name "${ref%%:*}" "image-repo"
          docker image rm "$id" 2>/dev/null || true
        done
  done
}

# Peek target SHA without checkout/fetch mutation when possible.
peek_target_sha() {
  cd "$SCRIPT_DIR"
  require_cmd git
  if [[ -n "$REF" ]]; then
    validate_git_ref "$REF"
    git rev-parse --verify "${REF}^{commit}" 2>/dev/null || die "Cannot resolve ref for dry-run: $REF"
    return 0
  fi
  git rev-parse HEAD
}

cmd_dry_run_direct() {
  log "=== DRY-RUN (direct deploy path) — no backup / migrate / build / switch ==="
  local current target
  current="$(git -C "$SCRIPT_DIR" rev-parse HEAD 2>/dev/null || echo unknown)"
  target="$(peek_target_sha)"
  target="${target//$'\r'/}"
  log "Current HEAD:  ${current}"
  log "Target commit: ${target}"
  if [[ -f "$SHOPBUKET1_CURRENT_FILE" ]]; then
    local meta
    meta="$(tr -d '\r\n' <"$SHOPBUKET1_CURRENT_FILE" 2>/dev/null || true)"
    if [[ -n "$meta" && -f "$meta" ]]; then
      log "Live release:  $(json_field "$meta" revision) ($(json_field "$meta" api_image))"
    fi
  else
    log "Live release:  (no current-release pointer)"
  fi
  cat <<EOF >&2
Planned stages (would run without --dry-run):
  1. acquire flock ${SHOPBUKET1_LOCK_FILE}
  2. validate ${SHOPBUKET1_ENV_FILE}
  3. Nginx/domain preflight
  4. resolve/checkout target ${target}
  5. docker build shopbuket1-api / shopbuket1-web
  6. pg_dump via ./backup.sh pre-migrate → ${SHOPBUKET1_BACKUP_DIR}
  7. prisma migrate deploy (live DB — irreversible automatically)
  8. recreate api/web (+ worker if integrations)
  9. startup + production healthchecks
 10. write release metadata; prune old shopbuket1 images + release JSON
On health failure after switch: app rollback only if schema was NOT advanced; DB never auto-restored.
Read-only dry-run: no flock, git checkout/fetch, docker, backup, migrate, or release writes.
EOF
  log "DRY-RUN complete — no changes made"
}

cmd_dry_run_staging() {
  log "=== DRY-RUN (staging path) — strictly read-only ==="
  local current target
  current="$(git -C "$SCRIPT_DIR" rev-parse HEAD 2>/dev/null || echo unknown)"
  target="$(peek_target_sha)"
  target="${target//$'\r'/}"
  log "Current HEAD:  ${current}"
  log "Target commit: ${target}"
  log "Env file:      ${SHOPBUKET1_ENV_FILE}"
  log "Migrate image: shopbuket1-api:${target:0:12} (OCI git SHA + migration manifest required)"
  log "Rehearsal DB:  SKIPPED on staging (migrate runs on current POSTGRES_DB after backup)"
  cat <<EOF >&2
Planned staging stages for ./deploy.sh staging ${REF:-}:
  1. flock ${SHOPBUKET1_LOCK_FILE}
  2. validate ${SHOPBUKET1_ENV_FILE} + Nginx/domain preflight
  3. resolve/checkout ${target}
  4. build/reuse shopbuket1-api:<sha12> with SITEFLOWER_GIT_SHA + migration manifest check
  5. build shopbuket1-web:<sha12>
  6. ./backup.sh staging-pre-migrate (mandatory)
  7. prisma migrate deploy on CURRENT staging DB via pinned immutable image id
  8. verify live schema (erp_sku + required migrations)
  9. recreate api/web; startup + healthchecks
 10. write release metadata; prune old shopbuket1 images
Skipped vs production: isolated shopbuket1_preflight_* rehearsal DB.
Forbidden: migrate reset, db push, DROP DATABASE, volume prune, auto PG rollback.
Dry-run itself performs none of the stages above.
EOF
  log "DRY-RUN complete — no changes made"
}

# Staging/dev VPS path: same compose stack + current DB; no isolated rehearsal.
cmd_staging() {
  log "Stage: staging deploy (no isolated rehearsal DB)"
  acquire_lock
  require_docker_access
  [[ -f "$SHOPBUKET1_ENV_FILE" ]] || die "Missing $SHOPBUKET1_ENV_FILE — run sudo ./install.sh and edit secrets"
  validate_production_env
  preflight_storefront
  remember_previous_images

  local rev
  rev="$(resolve_ref)"
  rev="${rev//$'\r'/}"
  rev="$(printf '%s' "$rev" | tr -d '\n')"
  [[ "$rev" =~ ^[0-9a-f]{40}$ ]] || die "resolve_ref returned invalid revision: ${rev}"
  log "Staging revision ${rev}"

  tag_images "$rev"
  # Build/verify API image from target SHA (manifest + OCI label). No rehearsal DB.
  ensure_release_api_image "$rev"
  PREFLIGHT_PINNED_API_IMAGE_ID="${SHOPBUKET1_API_IMAGE_ID}"
  [[ -n "$PREFLIGHT_PINNED_API_IMAGE_ID" ]] || die "Staging API image was not pinned"
  log "Stage: build images (reuse pinned API id=${PREFLIGHT_PINNED_API_IMAGE_ID})"
  build_images

  compose up -d postgres
  local i
  for i in $(seq 1 30); do
    if docker inspect -f '{{.State.Health.Status}}' shopbuket1-postgres 2>/dev/null | grep -qx healthy; then
      break
    fi
    sleep 2
  done

  log "Stage: mandatory staging DB backup before migrate"
  backup_before_migrate "staging-pre-migrate"
  # Migrate current staging DB while DEPLOY_STARTED=0 (running api/web unchanged on failure).
  migrate
  post_migrate_verify

  DEPLOY_STARTED=1
  bring_up
  wait_startup_ready
  wait_production_healthy

  write_release_metadata "$rev" "$NEW_API_IMAGE" "$NEW_WEB_IMAGE"
  prune_release_metadata
  prune_old_shopbuket1_images

  log "Staging deploy succeeded: $rev (image=${NEW_API_IMAGE} id=${SHOPBUKET1_API_IMAGE_ID:-})"
}

main() {
  # Future production path: strict preflight rehearsal then deploy.
  if [[ "$MODE" == "production" ]]; then
    if [[ -n "${CLEANUP_PLAN}" ]]; then
      export SHOPBUKET1_CLEANUP_PLAN="$CLEANUP_PLAN"
    fi
    if [[ "$DRY_RUN" -eq 1 ]]; then
      exec bash "${SCRIPT_DIR}/scripts/release.sh" dry-run ${REF:+"$REF"}
    fi
    exec bash "${SCRIPT_DIR}/scripts/release.sh" production ${REF:+"$REF"}
  fi

  if [[ "$MODE" == "staging" ]]; then
    [[ -z "${CLEANUP_PLAN}" ]] || die "--cleanup-plan is only valid with: ./deploy.sh production --cleanup-plan <plan>"
    if [[ "$DRY_RUN" -eq 1 ]]; then
      cmd_dry_run_staging
      exit 0
    fi
    cmd_staging
    exit 0
  fi

  if [[ -n "${CLEANUP_PLAN}" ]]; then
    die "--cleanup-plan is only valid with: ./deploy.sh production --cleanup-plan <plan>"
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    cmd_dry_run_direct
    exit 0
  fi

  log "Stage: acquire deploy lock"
  acquire_lock
  log "Stage: require Docker access"
  require_docker_access
  [[ -f "$SHOPBUKET1_ENV_FILE" ]] || die "Missing $SHOPBUKET1_ENV_FILE — run sudo ./install.sh and edit secrets"
  log "Stage: validate production env ($SHOPBUKET1_ENV_FILE)"
  validate_production_env

  # Catch wrong domain / missing HSTS / bad site file before build or migrate.
  preflight_storefront

  log "Stage: remember previous release images"
  remember_previous_images

  local rev
  log "Stage: resolve git revision"
  rev="$(resolve_ref)"
  rev="${rev//$'\r'/}"
  rev="$(printf '%s' "$rev" | tr -d '\n')"
  [[ "$rev" =~ ^[0-9a-f]{40}$ ]] || die "resolve_ref returned invalid revision: ${rev}"
  log "Deploying revision $rev"

  # Prefer the two-stage path: ./scripts/release.sh preflight && ./scripts/release.sh deploy
  # Direct ./deploy.sh still works; set SHOPBUKET1_REQUIRE_PREFLIGHT=1 to enforce.
  # ./deploy.sh production always requires preflight via release.sh.
  if [[ "${SHOPBUKET1_REQUIRE_PREFLIGHT:-0}" == "1" ]]; then
    # shellcheck source=deploy/lib/preflight.sh
    source "${SCRIPT_DIR}/deploy/lib/preflight.sh"
    require_preflight_pass "$rev" >/dev/null
    PREFLIGHT_PINNED_API_IMAGE_ID="${SHOPBUKET1_API_IMAGE_ID:-}"
    [[ -n "$PREFLIGHT_PINNED_API_IMAGE_ID" ]] \
      || die "Preflight PASS report missing migrate_image_id — re-run preflight on this revision"
    log "Preflight pinned API image id=${PREFLIGHT_PINNED_API_IMAGE_ID}"
  fi

  tag_images "$rev"

  log "Stage: build images"
  build_images

  compose up -d postgres
  local i
  for i in $(seq 1 30); do
    if docker inspect -f '{{.State.Health.Status}}' shopbuket1-postgres 2>/dev/null | grep -qx healthy; then
      break
    fi
    sleep 2
  done

  # Migrate runs while DEPLOY_STARTED=0 so failure leaves the running app untouched.
  backup_before_migrate
  migrate
  post_migrate_verify

  DEPLOY_STARTED=1
  bring_up
  wait_startup_ready
  wait_production_healthy

  write_release_metadata "$rev" "$NEW_API_IMAGE" "$NEW_WEB_IMAGE"
  prune_release_metadata
  prune_old_shopbuket1_images

  log "Deploy succeeded: $rev"
  log "Create/update SUPER_ADMIN if needed: ./admin-create.sh"
  log "Verify media: Admin → Медиа / Site Health → Проверить хранилище"
}

# Allow focused unit tests to source this file without starting a deploy.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi

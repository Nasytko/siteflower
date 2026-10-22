#!/usr/bin/env bash
# shopbuket1 — normal application deployment (does NOT reinstall the VPS).
# Usage:
#   ./deploy.sh
#   ./deploy.sh <git-ref>
#
# Never runs docker system prune --volumes.
# Never deletes erpbuket1 or other non-shopbuket1 Docker resources.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib/common.sh
source "${SCRIPT_DIR}/deploy/lib/common.sh"
# shellcheck source=deploy/lib/nginx.sh
source "${SCRIPT_DIR}/deploy/lib/nginx.sh"
SHOPBUKET1_NGINX_LIB_LOADED=1
# shellcheck source=deploy/lib/health.sh
source "${SCRIPT_DIR}/deploy/lib/health.sh"

# Compose file interpolates ${SHOPBUKET1_ENV_FILE}; always export the default path.
export SHOPBUKET1_ENV_FILE="${SHOPBUKET1_ENV_FILE:-/etc/shopbuket1/production.env}"

REF="${1:-}"
NEW_API_IMAGE=""
NEW_WEB_IMAGE=""
PREV_API_IMAGE=""
PREV_WEB_IMAGE=""
# Set only after containers are about to be replaced (rollback applies then).
DEPLOY_STARTED=0
DEPLOY_INTERRUPTED=0

rollback_app_images() {
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
    log "Deploy failed (exit ${code}). Attempting application container rollback."
    log "Database migrations are NOT reverted automatically."
    rollback_app_images || true
  else
    log "Deploy aborted early (exit ${code}) before container switch — no image rollback."
  fi
  exit "$code"
}

on_interrupt() {
  DEPLOY_INTERRUPTED=1
  log "Deploy interrupted (SIGINT/SIGTERM). Lock will release on process exit."
  if [[ "$DEPLOY_STARTED" -eq 1 ]]; then
    log "Attempting application container rollback after interrupt."
    rollback_app_images || true
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
  log "Building API image ${NEW_API_IMAGE}"
  docker build \
    -f "$SCRIPT_DIR/deploy/Dockerfile.api" \
    -t "$NEW_API_IMAGE" \
    -t shopbuket1-api:local \
    "$SCRIPT_DIR"

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
  log "Taking pre-migrate PostgreSQL backup"
  "$SCRIPT_DIR/backup.sh" "pre-migrate"
}

migrate() {
  log "Running prisma migrate deploy"
  compose run --rm --no-deps \
    -e "DATABASE_URL=${DATABASE_URL}" \
    api \
    sh -lc 'cd /app/node_modules/@bouquet-one/database && exec /app/node_modules/.bin/prisma migrate deploy'
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

main() {
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

  backup_before_migrate
  migrate

  DEPLOY_STARTED=1
  bring_up
  wait_startup_ready
  wait_production_healthy

  write_release_metadata "$rev" "$NEW_API_IMAGE" "$NEW_WEB_IMAGE"
  prune_old_shopbuket1_images

  log "Deploy succeeded: $rev"
  log "Create/update SUPER_ADMIN if needed: ./admin-create.sh"
  log "Verify media: Admin → Медиа / Site Health → Проверить хранилище"
}

# Allow focused unit tests to source this file without starting a deploy.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi

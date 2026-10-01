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

REF="${1:-}"
NEW_API_IMAGE=""
NEW_WEB_IMAGE=""
PREV_API_IMAGE=""
PREV_WEB_IMAGE=""
DEPLOY_STARTED=0

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
  if [[ "$DEPLOY_STARTED" -eq 1 ]]; then
    log "Deploy failed (exit ${code}). Attempting application container rollback."
    log "Database migrations are NOT reverted automatically."
    rollback_app_images || true
  else
    log "Deploy aborted early (exit ${code}) before image build/switch started."
  fi
  exit "$code"
}
trap on_err ERR

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
    git fetch --tags --prune origin
    git rev-parse --verify "$REF^{commit}" >/dev/null
    git checkout --detach "$REF"
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
      git fetch --tags --prune origin
      if git show-ref --verify --quiet "refs/remotes/origin/${branch}"; then
        git pull --ff-only "origin" "$branch"
      else
        log "No origin/${branch} remote-tracking branch — using local HEAD"
      fi
    fi
  fi
  git rev-parse HEAD
}

tag_images() {
  local rev="$1"
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
  # API image is a pnpm deploy --prod tree: schema lives under the injected
  # @bouquet-one/database package; prisma CLI is a production dependency.
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

wait_healthy() {
  log "Waiting for healthchecks"
  local i
  for i in $(seq 1 60); do
    if "$SCRIPT_DIR/healthcheck.sh"; then
      return 0
    fi
    sleep 5
  done
  die "Healthchecks did not become ready in time"
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
  log "Stage: remember previous release images"
  remember_previous_images

  local rev
  log "Stage: resolve git revision"
  rev="$(resolve_ref)"
  [[ -n "$rev" ]] || die "resolve_ref returned an empty revision"
  log "Deploying revision $rev"
  tag_images "$rev"
  DEPLOY_STARTED=1

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
  bring_up
  wait_healthy

  write_release_metadata "$rev" "$NEW_API_IMAGE" "$NEW_WEB_IMAGE"
  prune_old_shopbuket1_images

  log "Deploy succeeded: $rev"
  log "Create/update SUPER_ADMIN if needed: ./admin-create.sh"
  log "Verify media: Admin → Медиа / Site Health → Проверить хранилище"
}

main "$@"

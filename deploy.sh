#!/usr/bin/env bash
# SiteFlower — normal application deployment (does NOT reinstall the VPS).
# Usage:
#   ./deploy.sh
#   ./deploy.sh <git-ref>
#
# Never runs docker system prune --volumes.
# Never deletes non-siteflower Docker resources.

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
  log "Rolling back containers to ${PREV_API_IMAGE} / ${PREV_WEB_IMAGE}"
  export SITEFLOWER_API_IMAGE="$PREV_API_IMAGE"
  export SITEFLOWER_WEB_IMAGE="$PREV_WEB_IMAGE"
  compose up -d api web || true
}

on_err() {
  local code=$?
  if [[ "$DEPLOY_STARTED" -eq 1 ]]; then
    log "Deploy failed (exit ${code}). Attempting application container rollback."
    log "Database migrations are NOT reverted automatically."
    rollback_app_images || true
  fi
  exit "$code"
}
trap on_err ERR

require_docker_access() {
  require_cmd docker
  docker info >/dev/null 2>&1 || die "Docker not reachable (join 'docker' group or use sudo carefully)"
}

resolve_ref() {
  cd "$SCRIPT_DIR"
  require_cmd git
  if [[ -n "$REF" ]]; then
    validate_git_ref "$REF"
    git fetch --tags --prune origin
    git rev-parse --verify "$REF^{commit}" >/dev/null
    git checkout --detach "$REF"
  else
    if [[ -n "$(git status --porcelain)" ]]; then
      die "Working tree is dirty. Commit/stash or deploy an explicit ref: ./deploy.sh <sha>"
    fi
    local branch
    branch="$(git rev-parse --abbrev-ref HEAD)"
    if [[ "$branch" != "HEAD" ]]; then
      git fetch --tags --prune origin
      if git show-ref --verify --quiet "refs/remotes/origin/${branch}"; then
        git pull --ff-only "origin" "$branch"
      fi
    fi
  fi
  git rev-parse HEAD
}

tag_images() {
  local rev="$1"
  local short="${rev:0:12}"
  NEW_API_IMAGE="siteflower-api:${short}"
  NEW_WEB_IMAGE="siteflower-web:${short}"
  export SITEFLOWER_API_IMAGE="$NEW_API_IMAGE"
  export SITEFLOWER_WEB_IMAGE="$NEW_WEB_IMAGE"
}

remember_previous_images() {
  if [[ -f "$SITEFLOWER_CURRENT_FILE" ]]; then
    local meta
    meta="$(cat "$SITEFLOWER_CURRENT_FILE" 2>/dev/null || true)"
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
    -t siteflower-api:local \
    "$SCRIPT_DIR"

  log "Building Web image ${NEW_WEB_IMAGE}"
  docker build \
    -f "$SCRIPT_DIR/deploy/Dockerfile.web" \
    --build-arg "API_URL=http://api:3001" \
    --build-arg "NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}" \
    --build-arg "S3_PUBLIC_BASE_URL=${S3_PUBLIC_BASE_URL:-}" \
    --build-arg "MEDIA_PUBLIC_BASE_URL=${MEDIA_PUBLIC_BASE_URL:-}" \
    -t "$NEW_WEB_IMAGE" \
    -t siteflower-web:local \
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
    sh -lc 'cd /app/packages/database && pnpm exec prisma migrate deploy'
}

bring_up() {
  log "Starting SiteFlower stack"
  compose up -d postgres
  # Ensure postgres healthy before migrate already done; recreate app services on new images.
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

prune_old_siteflower_images() {
  log "Pruning old SiteFlower images only (keeping newest 5 tags each)"
  docker images 'siteflower-api' --format '{{.CreatedAt}} {{.ID}}' \
    | sort -r | awk 'NR>5 {print $NF}' \
    | while read -r id; do docker image rm "$id" 2>/dev/null || true; done
  docker images 'siteflower-web' --format '{{.CreatedAt}} {{.ID}}' \
    | sort -r | awk 'NR>5 {print $NF}' \
    | while read -r id; do docker image rm "$id" 2>/dev/null || true; done
}

main() {
  acquire_lock
  require_docker_access
  [[ -f "$SITEFLOWER_ENV_FILE" ]] || die "Missing $SITEFLOWER_ENV_FILE — run sudo ./install.sh and edit secrets"
  validate_production_env
  remember_previous_images

  local rev
  rev="$(resolve_ref)"
  log "Deploying revision $rev"
  tag_images "$rev"
  DEPLOY_STARTED=1

  build_images

  # Postgres must exist before backup/migrate.
  compose up -d postgres
  local i
  for i in $(seq 1 30); do
    if docker inspect -f '{{.State.Health.Status}}' siteflower-postgres 2>/dev/null | grep -qx healthy; then
      break
    fi
    sleep 2
  done

  backup_before_migrate
  migrate
  bring_up
  wait_healthy

  write_release_metadata "$rev" "$NEW_API_IMAGE" "$NEW_WEB_IMAGE"
  prune_old_siteflower_images

  log "Deploy succeeded: $rev"
  log "Create/update SUPER_ADMIN if needed: ./admin-create.sh"
  log "Verify media: Admin → Медиа / Site Health → Проверить хранилище"
}

main "$@"

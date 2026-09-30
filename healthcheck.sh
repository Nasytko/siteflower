#!/usr/bin/env bash
# SiteFlower healthcheck — non-zero on failure (used by deploy/rollback).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib/common.sh
source "${SCRIPT_DIR}/deploy/lib/common.sh"

FAIL=0

check() {
  local name="$1"
  shift
  if "$@"; then
    log "OK  $name"
  else
    log "FAIL $name"
    FAIL=1
  fi
}

container_healthy() {
  local name="$1"
  local status
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$name" 2>/dev/null || echo missing)"
  [[ "$status" == "healthy" || "$status" == "running" ]]
}

main() {
  require_cmd docker
  require_cmd curl

  check "postgres container" container_healthy siteflower-postgres
  check "api container" container_healthy siteflower-api
  check "web container" container_healthy siteflower-web

  check "api /api/v1/health" curl -fsS http://127.0.0.1:3001/api/v1/health >/dev/null

  local code
  code="$(curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ || true)"
  if [[ "$code" =~ ^(200|301|302|307|308)$ ]]; then
    log "OK  web / (HTTP $code)"
  else
    log "FAIL web / (HTTP ${code:-none})"
    FAIL=1
  fi

  if command -v nginx >/dev/null 2>&1; then
    if nginx -t >/dev/null 2>&1; then
      log "OK  nginx config"
    else
      log "FAIL nginx config"
      FAIL=1
    fi
  fi

  [[ "$FAIL" -eq 0 ]] || exit 1
}

main "$@"

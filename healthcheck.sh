#!/usr/bin/env bash
# shopbuket1 healthcheck — non-zero on failure (used by deploy/rollback).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib/common.sh
source "${SCRIPT_DIR}/deploy/lib/common.sh"
# shellcheck source=deploy/lib/nginx.sh
source "${SCRIPT_DIR}/deploy/lib/nginx.sh"

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
  assert_shopbuket1_owned_name "$name" "container"
  local status
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$name" 2>/dev/null || echo missing)"
  [[ "$status" == "healthy" || "$status" == "running" ]]
}

main() {
  require_cmd docker
  require_cmd curl

  check "postgres container" container_healthy shopbuket1-postgres
  check "api container" container_healthy shopbuket1-api
  check "web container" container_healthy shopbuket1-web

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
      log "OK  nginx config syntax"
    else
      log "FAIL nginx config syntax"
      FAIL=1
    fi

    if [[ -f "$SHOPBUKET1_ENV_FILE" && -r "$SHOPBUKET1_ENV_FILE" ]]; then
      # shellcheck disable=SC1090
      set -a
      source "$SHOPBUKET1_ENV_FILE"
      set +a
      local domain require_tls=0
      domain="$(resolve_public_domain)"
      if [[ -n "$domain" ]] && ! is_placeholder_domain "$domain"; then
        if tls_cert_present "$domain"; then
          require_tls=1
        fi
        if validate_nginx_site_file "$SHOPBUKET1_NGINX_AVAILABLE" "$domain" "$require_tls"; then
          log "OK  nginx site (${domain}, tls=${require_tls})"
        else
          log "FAIL nginx site checks for ${domain}"
          FAIL=1
        fi
      else
        if [[ -f "$SHOPBUKET1_NGINX_AVAILABLE" ]] && grep -Eqi 'YOUR_DOMAIN' "$SHOPBUKET1_NGINX_AVAILABLE"; then
          log "FAIL nginx site contains YOUR_DOMAIN placeholder"
          FAIL=1
        else
          log "WARN nginx domain not validated (PUBLIC_DOMAIN / NEXT_PUBLIC_SITE_URL unset or placeholder)"
        fi
      fi
    fi
  fi

  [[ "$FAIL" -eq 0 ]] || exit 1
}

main "$@"

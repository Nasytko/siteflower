#!/usr/bin/env bash
# shopbuket1 healthcheck — non-zero on failure (used by deploy/rollback).
# Exit 1 = transient (containers warming). Exit 2 = permanent (domain/Nginx/env).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib/common.sh
source "${SCRIPT_DIR}/deploy/lib/common.sh"
# shellcheck source=deploy/lib/nginx.sh
source "${SCRIPT_DIR}/deploy/lib/nginx.sh"

FAIL=0
# permanent failures must not be retried for minutes by deploy.sh
PERMANENT=0

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

mark_permanent() {
  PERMANENT=1
}

container_healthy() {
  local name="$1"
  assert_shopbuket1_owned_name "$name" "container"
  local status
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$name" 2>/dev/null || echo missing)"
  [[ "$status" == "healthy" || "$status" == "running" ]]
}

check_public_https() {
  local domain="$1"
  local require_hsts="${2:-1}"
  local headers code

  # Certificate verification is intentional (no -k). Bad/expired cert → fail.
  headers="$(curl -fsSI --max-time 20 "https://${domain}/" 2>"$TMPERR" || true)"
  if [[ -z "$headers" ]]; then
    log "FAIL https://${domain}/ (TLS/HTTP error: $(tr '\n' ' ' <"$TMPERR" | sed 's/[[:space:]]*$//'))"
    FAIL=1
    mark_permanent
    return 1
  fi

  code="$(printf '%s\n' "$headers" | head -n1 | awk '{print $2}')"
  if [[ "$code" =~ ^(200|301|302|307|308)$ ]]; then
    log "OK  https://${domain}/ (HTTP $code)"
  else
    log "FAIL https://${domain}/ (HTTP ${code:-none})"
    FAIL=1
    mark_permanent
    return 1
  fi

  if [[ "$require_hsts" == "1" ]]; then
    if validate_hsts_response_headers "$headers"; then
      log "OK  https://${domain}/ HSTS header"
    else
      log "FAIL https://${domain}/ HSTS header (need Strict-Transport-Security max-age>=${SHOPBUKET1_HSTS_MAX_AGE}, no includeSubDomains/preload)"
      FAIL=1
      mark_permanent
      return 1
    fi
  fi
  return 0
}

main() {
  require_cmd docker
  require_cmd curl

  TMPERR="$(mktemp)"
  # shellcheck disable=SC2064
  trap 'rm -f "$TMPERR"' EXIT

  check "postgres container" container_healthy shopbuket1-postgres
  check "api container" container_healthy shopbuket1-api
  check "web container" container_healthy shopbuket1-web

  if curl -fsS --max-time 10 http://127.0.0.1:3001/api/v1/health >/dev/null; then
    log "OK  api /api/v1/health"
  else
    log "FAIL api /api/v1/health"
    FAIL=1
  fi

  local code
  code="$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3000/ || true)"
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
      mark_permanent
    fi

    if [[ -f "$SHOPBUKET1_ENV_FILE" && -r "$SHOPBUKET1_ENV_FILE" ]]; then
      # shellcheck disable=SC1090
      set -a
      source "$SHOPBUKET1_ENV_FILE"
      set +a

      local domain site_file require_tls=0 www_host www_code
      if ! ( assert_storefront_domain_settings ) 2>"$TMPERR"; then
        log "FAIL storefront domain settings: $(tr '\n' ' ' <"$TMPERR" | sed 's/[[:space:]]*$//')"
        FAIL=1
        mark_permanent
      else
        domain="$(resolve_required_storefront_domain)"
        if [[ -n "$domain" ]] && ! is_placeholder_domain "$domain"; then
          site_file=""
          if site_file="$(find_nginx_site_for_domain "$domain")"; then
            log "OK  nginx site file for ${domain}: ${site_file}"
            if tls_cert_present "$domain"; then
              require_tls=1
            fi
            if validate_nginx_site_file "$site_file" "$domain" "$require_tls"; then
              log "OK  nginx site (${domain}, tls=${require_tls})"
            else
              log "FAIL nginx site checks for ${domain} in ${site_file}"
              FAIL=1
              mark_permanent
            fi
          else
            log "FAIL no shopbuket1 Nginx site serves server_name ${domain} (checked ${SHOPBUKET1_NGINX_SITES_ENABLED}/shopbuket1*). ERP configs are ignored."
            FAIL=1
            mark_permanent
          fi

          # Live HTTPS + cert + HSTS on the canonical apex only.
          check_public_https "$domain" 1

          www_host="www.${domain}"
          if [[ -n "${site_file}" ]] && site_file_covers_domain "$site_file" "$www_host"; then
            check_public_https "$www_host" 0 || true
          else
            www_code="$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 15 "https://${www_host}/" 2>/dev/null || true)"
            if [[ "$www_code" =~ ^(200|301|302|307|308)$ ]]; then
              log "OK  https://${www_host}/ (HTTP $www_code, optional)"
            else
              log "WARN https://${www_host}/ not required (HTTP ${www_code:-none}); apex ${domain} is the mandatory host"
            fi
          fi
        else
          if [[ -f "$SHOPBUKET1_NGINX_AVAILABLE" ]] && grep -Eqi 'YOUR_DOMAIN' "$SHOPBUKET1_NGINX_AVAILABLE"; then
            log "FAIL nginx site contains YOUR_DOMAIN placeholder"
            FAIL=1
            mark_permanent
          else
            log "WARN nginx domain not validated (PUBLIC_DOMAIN / NEXT_PUBLIC_SITE_URL unset or placeholder)"
          fi
        fi
      fi
    fi
  fi

  if [[ "$FAIL" -ne 0 ]]; then
    if [[ "$PERMANENT" -eq 1 ]]; then
      log "Healthcheck failed with a non-retryable domain/Nginx/TLS error"
      exit 2
    fi
    exit 1
  fi
}

main "$@"

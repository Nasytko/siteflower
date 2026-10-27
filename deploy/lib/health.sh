#!/usr/bin/env bash
# shopbuket1 readiness / health helpers (sourced by healthcheck.sh and tests).
# shellcheck shell=bash
#
# Modes:
#   startup    — containers + local API/web only (retryable while warming)
#   preflight  — env domain + Nginx site/HSTS/cert/syntax (before migrate)
#   production — startup checks + public HTTPS/HSTS (final gate)
#   seo        — local catalog URL / redirect / sitemap checks (post-deploy)
#
# Exit codes:
#   0 — ok
#   1 — transient (retry)
#   2 — permanent (do not retry; fix config)

SHOPBUKET1_HEALTH_MODE="${SHOPBUKET1_HEALTH_MODE:-production}"
SHOPBUKET1_HEALTH_QUIET="${SHOPBUKET1_HEALTH_QUIET:-0}"

HEALTH_FAIL=0
HEALTH_PERMANENT=0
HEALTH_LAST_REASON=""

health_log() {
  if [[ "${SHOPBUKET1_HEALTH_QUIET}" == "1" ]]; then
    return 0
  fi
  log "$@"
}

health_note_fail() {
  local msg="$1"
  HEALTH_FAIL=1
  HEALTH_LAST_REASON="$msg"
  log "FAIL $msg"
}

health_mark_permanent() {
  HEALTH_PERMANENT=1
}

health_ok() {
  health_log "OK  $1"
}

# True when an HTTP status/body indicates upstream still warming.
is_transient_http_code() {
  local code="${1:-}"
  case "$code" in
    ''|000|502|503|504) return 0 ;;
  esac
  return 1
}

container_health_status() {
  local name="$1"
  assert_shopbuket1_owned_name "$name" "container"
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$name" 2>/dev/null || echo missing
}

container_is_ready() {
  local status
  status="$(container_health_status "$1")"
  [[ "$status" == "healthy" || "$status" == "running" ]]
}

check_containers_startup() {
  local name
  for name in shopbuket1-postgres shopbuket1-api shopbuket1-web; do
    if container_is_ready "$name"; then
      health_ok "${name} container"
    else
      health_note_fail "${name} container (status=$(container_health_status "$name"))"
    fi
  done
}

check_local_api() {
  if curl -fsS --max-time 10 http://127.0.0.1:3001/api/v1/health >/dev/null 2>/dev/null; then
    health_ok "api /api/v1/health"
  else
    health_note_fail "api /api/v1/health"
  fi
}

check_local_web() {
  local code
  code="$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3000/ 2>/dev/null || true)"
  if [[ "$code" =~ ^(200|301|302|307|308)$ ]]; then
    health_ok "web / (HTTP $code)"
  elif is_transient_http_code "$code"; then
    health_note_fail "web / (HTTP ${code:-000}, starting)"
  else
    health_note_fail "web / (HTTP ${code:-none})"
  fi
}

# Live public HTTPS. Transient upstream codes are retryable; missing HSTS on 2xx/3xx is permanent.
check_public_https() {
  local domain="$1"
  local require_hsts="${2:-1}"
  local headers code errf

  errf="$(mktemp)"
  headers="$(curl -fsSI --max-time 20 "https://${domain}/" 2>"$errf" || true)"
  if [[ -z "$headers" ]]; then
    local err
    err="$(tr '\n' ' ' <"$errf" | sed 's/[[:space:]]*$//')"
    rm -f "$errf"
    # Connection reset / empty while web restarts → transient.
    if printf '%s' "$err" | grep -Eqi 'reset|refused|timed out|empty|Recv failure|Bad Gateway'; then
      health_note_fail "https://${domain}/ (transient: ${err:-no response})"
      return 1
    fi
    health_note_fail "https://${domain}/ (TLS/HTTP error: ${err:-none})"
    health_mark_permanent
    return 1
  fi
  rm -f "$errf"

  code="$(printf '%s\n' "$headers" | head -n1 | awk '{print $2}')"
  if is_transient_http_code "$code"; then
    health_note_fail "https://${domain}/ (HTTP ${code:-000}, upstream starting)"
    return 1
  fi
  if [[ "$code" =~ ^(200|301|302|307|308)$ ]]; then
    health_ok "https://${domain}/ (HTTP $code)"
  else
    health_note_fail "https://${domain}/ (HTTP ${code:-none})"
    # Unexpected 4xx/5xx that are not gateway warm-up → permanent after startup.
    if [[ "$code" =~ ^5 ]]; then
      return 1
    fi
    health_mark_permanent
    return 1
  fi

  if [[ "$require_hsts" == "1" ]]; then
    if validate_hsts_response_headers "$headers"; then
      health_ok "https://${domain}/ HSTS header"
    else
      health_note_fail "https://${domain}/ HSTS header (need Strict-Transport-Security max-age>=${SHOPBUKET1_HSTS_MAX_AGE}, no includeSubDomains/preload)"
      health_mark_permanent
      return 1
    fi
  fi
  return 0
}

check_nginx_preflight() {
  local domain site_file require_tls=0

  if ! command -v nginx >/dev/null 2>&1; then
    health_log "WARN nginx binary absent — skipping Nginx preflight"
    return 0
  fi

  if nginx -t >/dev/null 2>&1; then
    health_ok "nginx config syntax"
  else
    health_note_fail "nginx config syntax"
    health_mark_permanent
    return 1
  fi

  if [[ ! -f "$SHOPBUKET1_ENV_FILE" || ! -r "$SHOPBUKET1_ENV_FILE" ]]; then
    health_note_fail "missing readable env ${SHOPBUKET1_ENV_FILE}"
    health_mark_permanent
    return 1
  fi

  # shellcheck disable=SC1090
  set -a
  source "$SHOPBUKET1_ENV_FILE"
  set +a

  local err
  err="$(mktemp)"
  if ! ( assert_storefront_domain_settings ) 2>"$err"; then
    health_note_fail "storefront domain settings: $(tr '\n' ' ' <"$err" | sed 's/[[:space:]]*$//')"
    rm -f "$err"
    health_mark_permanent
    return 1
  fi
  rm -f "$err"

  domain="$(resolve_required_storefront_domain)"
  if [[ -z "$domain" ]] || is_placeholder_domain "$domain"; then
    health_note_fail "storefront domain unset or placeholder"
    health_mark_permanent
    return 1
  fi

  if ! site_file="$(find_nginx_site_for_domain "$domain")"; then
    health_note_fail "no shopbuket1 Nginx site serves ${domain} (ERP ignored)"
    health_mark_permanent
    return 1
  fi
  health_ok "nginx site file for ${domain}: ${site_file}"

  if tls_cert_present "$domain"; then
    require_tls=1
  else
    health_note_fail "TLS certificate missing for ${domain} under /etc/letsencrypt/live/${domain}"
    health_mark_permanent
    return 1
  fi

  if validate_nginx_site_file "$site_file" "$domain" "$require_tls"; then
    health_ok "nginx site (${domain}, tls=${require_tls})"
  else
    health_note_fail "nginx site checks for ${domain} in ${site_file}"
    health_mark_permanent
    return 1
  fi
  return 0
}

check_nginx_production() {
  local domain site_file www_host www_code

  check_nginx_preflight || true
  [[ "$HEALTH_PERMANENT" -eq 1 ]] && return 1

  domain="$(resolve_required_storefront_domain)"
  [[ -n "$domain" ]] || return 1

  site_file="$(find_nginx_site_for_domain "$domain" || true)"
  check_public_https "$domain" 1 || true

  www_host="www.${domain}"
  if [[ -n "${site_file}" ]] && site_file_covers_domain "$site_file" "$www_host"; then
    check_public_https "$www_host" 0 || true
  else
    www_code="$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 15 "https://${www_host}/" 2>/dev/null || true)"
    if [[ "$www_code" =~ ^(200|301|302|307|308)$ ]]; then
      health_ok "https://${www_host}/ (HTTP $www_code, optional)"
    else
      health_log "WARN https://${www_host}/ not required (HTTP ${www_code:-none}); apex ${domain} is mandatory"
    fi
  fi
}

# Catalog cutover smoke (loopback web). Permanent failure if critical routes break.
check_seo_local() {
  local base="${SHOPBUKET1_SMOKE_BASE:-http://127.0.0.1:3000}"
  local path code headers sm

  for path in / /catalog /catalog/bouquets /catalog/stems /sitemap.xml /robots.txt; do
    code="$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 15 "${base}${path}" 2>/dev/null || true)"
    if [[ "$code" =~ ^(200|301|302|307|308)$ ]]; then
      health_ok "seo ${path} (HTTP ${code})"
    elif is_transient_http_code "$code"; then
      health_note_fail "seo ${path} (HTTP ${code:-000}, starting)"
    else
      health_note_fail "seo ${path} (HTTP ${code:-none})"
      health_mark_permanent
    fi
  done

  for path in /bukety /cvety /katalog; do
    headers="$(curl -sS -D - -o /dev/null --max-time 15 "${base}${path}" 2>/dev/null || true)"
    if echo "$headers" | grep -qiE '^HTTP/.* 30[12378]' \
      && echo "$headers" | grep -qiE 'location:.*(catalog|products)'; then
      health_ok "seo redirect ${path}"
    elif is_transient_http_code "$(echo "$headers" | awk '/^HTTP/{print $2}' | tail -n1)"; then
      health_note_fail "seo redirect ${path} (starting)"
    else
      health_note_fail "seo redirect ${path} missing/invalid"
      health_mark_permanent
    fi
  done

  sm="$(curl -fsS --max-time 20 "${base}/sitemap.xml" 2>/dev/null || true)"
  if [[ -z "$sm" ]]; then
    health_note_fail "seo sitemap empty/unreachable"
    return 0
  fi
  if echo "$sm" | grep -qE '/bukety/|/katalog/|/cvety/'; then
    health_note_fail "seo sitemap still lists legacy /bukety|/katalog|/cvety paths"
    health_mark_permanent
  else
    health_ok "seo sitemap has no legacy catalog product paths"
  fi
}

ensure_nginx_lib_loaded() {
  # Do not re-source in tests that override tls_cert_present / find helpers.
  if [[ "${SHOPBUKET1_NGINX_LIB_LOADED:-0}" == "1" ]]; then
    return 0
  fi
  # shellcheck source=nginx.sh
  source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/nginx.sh"
  SHOPBUKET1_NGINX_LIB_LOADED=1
}

run_healthcheck_mode() {
  local mode="${1:-$SHOPBUKET1_HEALTH_MODE}"
  HEALTH_FAIL=0
  HEALTH_PERMANENT=0
  HEALTH_LAST_REASON=""
  SHOPBUKET1_HEALTH_MODE="$mode"

  case "$mode" in
    startup)
      require_cmd docker
      require_cmd curl
      check_containers_startup
      check_local_api
      check_local_web
      ;;
    preflight)
      ensure_nginx_lib_loaded
      check_nginx_preflight
      ;;
    production)
      require_cmd docker
      require_cmd curl
      ensure_nginx_lib_loaded
      check_containers_startup
      check_local_api
      check_local_web
      check_nginx_production
      ;;
    seo)
      require_cmd curl
      check_seo_local
      ;;
    *)
      die "Unknown healthcheck mode: $mode (use startup|preflight|production|seo)"
      ;;
  esac

  if [[ "$HEALTH_FAIL" -ne 0 ]]; then
    if [[ "$HEALTH_PERMANENT" -eq 1 ]]; then
      log "Healthcheck permanent failure (${mode}): ${HEALTH_LAST_REASON:-see FAIL lines}"
      return 2
    fi
    if [[ "${SHOPBUKET1_HEALTH_QUIET}" != "1" ]]; then
      log "Healthcheck not ready yet (${mode}): ${HEALTH_LAST_REASON:-see FAIL lines}"
    fi
    return 1
  fi
  return 0
}

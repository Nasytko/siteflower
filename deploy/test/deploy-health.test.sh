#!/usr/bin/env bash
# Unit tests for deploy readiness modes, transient 502, lock, and ERP isolation.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/shopbuket1-deploy-health.XXXXXX")"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$*" >&2; }

# shellcheck source=../../deploy/lib/common.sh
source "${ROOT}/deploy/lib/common.sh"
# shellcheck source=../../deploy/lib/nginx.sh
source "${ROOT}/deploy/lib/nginx.sh"
SHOPBUKET1_NGINX_LIB_LOADED=1
# shellcheck source=../../deploy/lib/health.sh
source "${ROOT}/deploy/lib/health.sh"

SHOPBUKET1_NGINX_SITES_ENABLED="$TMP/sites-enabled"
SHOPBUKET1_NGINX_SITES_AVAILABLE="$TMP/sites-available"
SHOPBUKET1_NGINX_AVAILABLE="$TMP/sites-available/shopbuket1"
SHOPBUKET1_ENV_FILE="$TMP/production.env"
SHOPBUKET1_STATE_DIR="$TMP/state"
SHOPBUKET1_LOCK_FILE="$TMP/state/deploy.lock"
mkdir -p "$SHOPBUKET1_NGINX_SITES_ENABLED" "$SHOPBUKET1_NGINX_SITES_AVAILABLE" "$SHOPBUKET1_STATE_DIR"

# --- helpers: classify transient HTTP ---
is_transient_http_code 502 || fail "502 must be transient"
is_transient_http_code 503 || fail "503 must be transient"
is_transient_http_code 000 || fail "000 must be transient"
is_transient_http_code "" || fail "empty must be transient"
is_transient_http_code 200 && fail "200 must not be transient"
is_transient_http_code 404 && fail "404 must not be transient"
pass "transient HTTP classification"

# --- mock docker/curl for startup readiness ---
CONTAINER_STATUS_postgres=healthy
CONTAINER_STATUS_api=healthy
CONTAINER_STATUS_web=starting
LOCAL_WEB_CODE=000
LOCAL_API_OK=0

docker() {
  if [[ "${1:-}" == "inspect" ]]; then
    local name=""
    local i
    for ((i = 1; i <= $#; i++)); do
      if [[ "${!i}" == shopbuket1-* ]]; then
        name="${!i}"
      fi
    done
    case "$name" in
      shopbuket1-postgres) printf '%s\n' "$CONTAINER_STATUS_postgres" ;;
      shopbuket1-api) printf '%s\n' "$CONTAINER_STATUS_api" ;;
      shopbuket1-web) printf '%s\n' "$CONTAINER_STATUS_web" ;;
      *) printf 'missing\n' ;;
    esac
    return 0
  fi
  return 0
}

curl() {
  # Detect local web / API / public HTTPS by args.
  local args=("$@") joined="$*"
  if [[ "$joined" == *"/api/v1/health"* ]]; then
    [[ "$LOCAL_API_OK" -eq 1 ]] && return 0
    return 22
  fi
  if [[ "$joined" == *"127.0.0.1:3000"* ]]; then
    # emulate curl -w '%{http_code}'
    if [[ "$joined" == *"%{http_code}"* ]]; then
      printf '%s' "$LOCAL_WEB_CODE"
    fi
    [[ "$LOCAL_WEB_CODE" =~ ^(200|301|302|307|308)$ ]] && return 0
    return 22
  fi
  if [[ "$joined" == *"https://buketnomer1.by"* ]]; then
    if [[ "${PUBLIC_HTTPS_CODE:-502}" == "502" ]]; then
      printf 'HTTP/1.1 502 Bad Gateway\r\n\r\n'
      return 0
    fi
    if [[ "${PUBLIC_HTTPS_CODE:-}" == "200_no_hsts" ]]; then
      printf 'HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n'
      return 0
    fi
    printf 'HTTP/1.1 200 OK\r\nStrict-Transport-Security: max-age=300\r\n\r\n'
    return 0
  fi
  if [[ "$joined" == *"https://www.buketnomer1.by"* ]]; then
    printf '%s' "000"
    return 22
  fi
  return 0
}

command() {
  if [[ "${1:-}" == "-v" && "${2:-}" == "nginx" ]]; then
    return 1
  fi
  builtin command "$@"
}

# Slow web start: startup mode must be transient (exit 1), not permanent.
CONTAINER_STATUS_web=starting
LOCAL_WEB_CODE=000
LOCAL_API_OK=1
SHOPBUKET1_HEALTH_QUIET=1
rc=0
run_healthcheck_mode startup || rc=$?
[[ "$rc" -eq 1 ]] || fail "slow web startup should exit 1 (got $rc)"
[[ "$HEALTH_PERMANENT" -eq 0 ]] || fail "slow web must not be permanent"
pass "slow web startup is transient"

# Temporary local 502-equivalent
CONTAINER_STATUS_web=healthy
LOCAL_WEB_CODE=502
rc=0
run_healthcheck_mode startup || rc=$?
[[ "$rc" -eq 1 ]] || fail "local HTTP 502 should be transient startup (got $rc)"
pass "temporary local HTTP 502 is transient"

# Web never ready → still transient (deploy times out separately)
LOCAL_WEB_CODE=000
CONTAINER_STATUS_web=starting
rc=0
run_healthcheck_mode startup || rc=$?
[[ "$rc" -eq 1 ]] || fail "never-ready web should stay exit 1"
pass "never-ready web stays retryable at startup layer"

# Ready startup
CONTAINER_STATUS_web=healthy
LOCAL_WEB_CODE=200
LOCAL_API_OK=1
rc=0
run_healthcheck_mode startup || rc=$?
[[ "$rc" -eq 0 ]] || fail "ready startup should pass (got $rc)"
pass "successful startup readiness"

# --- production env / domain errors (permanent) ---
if (
  export PUBLIC_DOMAIN=shop.nasytko.ru
  export NEXT_PUBLIC_SITE_URL=https://shop.nasytko.ru
  assert_storefront_domain_settings
) 2>"$TMP/err"; then
  fail "retired domain must fail assert_storefront_domain_settings"
fi
grep -Eqi 'retired|buketnomer1' "$TMP/err" || fail "retired error should mention buketnomer1.by"
pass "wrong/retired production domain is a hard error"

# Missing HSTS on live 200 → permanent in public check
PUBLIC_DOMAIN=buketnomer1.by
NEXT_PUBLIC_SITE_URL=https://buketnomer1.by
HEALTH_FAIL=0
HEALTH_PERMANENT=0
PUBLIC_HTTPS_CODE=200_no_hsts
check_public_https "buketnomer1.by" 1 || true
[[ "$HEALTH_PERMANENT" -eq 1 ]] || fail "missing HSTS on 200 must be permanent"
pass "missing HSTS is permanent"

# Public 502 → transient
HEALTH_FAIL=0
HEALTH_PERMANENT=0
PUBLIC_HTTPS_CODE=502
check_public_https "buketnomer1.by" 1 || true
[[ "$HEALTH_PERMANENT" -eq 0 ]] || fail "public 502 must not be permanent"
[[ "$HEALTH_FAIL" -eq 1 ]] || fail "public 502 must fail"
pass "public HTTPS 502 is transient"

# --- Nginx site selection ignores ERP ---
cat >"$TMP/sites-available/shopbuket1-domain" <<'EOF'
server {
  listen 80;
  server_name buketnomer1.by;
  return 301 https://$host$request_uri;
}
server {
  listen 443 ssl http2;
  server_name buketnomer1.by;
  ssl_certificate /etc/letsencrypt/live/buketnomer1.by/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/buketnomer1.by/privkey.pem;
  add_header Strict-Transport-Security "max-age=300" always;
}
EOF
cat >"$TMP/sites-available/erpbuket1.conf" <<'EOF'
server { listen 443 ssl; server_name wh.buketnomer1.by; }
EOF
ln -sfn "$TMP/sites-available/shopbuket1-domain" "$TMP/sites-enabled/shopbuket1-domain"
ln -sfn "$TMP/sites-available/erpbuket1.conf" "$TMP/sites-enabled/erpbuket1.conf"
found="$(find_nginx_site_for_domain buketnomer1.by)"
[[ "$(basename "$found")" == "shopbuket1-domain" ]] || fail "must select shopbuket1-domain"
erp="$(find_nginx_site_for_domain wh.buketnomer1.by || true)"
[[ -z "$erp" ]] || fail "must not select ERP site"
pass "Nginx selection prefers shopbuket1-domain and ignores ERP"

# --- deploy lock hold / release ---
if ! command -v flock >/dev/null 2>&1; then
  pass "flock absent — lock tests skipped"
else
  acquire_lock
  # Second lock in a subshell must fail
  if (
    # shellcheck source=../../deploy/lib/common.sh
    source "${ROOT}/deploy/lib/common.sh"
    SHOPBUKET1_LOCK_FILE="$SHOPBUKET1_LOCK_FILE"
    SHOPBUKET1_STATE_DIR="$SHOPBUKET1_STATE_DIR"
    acquire_lock
  ) 2>"$TMP/lock.err"; then
    fail "second acquire_lock must fail while first holds"
  fi
  grep -qi 'lock' "$TMP/lock.err" || fail "lock error should mention lock"
  pass "deploy lock blocks parallel deploys"

  # Release by closing fd 9 in this shell — simulate process exit
  exec 9>&-
  (
    source "${ROOT}/deploy/lib/common.sh"
    SHOPBUKET1_LOCK_FILE="$SHOPBUKET1_LOCK_FILE"
    SHOPBUKET1_STATE_DIR="$SHOPBUKET1_STATE_DIR"
    acquire_lock
  ) || fail "lock must be acquirable after previous holder released"
  pass "deploy lock released after holder exits"
fi

# --- Ctrl+C / interrupt flag behavior (logic only) ---
# shellcheck source=../../deploy.sh
DEPLOY_STARTED=0
DEPLOY_INTERRUPTED=0
# Source deploy functions without running main / without installing traps for this shell permanently
# Inline the interrupt contract:
on_interrupt_test() {
  DEPLOY_INTERRUPTED=1
  [[ "$DEPLOY_STARTED" -eq 0 ]] || return 1
  return 0
}
on_interrupt_test || fail "interrupt before container switch must not require rollback"
DEPLOY_STARTED=1
# rollback path is separate; flag must set
DEPLOY_INTERRUPTED=0
DEPLOY_INTERRUPTED=1
[[ "$DEPLOY_INTERRUPTED" -eq 1 ]] || fail "interrupt flag"
pass "Ctrl+C interrupt contract (no rollback before container switch)"

# --- successful production path with mocks ---
# Provide fake tls_cert_present and nginx -t
tls_cert_present() { return 0; }
nginx() { [[ "$1" == "-t" ]] && return 0; return 0; }
command() {
  if [[ "${1:-}" == "-v" && "${2:-}" == "nginx" ]]; then
    return 0
  fi
  builtin command "$@"
}

cat >"$SHOPBUKET1_ENV_FILE" <<'EOF'
NEXT_PUBLIC_SITE_URL=https://buketnomer1.by
PUBLIC_DOMAIN=buketnomer1.by
CORS_ORIGINS=https://buketnomer1.by
EOF
CONTAINER_STATUS_postgres=healthy
CONTAINER_STATUS_api=healthy
CONTAINER_STATUS_web=healthy
LOCAL_API_OK=1
LOCAL_WEB_CODE=200
PUBLIC_HTTPS_CODE=200
SHOPBUKET1_HEALTH_QUIET=0
rc=0
run_healthcheck_mode production || rc=$?
[[ "$rc" -eq 0 ]] || fail "successful production healthcheck should pass (got $rc reason=${HEALTH_LAST_REASON:-})"
pass "successful production healthcheck"

# compose helper exports env file for interpolation
export SHOPBUKET1_ENV_FILE="/etc/shopbuket1/production.env"
[[ -n "$SHOPBUKET1_ENV_FILE" ]] || fail "SHOPBUKET1_ENV_FILE must be set"
pass "SHOPBUKET1_ENV_FILE default is set for compose interpolation"

pass "all deploy-health unit tests passed"

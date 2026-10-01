#!/usr/bin/env bash
# Unit tests for public-domain resolution and nginx site validation (no root/nginx required).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/shopbuket1-nginx.XXXXXX")"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$*" >&2; }

# shellcheck source=../../deploy/lib/common.sh
source "${ROOT}/deploy/lib/common.sh"
# shellcheck source=../../deploy/lib/nginx.sh
source "${ROOT}/deploy/lib/nginx.sh"

# --- resolve_public_domain ---
PUBLIC_DOMAIN="shop.nasytko.ru"
NEXT_PUBLIC_SITE_URL="https://ignored.example"
[[ "$(resolve_public_domain)" == "shop.nasytko.ru" ]] || fail "PUBLIC_DOMAIN should win"
pass "PUBLIC_DOMAIN preferred over NEXT_PUBLIC_SITE_URL"

unset PUBLIC_DOMAIN
NEXT_PUBLIC_SITE_URL="https://shop.nasytko.ru/path"
[[ "$(resolve_public_domain)" == "shop.nasytko.ru" ]] || fail "should strip scheme/path"
pass "NEXT_PUBLIC_SITE_URL host extraction"

NEXT_PUBLIC_SITE_URL="http://shop.nasytko.ru:443/"
[[ "$(resolve_public_domain)" == "shop.nasytko.ru" ]] || fail "should strip port"
pass "port stripping"

# --- placeholders ---
is_placeholder_domain "YOUR_DOMAIN" || fail "YOUR_DOMAIN should be placeholder"
is_placeholder_domain "your_domain" || fail "your_domain should be placeholder"
is_placeholder_domain "_" || fail "_ should be placeholder"
is_placeholder_domain "shop.nasytko.ru" && fail "shop.nasytko.ru must not be placeholder"
pass "placeholder detection"

# assert_valid_public_domain calls die→exit; run in subshell
if ( assert_valid_public_domain "YOUR_DOMAIN" ) 2>"$TMP/err"; then
  fail "assert_valid_public_domain must reject YOUR_DOMAIN"
fi
pass "assert rejects YOUR_DOMAIN"

( assert_valid_public_domain "shop.nasytko.ru" ) || fail "assert should accept shop.nasytko.ru"
pass "assert accepts shop.nasytko.ru"

# --- validate_nginx_site_file ---
cat >"$TMP/bad.conf" <<'EOF'
server {
  listen 80;
  server_name YOUR_DOMAIN;
}
EOF
if validate_nginx_site_file "$TMP/bad.conf" "shop.nasytko.ru" 0 2>"$TMP/err"; then
  fail "must reject YOUR_DOMAIN in site file"
fi
pass "detects YOUR_DOMAIN in site"

cat >"$TMP/http.conf" <<'EOF'
server {
  listen 80;
  server_name shop.nasytko.ru;
  include /etc/nginx/snippets/shopbuket1-proxy.conf;
}
EOF
validate_nginx_site_file "$TMP/http.conf" "shop.nasytko.ru" 0 || fail "valid HTTP site rejected"
pass "accepts HTTP site with correct server_name"

cat >"$TMP/wrong-name.conf" <<'EOF'
server {
  listen 80;
  server_name other.example;
}
EOF
if validate_nginx_site_file "$TMP/wrong-name.conf" "shop.nasytko.ru" 0 2>"$TMP/err"; then
  fail "must reject wrong server_name"
fi
pass "detects wrong server_name"

cat >"$TMP/https.conf" <<'EOF'
server {
  listen 80;
  server_name shop.nasytko.ru;
  location / { return 301 https://$host$request_uri; }
}
server {
  listen 443 ssl http2;
  server_name shop.nasytko.ru;
  ssl_certificate /etc/letsencrypt/live/shop.nasytko.ru/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/shop.nasytko.ru/privkey.pem;
}
EOF
validate_nginx_site_file "$TMP/https.conf" "shop.nasytko.ru" 1 || fail "valid HTTPS site rejected"
pass "accepts HTTPS site with redirect + 443"

cat >"$TMP/no443.conf" <<'EOF'
server {
  listen 80;
  server_name shop.nasytko.ru;
}
EOF
if validate_nginx_site_file "$TMP/no443.conf" "shop.nasytko.ru" 1 2>"$TMP/err"; then
  fail "must reject missing listen 443 when TLS required"
fi
pass "detects missing listen 443"

# --- render helpers (file content only) ---
render_nginx_http_only "shop.nasytko.ru" "$TMP/rendered-http.conf"
grep -q 'server_name shop.nasytko.ru;' "$TMP/rendered-http.conf" || fail "rendered HTTP missing domain"
grep -q 'YOUR_DOMAIN' "$TMP/rendered-http.conf" && fail "rendered HTTP contains YOUR_DOMAIN"
grep -q 'listen 80;' "$TMP/rendered-http.conf" || fail "rendered HTTP missing listen 80"
pass "render_nginx_http_only"

render_nginx_https "shop.nasytko.ru" "$TMP/rendered-https.conf"
grep -q 'listen 443 ssl http2;' "$TMP/rendered-https.conf" || fail "rendered HTTPS missing 443"
grep -q 'return 301 https://' "$TMP/rendered-https.conf" || fail "rendered HTTPS missing redirect"
grep -q 'ssl_certificate' "$TMP/rendered-https.conf" || fail "rendered HTTPS missing ssl_certificate"
grep -q 'YOUR_DOMAIN' "$TMP/rendered-https.conf" && fail "rendered HTTPS contains YOUR_DOMAIN"
pass "render_nginx_https"

pass "all nginx provisioning unit tests passed"

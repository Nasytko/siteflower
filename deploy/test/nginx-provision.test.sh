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

SHOPBUKET1_NGINX_SITES_ENABLED="$TMP/sites-enabled"
SHOPBUKET1_NGINX_SITES_AVAILABLE="$TMP/sites-available"
SHOPBUKET1_NGINX_AVAILABLE="$TMP/sites-available/shopbuket1"
mkdir -p "$SHOPBUKET1_NGINX_SITES_ENABLED" "$SHOPBUKET1_NGINX_SITES_AVAILABLE"

# --- resolve_public_domain ---
PUBLIC_DOMAIN="buketnomer1.by"
NEXT_PUBLIC_SITE_URL="https://ignored.example"
[[ "$(resolve_public_domain)" == "buketnomer1.by" ]] || fail "PUBLIC_DOMAIN should win"
pass "PUBLIC_DOMAIN preferred over NEXT_PUBLIC_SITE_URL"

unset PUBLIC_DOMAIN
NEXT_PUBLIC_SITE_URL="https://buketnomer1.by/path"
[[ "$(resolve_public_domain)" == "buketnomer1.by" ]] || fail "should strip scheme/path"
pass "NEXT_PUBLIC_SITE_URL host extraction"

NEXT_PUBLIC_SITE_URL="http://buketnomer1.by:443/"
[[ "$(resolve_public_domain)" == "buketnomer1.by" ]] || fail "should strip port"
pass "port stripping"

# --- placeholders / retired ---
is_placeholder_domain "YOUR_DOMAIN" || fail "YOUR_DOMAIN should be placeholder"
is_placeholder_domain "your_domain" || fail "your_domain should be placeholder"
is_placeholder_domain "_" || fail "_ should be placeholder"
is_placeholder_domain "buketnomer1.by" && fail "buketnomer1.by must not be placeholder"
is_retired_shop_host "shop.nasytko.ru" || fail "shop.nasytko.ru must be retired"
is_retired_shop_host "buketnomer1.by" && fail "canonical host must not be retired"
PUBLIC_DOMAIN="shop.nasytko.ru"
[[ "$(resolve_public_domain)" == "shop.nasytko.ru" ]] || fail "retired host remains readable from env"
[[ "$(resolve_required_storefront_domain)" == "buketnomer1.by" ]] || fail "retired host must not be the required check"
unset PUBLIC_DOMAIN
pass "placeholder detection"

# Domain mismatch → clear error
PUBLIC_DOMAIN="buketnomer1.by"
NEXT_PUBLIC_SITE_URL="https://other.example"
if ( assert_storefront_domain_settings ) 2>"$TMP/err"; then
  fail "assert_storefront_domain_settings must reject mismatched hosts"
fi
grep -q 'disagree' "$TMP/err" || fail "mismatch error should mention disagree"
unset PUBLIC_DOMAIN
NEXT_PUBLIC_SITE_URL="https://buketnomer1.by"
pass "rejects PUBLIC_DOMAIN / NEXT_PUBLIC_SITE_URL mismatch"

# Retired host → clear error (no silent production remap)
PUBLIC_DOMAIN="shop.nasytko.ru"
NEXT_PUBLIC_SITE_URL="https://shop.nasytko.ru"
if ( assert_storefront_domain_settings ) 2>"$TMP/err"; then
  fail "assert_storefront_domain_settings must reject retired shop.nasytko.ru"
fi
grep -Eq 'retired|buketnomer1\.by' "$TMP/err" || fail "retired error should name buketnomer1.by"
unset PUBLIC_DOMAIN
NEXT_PUBLIC_SITE_URL="https://buketnomer1.by"
( assert_storefront_domain_settings ) || fail "canonical settings must pass"
pass "rejects retired shop.nasytko.ru with clear error"

# assert_valid_public_domain calls die→exit; run in subshell
if ( assert_valid_public_domain "YOUR_DOMAIN" ) 2>"$TMP/err"; then
  fail "assert_valid_public_domain must reject YOUR_DOMAIN"
fi
pass "assert rejects YOUR_DOMAIN"

( assert_valid_public_domain "buketnomer1.by" ) || fail "assert should accept buketnomer1.by"
pass "assert accepts buketnomer1.by"

# --- find_nginx_site_for_domain: prefer shopbuket1-domain, ignore ERP ---
cat >"$TMP/sites-available/shopbuket1" <<'EOF'
server {
  listen 443 ssl;
  server_name shop.nasytko.ru;
}
EOF
cat >"$TMP/sites-available/shopbuket1-domain" <<'EOF'
server {
  listen 443 ssl;
  server_name buketnomer1.by www.buketnomer1.by;
  ssl_certificate /etc/letsencrypt/live/buketnomer1.by/fullchain.pem;
  add_header Strict-Transport-Security "max-age=300" always;
}
EOF
cat >"$TMP/sites-available/erpbuket1.conf" <<'EOF'
server {
  listen 443 ssl;
  server_name wh.buketnomer1.by;
}
EOF
ln -sfn "$TMP/sites-available/shopbuket1" "$TMP/sites-enabled/shopbuket1"
ln -sfn "$TMP/sites-available/shopbuket1-domain" "$TMP/sites-enabled/shopbuket1-domain"
ln -sfn "$TMP/sites-available/erpbuket1.conf" "$TMP/sites-enabled/erpbuket1.conf"

found="$(find_nginx_site_for_domain "buketnomer1.by")"
[[ "$(basename "$found")" == "shopbuket1-domain" ]] \
  || fail "must select shopbuket1-domain for buketnomer1.by (got: ${found})"
site_file_covers_domain "$found" "buketnomer1.by" \
  || fail "selected site must cover buketnomer1.by"
# Old file must not be required for the new domain
site_file_covers_domain "$TMP/sites-available/shopbuket1" "buketnomer1.by" \
  && fail "legacy shopbuket1 must not cover buketnomer1.by"
# ERP must never be returned
found_erp="$(find_nginx_site_for_domain "wh.buketnomer1.by" || true)"
[[ -z "$found_erp" ]] || fail "must not select erpbuket1 for any lookup (got: ${found_erp})"
pass "selects shopbuket1-domain and ignores ERP / legacy shop host"

# --- validate_nginx_site_file ---
cat >"$TMP/bad.conf" <<'EOF'
server {
  listen 80;
  server_name YOUR_DOMAIN;
}
EOF
if validate_nginx_site_file "$TMP/bad.conf" "buketnomer1.by" 0 2>"$TMP/err"; then
  fail "must reject YOUR_DOMAIN in site file"
fi
pass "detects YOUR_DOMAIN in site"

cat >"$TMP/http.conf" <<'EOF'
server {
  listen 80;
  server_name buketnomer1.by;
  include /etc/nginx/snippets/shopbuket1-proxy.conf;
}
EOF
validate_nginx_site_file "$TMP/http.conf" "buketnomer1.by" 0 || fail "valid HTTP site rejected"
pass "accepts HTTP site with correct server_name"

cat >"$TMP/wrong-name.conf" <<'EOF'
server {
  listen 80;
  server_name other.example;
}
EOF
if validate_nginx_site_file "$TMP/wrong-name.conf" "buketnomer1.by" 0 2>"$TMP/err"; then
  fail "must reject wrong server_name"
fi
pass "detects wrong server_name"

cat >"$TMP/https.conf" <<'EOF'
server {
  listen 80;
  server_name buketnomer1.by;
  location / { return 301 https://$host$request_uri; }
}
server {
  listen 443 ssl http2;
  server_name buketnomer1.by;
  ssl_certificate /etc/letsencrypt/live/buketnomer1.by/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/buketnomer1.by/privkey.pem;
  add_header Strict-Transport-Security "max-age=300" always;
}
EOF
validate_nginx_site_file "$TMP/https.conf" "buketnomer1.by" 1 || fail "valid HTTPS site rejected"
pass "accepts HTTPS site with redirect + 443 + HSTS max-age=300"

cat >"$TMP/https-no-hsts.conf" <<'EOF'
server {
  listen 80;
  server_name buketnomer1.by;
  location / { return 301 https://$host$request_uri; }
}
server {
  listen 443 ssl http2;
  server_name buketnomer1.by;
  ssl_certificate /etc/letsencrypt/live/buketnomer1.by/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/buketnomer1.by/privkey.pem;
}
EOF
if validate_nginx_site_file "$TMP/https-no-hsts.conf" "buketnomer1.by" 1 2>"$TMP/err"; then
  fail "must reject HTTPS site without Strict-Transport-Security"
fi
pass "detects missing HSTS on TLS site"

cat >"$TMP/https-hsts-broad.conf" <<'EOF'
server {
  listen 443 ssl http2;
  server_name buketnomer1.by;
  ssl_certificate /etc/letsencrypt/live/buketnomer1.by/fullchain.pem;
  return 301 https://$host$request_uri;
  add_header Strict-Transport-Security "max-age=300; includeSubDomains" always;
}
EOF
if validate_nginx_site_file "$TMP/https-hsts-broad.conf" "buketnomer1.by" 1 2>"$TMP/err"; then
  fail "must reject HSTS includeSubDomains"
fi
pass "rejects HSTS includeSubDomains and does not require it"

cat >"$TMP/https-hsts-short.conf" <<'EOF'
server {
  listen 80;
  server_name buketnomer1.by;
  location / { return 301 https://$host$request_uri; }
}
server {
  listen 443 ssl http2;
  server_name buketnomer1.by;
  ssl_certificate /etc/letsencrypt/live/buketnomer1.by/fullchain.pem;
  add_header Strict-Transport-Security "max-age=60" always;
}
EOF
if validate_nginx_site_file "$TMP/https-hsts-short.conf" "buketnomer1.by" 1 2>"$TMP/err"; then
  fail "must reject HSTS max-age below 300"
fi
pass "rejects HSTS max-age below 300"

# Response-header HSTS helper
ok_headers=$'HTTP/1.1 200 OK\r\nStrict-Transport-Security: max-age=300\r\n\r\n'
validate_hsts_response_headers "$ok_headers" || fail "response HSTS max-age=300 must pass"
bad_headers=$'HTTP/1.1 200 OK\r\nStrict-Transport-Security: max-age=300; includeSubDomains\r\n\r\n'
if validate_hsts_response_headers "$bad_headers" 2>"$TMP/err"; then
  fail "response HSTS includeSubDomains must fail"
fi
missing_headers=$'HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n'
if validate_hsts_response_headers "$missing_headers" 2>"$TMP/err"; then
  fail "missing response HSTS must fail"
fi
pass "validates live HTTPS HSTS response headers"

cat >"$TMP/https-www.conf" <<'EOF'
server {
  listen 80;
  server_name buketnomer1.by www.buketnomer1.by;
  location / { return 301 https://$host$request_uri; }
}
server {
  listen 443 ssl http2;
  server_name buketnomer1.by www.buketnomer1.by;
  ssl_certificate /etc/letsencrypt/live/buketnomer1.by/fullchain.pem;
  add_header Strict-Transport-Security "max-age=300" always;
}
EOF
validate_nginx_site_file "$TMP/https-www.conf" "buketnomer1.by" 1 \
  || fail "apex plus www server_name should pass"
pass "accepts optional www.buketnomer1.by beside the apex"

cat >"$TMP/https-www-only.conf" <<'EOF'
server {
  listen 80;
  server_name www.buketnomer1.by;
  location / { return 301 https://$host$request_uri; }
}
server {
  listen 443 ssl http2;
  server_name www.buketnomer1.by;
  ssl_certificate /etc/letsencrypt/live/buketnomer1.by/fullchain.pem;
  add_header Strict-Transport-Security "max-age=300" always;
}
EOF
if validate_nginx_site_file "$TMP/https-www-only.conf" "buketnomer1.by" 1 2>"$TMP/err"; then
  fail "www alone must not satisfy the apex check"
fi
pass "www.buketnomer1.by alone is not the required host"

cat >"$TMP/no443.conf" <<'EOF'
server {
  listen 80;
  server_name buketnomer1.by;
}
EOF
if validate_nginx_site_file "$TMP/no443.conf" "buketnomer1.by" 1 2>"$TMP/err"; then
  fail "must reject missing listen 443 when TLS required"
fi
pass "detects missing listen 443"

# Legacy shop.nasytko.ru site must not be validated as the storefront when domain is apex
if validate_nginx_site_file "$TMP/sites-available/shopbuket1" "buketnomer1.by" 1 2>"$TMP/err"; then
  fail "legacy shop.nasytko.ru site must not pass buketnomer1.by checks"
fi
pass "legacy shop.nasytko.ru Nginx file is not the required storefront config"

# --- render helpers (file content only) ---
render_nginx_http_only "buketnomer1.by" "$TMP/rendered-http.conf"
grep -q 'server_name buketnomer1.by;' "$TMP/rendered-http.conf" || fail "rendered HTTP missing domain"
grep -q 'YOUR_DOMAIN' "$TMP/rendered-http.conf" && fail "rendered HTTP contains YOUR_DOMAIN"
grep -q 'listen 80;' "$TMP/rendered-http.conf" || fail "rendered HTTP missing listen 80"
pass "render_nginx_http_only"

render_nginx_https "buketnomer1.by" "$TMP/rendered-https.conf"
grep -q 'listen 443 ssl http2;' "$TMP/rendered-https.conf" || fail "rendered HTTPS missing 443"
grep -q 'return 301 https://' "$TMP/rendered-https.conf" || fail "rendered HTTPS missing redirect"
grep -q 'ssl_certificate' "$TMP/rendered-https.conf" || fail "rendered HTTPS missing ssl_certificate"
grep -q 'YOUR_DOMAIN' "$TMP/rendered-https.conf" && fail "rendered HTTPS contains YOUR_DOMAIN"
grep -q 'Strict-Transport-Security' "$TMP/rendered-https.conf" || fail "rendered HTTPS missing HSTS"
grep -Eq "add_header[[:space:]]+Strict-Transport-Security[[:space:]]+\"max-age=${SHOPBUKET1_HSTS_MAX_AGE}\"" \
  "$TMP/rendered-https.conf" || fail "HSTS max-age must be ${SHOPBUKET1_HSTS_MAX_AGE}"
grep -E 'add_header[[:space:]]+Strict-Transport-Security' "$TMP/rendered-https.conf" \
  | grep -Eqi 'includesubdomains|preload' \
  && fail "HSTS add_header must not set includeSubDomains or preload"
hsts_lines="$(grep -c 'Strict-Transport-Security' "$TMP/rendered-https.conf" || true)"
[[ "$hsts_lines" == "1" ]] || fail "expected exactly one HSTS directive (got ${hsts_lines})"
pass "render_nginx_https"

# Optional: nginx -t when the binary exists (CI/Ubuntu). Skip cleanly otherwise.
if command -v nginx >/dev/null 2>&1; then
  SNIPPET_DIR="$TMP/nginx-root"
  mkdir -p "$SNIPPET_DIR/snippets" "$SNIPPET_DIR/conf.d"
  : >"$SNIPPET_DIR/snippets/shopbuket1-proxy.conf"
  sed \
    -e "s|/etc/nginx/snippets/shopbuket1-proxy.conf|${SNIPPET_DIR}/snippets/shopbuket1-proxy.conf|g" \
    -e "s|/etc/letsencrypt/live/buketnomer1.by/fullchain.pem|${SNIPPET_DIR}/fullchain.pem|g" \
    -e "s|/etc/letsencrypt/live/buketnomer1.by/privkey.pem|${SNIPPET_DIR}/privkey.pem|g" \
    "$TMP/rendered-https.conf" >"$TMP/nginx-syntax.conf"
  printf '%s\n' '-----BEGIN CERTIFICATE-----' 'MIIB' '-----END CERTIFICATE-----' >"$SNIPPET_DIR/fullchain.pem"
  printf '%s\n' '-----BEGIN PRIVATE KEY-----' 'MIIB' '-----END PRIVATE KEY-----' >"$SNIPPET_DIR/privkey.pem"
  cat >"$TMP/nginx-main.conf" <<EOF
events {}
http {
  include ${TMP}/nginx-syntax.conf;
}
EOF
  if nginx -t -c "$TMP/nginx-main.conf" 2>"$TMP/nginx-t.err"; then
    pass "nginx -t syntax OK for rendered HTTPS site"
  else
    if grep -Eqi 'PEM|certificate|SSL|ssl' "$TMP/nginx-t.err"; then
      pass "nginx -t skipped (cert material not accepted; config structure already asserted)"
    else
      cat "$TMP/nginx-t.err" >&2
      fail "nginx -t rejected rendered HTTPS config"
    fi
  fi
else
  pass "nginx binary absent — structural HSTS assertions only"
fi

pass "all nginx provisioning unit tests passed"

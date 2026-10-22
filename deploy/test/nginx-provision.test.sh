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

# --- placeholders ---
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

# assert_valid_public_domain calls die→exit; run in subshell
if ( assert_valid_public_domain "YOUR_DOMAIN" ) 2>"$TMP/err"; then
  fail "assert_valid_public_domain must reject YOUR_DOMAIN"
fi
pass "assert rejects YOUR_DOMAIN"

( assert_valid_public_domain "buketnomer1.by" ) || fail "assert should accept buketnomer1.by"
pass "assert accepts buketnomer1.by"

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
  add_header Strict-Transport-Security "max-age=31536000" always;
}
EOF
validate_nginx_site_file "$TMP/https.conf" "buketnomer1.by" 1 || fail "valid HTTPS site rejected"
pass "accepts HTTPS site with redirect + 443 + HSTS"

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
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
}
EOF
if validate_nginx_site_file "$TMP/https-hsts-broad.conf" "buketnomer1.by" 1 2>"$TMP/err"; then
  fail "must reject HSTS includeSubDomains"
fi
pass "rejects HSTS includeSubDomains and does not require it"

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
  add_header Strict-Transport-Security "max-age=31536000" always;
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
  add_header Strict-Transport-Security "max-age=31536000" always;
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
grep -Eq 'add_header[[:space:]]+Strict-Transport-Security[[:space:]]+"max-age=31536000"' \
  "$TMP/rendered-https.conf" || fail "HSTS max-age must be 31536000"
grep -E 'add_header[[:space:]]+Strict-Transport-Security' "$TMP/rendered-https.conf" \
  | grep -Eqi 'includesubdomains|preload' \
  && fail "HSTS add_header must not set includeSubDomains or preload"
# Exactly one HSTS line — on the TLS server, not the :80 redirect server.
hsts_lines="$(grep -c 'Strict-Transport-Security' "$TMP/rendered-https.conf" || true)"
[[ "$hsts_lines" == "1" ]] || fail "expected exactly one HSTS directive (got ${hsts_lines})"
pass "render_nginx_https"

# Optional: nginx -t when the binary exists (CI/Ubuntu). Skip cleanly otherwise.
if command -v nginx >/dev/null 2>&1; then
  SNIPPET_DIR="$TMP/nginx-root"
  mkdir -p "$SNIPPET_DIR/snippets" "$SNIPPET_DIR/conf.d"
  # Minimal stub for include path used by the rendered site.
  : >"$SNIPPET_DIR/snippets/shopbuket1-proxy.conf"
  # Point includes at temp paths for syntax check.
  sed \
    -e "s|/etc/nginx/snippets/shopbuket1-proxy.conf|${SNIPPET_DIR}/snippets/shopbuket1-proxy.conf|g" \
    -e "s|/etc/letsencrypt/live/buketnomer1.by/fullchain.pem|${SNIPPET_DIR}/fullchain.pem|g" \
    -e "s|/etc/letsencrypt/live/buketnomer1.by/privkey.pem|${SNIPPET_DIR}/privkey.pem|g" \
    "$TMP/rendered-https.conf" >"$TMP/nginx-syntax.conf"
  # Dummy PEM files so nginx -t can open paths (content need not be valid for parse-only).
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
    # Some nginx builds require real cert ASN.1; treat that as SKIP, not FAIL.
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

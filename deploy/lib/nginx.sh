#!/usr/bin/env bash
# Nginx / TLS provisioning helpers for shopbuket1 (HostFly).
# shellcheck shell=bash
#
# Sourced by install.sh, provision-nginx.sh, healthcheck.sh, and common validators.
# Does not store certificates or secrets in Git.

SHOPBUKET1_NGINX_SNIPPET_SRC="${SHOPBUKET1_NGINX_SNIPPET_SRC:-deploy/nginx/shopbuket1-proxy.inc}"
SHOPBUKET1_NGINX_SNIPPET_DST="${SHOPBUKET1_NGINX_SNIPPET_DST:-/etc/nginx/snippets/shopbuket1-proxy.conf}"
SHOPBUKET1_NGINX_MAP_SRC="${SHOPBUKET1_NGINX_MAP_SRC:-deploy/nginx/shopbuket1-map.conf}"
SHOPBUKET1_NGINX_MAP_DST="${SHOPBUKET1_NGINX_MAP_DST:-/etc/nginx/conf.d/shopbuket1-map.conf}"
SHOPBUKET1_ACME_WEBROOT="${SHOPBUKET1_ACME_WEBROOT:-/var/www/html}"
SHOPBUKET1_NGINX_SITES_ENABLED="${SHOPBUKET1_NGINX_SITES_ENABLED:-/etc/nginx/sites-enabled}"
SHOPBUKET1_NGINX_SITES_AVAILABLE="${SHOPBUKET1_NGINX_SITES_AVAILABLE:-/etc/nginx/sites-available}"

# Apex of the public shop. www is optional beside the apex and is not covered by HSTS preload.
SHOPBUKET1_CANONICAL_PUBLIC_HOST="${SHOPBUKET1_CANONICAL_PUBLIC_HOST:-buketnomer1.by}"
# First-stage HSTS: short max-age, apex only — never includeSubDomains / preload here.
SHOPBUKET1_HSTS_MAX_AGE="${SHOPBUKET1_HSTS_MAX_AGE:-300}"

# Strip scheme/path/port; lowercase. Empty if unset.
normalize_hostname() {
  local raw="${1:-}"
  raw="$(printf '%s' "$raw" | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  raw="${raw#https://}"
  raw="${raw#http://}"
  raw="${raw%%/*}"
  raw="${raw%%:*}"
  printf '%s' "$raw" | tr '[:upper:]' '[:lower:]'
}

# Resolve hostname from PUBLIC_DOMAIN, else host of NEXT_PUBLIC_SITE_URL.
# Prints domain only (no scheme/path/port). Empty if unset.
resolve_public_domain() {
  local raw="${PUBLIC_DOMAIN:-}"
  if [[ -z "$raw" ]]; then
    raw="${NEXT_PUBLIC_SITE_URL:-}"
  fi
  normalize_hostname "$raw"
  printf '\n'
}

# Retired storefront host. It must not be the required healthcheck or server_name.
is_retired_shop_host() {
  local lower
  lower="$(normalize_hostname "${1:-}")"
  [[ "$lower" == "shop.nasytko.ru" ]]
}

# PUBLIC_DOMAIN and NEXT_PUBLIC_SITE_URL must agree; retired hosts are rejected.
# Call from deploy validation and healthcheck — clear error, no silent remap.
assert_storefront_domain_settings() {
  local from_public from_site domain
  from_public="$(normalize_hostname "${PUBLIC_DOMAIN:-}")"
  from_site="$(normalize_hostname "${NEXT_PUBLIC_SITE_URL:-}")"

  if [[ -n "$from_public" && -n "$from_site" && "$from_public" != "$from_site" ]]; then
    die "PUBLIC_DOMAIN (${from_public}) and NEXT_PUBLIC_SITE_URL host (${from_site}) disagree. Set both to ${SHOPBUKET1_CANONICAL_PUBLIC_HOST}."
  fi

  domain="${from_public:-$from_site}"
  if is_retired_shop_host "$domain"; then
    die "Storefront host ${domain} is retired. Set NEXT_PUBLIC_SITE_URL=https://${SHOPBUKET1_CANONICAL_PUBLIC_HOST}, CORS_ORIGINS=https://${SHOPBUKET1_CANONICAL_PUBLIC_HOST}, and PUBLIC_DOMAIN=${SHOPBUKET1_CANONICAL_PUBLIC_HOST} in ${SHOPBUKET1_ENV_FILE:-/etc/shopbuket1/production.env}."
  fi
}

# Host that healthcheck and Nginx provisioning must use (after assert_storefront_domain_settings).
resolve_required_storefront_domain() {
  local domain
  domain="$(resolve_public_domain)"
  if is_placeholder_domain "$domain" || [[ -z "$domain" ]]; then
    printf '%s\n' ""
    return 0
  fi
  if is_retired_shop_host "$domain"; then
    # Caller should have asserted; keep canonical for diagnostics only.
    printf '%s\n' "$SHOPBUKET1_CANONICAL_PUBLIC_HOST"
    return 0
  fi
  printf '%s\n' "$domain"
}

# True if an nginx site file's server_name list includes the hostname.
site_file_covers_domain() {
  local file="$1"
  local domain="$2"
  [[ -f "$file" ]] || return 1
  grep -Eq "server_name[[:space:]]+([^;]*[[:space:]])?${domain}([[:space:]]|;)" "$file"
}

# Resolve a readable path for a sites-enabled entry (follow symlink when possible).
nginx_site_realpath() {
  local f="$1" target dir
  if [[ -L "$f" ]]; then
    target="$(readlink -f "$f" 2>/dev/null || true)"
    if [[ -n "$target" && -e "$target" ]]; then
      printf '%s\n' "$target"
      return 0
    fi
    target="$(readlink "$f" 2>/dev/null || true)"
    if [[ -n "$target" ]]; then
      if [[ "$target" != /* ]]; then
        dir="$(cd "$(dirname "$f")" && pwd)"
        target="${dir}/${target}"
      fi
      printf '%s\n' "$target"
      return 0
    fi
  fi
  printf '%s\n' "$f"
}

# Find the shopbuket1 Nginx site that actually serves <domain>.
# Prefers sites-enabled/shopbuket1-domain, then other shopbuket1-*, then shopbuket1.
# Never considers erpbuket1* files.
find_nginx_site_for_domain() {
  local domain="$1"
  local enabled_dir="${SHOPBUKET1_NGINX_SITES_ENABLED}"
  local candidates=()
  local f real base

  [[ -n "$domain" ]] || return 1

  if [[ -d "$enabled_dir" ]]; then
    if [[ -e "${enabled_dir}/shopbuket1-domain" ]]; then
      candidates+=("${enabled_dir}/shopbuket1-domain")
    fi
    # shellcheck disable=SC2231
    for f in "${enabled_dir}"/shopbuket1-*; do
      [[ -e "$f" ]] || continue
      base="$(basename "$f")"
      [[ "$base" == "shopbuket1-domain" ]] && continue
      [[ "$base" == erpbuket1* ]] && continue
      candidates+=("$f")
    done
    if [[ -e "${enabled_dir}/shopbuket1" ]]; then
      candidates+=("${enabled_dir}/shopbuket1")
    fi
  fi

  for f in "${candidates[@]}"; do
    base="$(basename "$f")"
    [[ "$base" == "${SHOPBUKET1_PROJECT_NAME:-shopbuket1}"* ]] || continue
    [[ "$base" == erpbuket1* ]] && continue
    real="$(nginx_site_realpath "$f")"
    if site_file_covers_domain "$real" "$domain"; then
      printf '%s\n' "$real"
      return 0
    fi
  done

  if [[ -f "${SHOPBUKET1_NGINX_AVAILABLE}" ]] \
    && site_file_covers_domain "${SHOPBUKET1_NGINX_AVAILABLE}" "$domain"; then
    printf '%s\n' "${SHOPBUKET1_NGINX_AVAILABLE}"
    return 0
  fi

  return 1
}

is_placeholder_domain() {
  local d="${1:-}"
  local lower
  lower="$(printf '%s' "$d" | tr '[:upper:]' '[:lower:]')"
  case "$lower" in
    ''|_|your_domain|your-domain|example.com|example.org|localhost|127.0.0.1|0.0.0.0|changeme|change-me)
      return 0
      ;;
  esac
  [[ "$lower" == *"your_domain"* ]] && return 0
  [[ "$lower" == *"your-domain"* ]] && return 0
  [[ "$lower" == *"change_me"* || "$lower" == *"change-me"* ]] && return 0
  return 1
}

assert_valid_public_domain() {
  local d="${1:-}"
  [[ -n "$d" ]] || die "Public domain is empty (set PUBLIC_DOMAIN or NEXT_PUBLIC_SITE_URL)"
  if is_placeholder_domain "$d"; then
    die "Public domain is a placeholder ($d). Set PUBLIC_DOMAIN or NEXT_PUBLIC_SITE_URL to a real FQDN (e.g. ${SHOPBUKET1_CANONICAL_PUBLIC_HOST})"
  fi
  [[ "$d" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] \
    || die "Invalid public domain hostname: $d"
  [[ "$d" == *.* ]] || die "Public domain must be a FQDN (got: $d)"
}

tls_cert_present() {
  local domain="$1"
  [[ -f "/etc/letsencrypt/live/${domain}/fullchain.pem" \
    && -f "/etc/letsencrypt/live/${domain}/privkey.pem" ]]
}

# Validate an installed site file for obvious production mistakes.
# Args: <site-file> [expected-domain] [require_tls=0|1]
validate_nginx_site_file() {
  local file="$1"
  local expected="${2:-}"
  local require_tls="${3:-0}"

  [[ -f "$file" ]] || { log "Nginx site missing: $file"; return 1; }

  if grep -Eqi 'YOUR_DOMAIN' "$file"; then
    log "Nginx site contains YOUR_DOMAIN placeholder: $file"
    return 1
  fi

  if grep -Eqi '__PUBLIC_DOMAIN__' "$file"; then
    log "Nginx site still has unsubstituted __PUBLIC_DOMAIN__: $file"
    return 1
  fi

  if [[ -n "$expected" ]] && ! is_placeholder_domain "$expected"; then
    if ! grep -Eq "server_name[[:space:]]+${expected}([[:space:]]|;)" "$file"; then
      log "Nginx site server_name is not ${expected}: $file"
      return 1
    fi
    if grep -Eq 'server_name[[:space:]]+_[[:space:]]*;' "$file"; then
      log "Nginx site still uses catch-all server_name _; expected ${expected}"
      return 1
    fi
  fi

  if [[ "$require_tls" == "1" ]] || { [[ -n "$expected" ]] && tls_cert_present "$expected"; }; then
    if ! grep -Eq 'listen([[:space:]]+[^;]*)?443' "$file"; then
      log "Nginx site missing listen 443 (TLS cert present or required): $file"
      return 1
    fi
    if ! grep -Eq 'ssl_certificate[[:space:]]+' "$file"; then
      log "Nginx site missing ssl_certificate: $file"
      return 1
    fi
    if ! grep -Eq 'return[[:space:]]+301[[:space:]]+https://' "$file"; then
      log "Nginx site missing HTTP→HTTPS redirect: $file"
      return 1
    fi
    # HSTS belongs on the TLS vhost only (not the port-80 redirect server).
    # includeSubDomains would also pin every child hostname; preload cannot be undone here.
    if ! validate_hsts_add_header_line "$file"; then
      return 1
    fi
  fi

  return 0
}

# Validate add_header Strict-Transport-Security in a site file.
# Requires max-age >= SHOPBUKET1_HSTS_MAX_AGE (default 300); rejects includeSubDomains/preload.
validate_hsts_add_header_line() {
  local file="$1"
  local line age

  if ! grep -Eq 'Strict-Transport-Security' "$file"; then
    log "Nginx HTTPS site missing Strict-Transport-Security: $file"
    return 1
  fi

  line="$(grep -Ei 'add_header[[:space:]]+Strict-Transport-Security' "$file" | head -n1 || true)"
  if [[ -z "$line" ]]; then
    log "Nginx HTTPS site has Strict-Transport-Security mention but no add_header: $file"
    return 1
  fi
  if printf '%s' "$line" | grep -Eqi 'includeSubDomains|preload'; then
    log "Nginx HSTS must not set includeSubDomains or preload: $file"
    return 1
  fi
  if [[ ! "$line" =~ max-age=([0-9]+) ]]; then
    log "Nginx HSTS add_header missing max-age=: $file"
    return 1
  fi
  age="${BASH_REMATCH[1]}"
  if [[ "$age" -lt "${SHOPBUKET1_HSTS_MAX_AGE}" ]]; then
    log "Nginx HSTS max-age=${age} is below minimum ${SHOPBUKET1_HSTS_MAX_AGE}: $file"
    return 1
  fi
  return 0
}

# Parse Strict-Transport-Security from raw HTTP response headers (curl -sI).
# Returns 0 when a safe apex HSTS header is present.
validate_hsts_response_headers() {
  local headers="$1"
  local line age

  line="$(printf '%s\n' "$headers" | grep -i '^strict-transport-security:' | head -n1 || true)"
  if [[ -z "$line" ]]; then
    log "HTTPS response missing Strict-Transport-Security header"
    return 1
  fi
  if printf '%s' "$line" | grep -Eqi 'includeSubDomains|preload'; then
    log "HTTPS HSTS must not set includeSubDomains or preload"
    return 1
  fi
  if [[ ! "$line" =~ [Mm][Aa][Xx]-[Aa][Gg][Ee]=([0-9]+) ]]; then
    log "HTTPS HSTS header missing max-age="
    return 1
  fi
  age="${BASH_REMATCH[1]}"
  if [[ "$age" -lt "${SHOPBUKET1_HSTS_MAX_AGE}" ]]; then
    log "HTTPS HSTS max-age=${age} is below minimum ${SHOPBUKET1_HSTS_MAX_AGE}"
    return 1
  fi
  return 0
}

install_nginx_static_snippets() {
  local root
  root="$(repo_root)"
  install -d -m 755 /etc/nginx/snippets
  install -m 644 "${root}/${SHOPBUKET1_NGINX_MAP_SRC}" "$SHOPBUKET1_NGINX_MAP_DST"
  install -m 644 "${root}/${SHOPBUKET1_NGINX_SNIPPET_SRC}" "$SHOPBUKET1_NGINX_SNIPPET_DST"
  mkdir -p "$SHOPBUKET1_ACME_WEBROOT"
}

render_nginx_http_only() {
  local domain="$1"
  local out="$2"
  cat >"$out" <<EOF
# Managed by shopbuket1 provision-nginx (HTTP only until TLS cert exists).
# Domain from PUBLIC_DOMAIN / NEXT_PUBLIC_SITE_URL — do not edit placeholders by hand.

server {
    listen 80;
    listen [::]:80;
    server_name ${domain};

    location ^~ /.well-known/acme-challenge/ {
        root ${SHOPBUKET1_ACME_WEBROOT};
        default_type "text/plain";
    }

    include ${SHOPBUKET1_NGINX_SNIPPET_DST};
}
EOF
}

render_nginx_https() {
  local domain="$1"
  local out="$2"
  cat >"$out" <<EOF
# Managed by shopbuket1 provision-nginx (HTTP→HTTPS + TLS).
# Certificates live under /etc/letsencrypt (never in Git).

server {
    listen 80;
    listen [::]:80;
    server_name ${domain};

    location ^~ /.well-known/acme-challenge/ {
        root ${SHOPBUKET1_ACME_WEBROOT};
        default_type "text/plain";
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${domain};

    ssl_certificate     /etc/letsencrypt/live/${domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_protocols TLSv1.2 TLSv1.3;

    # HSTS on HTTPS responses only. Apex FQDN — do not broaden to child hostnames;
    # do not use HSTS preload. First stage uses a short max-age (default 300).
    add_header Strict-Transport-Security "max-age=${SHOPBUKET1_HSTS_MAX_AGE}" always;

    include ${SHOPBUKET1_NGINX_SNIPPET_DST};
}
EOF
}

# Write site config for domain. Reuses an existing shopbuket1* site that already
# serves the domain (e.g. sites-available/shopbuket1-domain) instead of creating
# a second conflicting server block. Never touches erpbuket1*.
write_nginx_site_for_domain() {
  local domain="$1"
  local tmp target base enabled_link existing
  tmp="$(mktemp)"
  if [[ "$domain" != "_" ]] && tls_cert_present "$domain"; then
    render_nginx_https "$domain" "$tmp"
  else
    render_nginx_http_only "$domain" "$tmp"
  fi

  target="$SHOPBUKET1_NGINX_AVAILABLE"
  if [[ "$domain" != "_" ]]; then
    existing="$(find_nginx_site_for_domain "$domain" || true)"
    if [[ -n "$existing" ]]; then
      target="$existing"
      log "Updating existing shopbuket1 Nginx site for ${domain}: ${target}"
    fi
  fi

  base="$(basename "$target")"
  if [[ "$base" == erpbuket1* ]] || [[ "$base" != "${SHOPBUKET1_PROJECT_NAME:-shopbuket1}"* ]]; then
    rm -f "$tmp"
    die "Refusing to write Nginx site outside shopbuket1 ownership: $target"
  fi

  install -d -m 755 "$(dirname "$target")"
  install -m 644 "$tmp" "$target"
  rm -f "$tmp"

  enabled_link="${SHOPBUKET1_NGINX_SITES_ENABLED}/${base}"
  install -d -m 755 "$SHOPBUKET1_NGINX_SITES_ENABLED"
  ln -sfn "$target" "$enabled_link"
  rm -f /etc/nginx/sites-enabled/default
}

nginx_test_and_reload() {
  nginx -t
  systemctl enable --now nginx >/dev/null 2>&1 || true
  systemctl reload nginx
}

ensure_certbot_packages() {
  if command -v certbot >/dev/null 2>&1; then
    return 0
  fi
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y --no-install-recommends certbot
}

install_certbot_renew_hook() {
  local hook_dir="/etc/letsencrypt/renewal-hooks/deploy"
  local hook="${hook_dir}/shopbuket1-reload-nginx.sh"
  install -d -m 755 "$hook_dir"
  cat >"$hook" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
nginx -t
systemctl reload nginx
EOF
  chmod 755 "$hook"
}

# Issue or refresh Let's Encrypt cert via webroot (we own the Nginx config).
# Requires CERTBOT_EMAIL. Idempotent when cert already exists.
ensure_letsencrypt_cert() {
  local domain="$1"
  local email="${CERTBOT_EMAIL:-}"

  if tls_cert_present "$domain"; then
    log "TLS certificate already present for ${domain}"
    install_certbot_renew_hook
    return 0
  fi

  if [[ "${PROVISION_TLS:-1}" == "0" ]]; then
    log "PROVISION_TLS=0 — skipping certificate issuance for ${domain}"
    return 0
  fi

  if [[ -z "$email" ]]; then
    log "WARN: CERTBOT_EMAIL unset — cannot issue TLS for ${domain}"
    log "WARN: set CERTBOT_EMAIL in ${SHOPBUKET1_ENV_FILE} then: sudo ./provision-nginx.sh"
    return 0
  fi

  ensure_certbot_packages
  install_certbot_renew_hook
  mkdir -p "$SHOPBUKET1_ACME_WEBROOT"

  log "Requesting Let's Encrypt certificate for ${domain}"
  certbot certonly \
    --webroot -w "$SHOPBUKET1_ACME_WEBROOT" \
    -d "$domain" \
    --non-interactive \
    --agree-tos \
    --email "$email" \
    --keep-until-expiring \
    --deploy-hook "nginx -t && systemctl reload nginx"
}

# mode: bootstrap (allow temporary server_name _) | strict (require real FQDN)
provision_nginx() {
  local mode="${1:-strict}"
  local domain

  require_cmd nginx
  install_nginx_static_snippets

  if [[ -f "$SHOPBUKET1_ENV_FILE" ]]; then
    # shellcheck disable=SC1090
    set -a
    source "$SHOPBUKET1_ENV_FILE"
    set +a
  fi

  if [[ "$mode" != "bootstrap" ]]; then
    assert_storefront_domain_settings
  fi

  domain="$(resolve_required_storefront_domain)"

  if is_placeholder_domain "$domain" || [[ -z "$domain" ]]; then
    if [[ "$mode" == "bootstrap" ]]; then
      log "WARN: PUBLIC_DOMAIN / NEXT_PUBLIC_SITE_URL missing or placeholder — temporary server_name _"
      log "WARN: edit ${SHOPBUKET1_ENV_FILE} then run: sudo ./provision-nginx.sh"
      domain="_"
    else
      assert_valid_public_domain "${domain:-}"
    fi
  else
    assert_valid_public_domain "$domain"
  fi

  write_nginx_site_for_domain "$domain"
  nginx_test_and_reload

  local site_file
  site_file="$(find_nginx_site_for_domain "$domain" 2>/dev/null || true)"
  if [[ -z "$site_file" ]]; then
    site_file="$SHOPBUKET1_NGINX_AVAILABLE"
  fi

  if [[ "$domain" != "_" ]]; then
    ensure_letsencrypt_cert "$domain"
    if tls_cert_present "$domain"; then
      write_nginx_site_for_domain "$domain"
      nginx_test_and_reload
      site_file="$(find_nginx_site_for_domain "$domain" || printf '%s\n' "$SHOPBUKET1_NGINX_AVAILABLE")"
      validate_nginx_site_file "$site_file" "$domain" 1 \
        || die "Nginx site validation failed after TLS provisioning ($site_file)"
    else
      validate_nginx_site_file "$site_file" "$domain" 0 \
        || die "Nginx site validation failed ($site_file)"
      log "HTTP site active for ${domain}; TLS pending (DNS + CERTBOT_EMAIL)"
    fi
  else
    validate_nginx_site_file "$SHOPBUKET1_NGINX_AVAILABLE" "" 0 \
      || die "Nginx bootstrap site validation failed"
  fi

  log "Nginx provisioned (server_name=${domain}, site=${site_file})"
}

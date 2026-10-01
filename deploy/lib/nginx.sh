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

# Resolve hostname from PUBLIC_DOMAIN, else host of NEXT_PUBLIC_SITE_URL.
# Prints domain only (no scheme/path/port). Empty if unset.
resolve_public_domain() {
  local raw="${PUBLIC_DOMAIN:-}"
  if [[ -z "$raw" ]]; then
    raw="${NEXT_PUBLIC_SITE_URL:-}"
  fi
  raw="$(printf '%s' "$raw" | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  raw="${raw#https://}"
  raw="${raw#http://}"
  raw="${raw%%/*}"
  raw="${raw%%:*}"
  printf '%s\n' "$raw"
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
    die "Public domain is a placeholder ($d). Set PUBLIC_DOMAIN or NEXT_PUBLIC_SITE_URL to a real FQDN (e.g. shop.nasytko.ru)"
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

    include ${SHOPBUKET1_NGINX_SNIPPET_DST};
}
EOF
}

write_nginx_site_for_domain() {
  local domain="$1"
  local tmp
  tmp="$(mktemp)"
  if [[ "$domain" != "_" ]] && tls_cert_present "$domain"; then
    render_nginx_https "$domain" "$tmp"
  else
    render_nginx_http_only "$domain" "$tmp"
  fi
  install -m 644 "$tmp" "$SHOPBUKET1_NGINX_AVAILABLE"
  rm -f "$tmp"
  ln -sfn "$SHOPBUKET1_NGINX_AVAILABLE" "$SHOPBUKET1_NGINX_ENABLED"
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

  domain="$(resolve_public_domain)"

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

  if [[ "$domain" != "_" ]]; then
    ensure_letsencrypt_cert "$domain"
    if tls_cert_present "$domain"; then
      write_nginx_site_for_domain "$domain"
      nginx_test_and_reload
      validate_nginx_site_file "$SHOPBUKET1_NGINX_AVAILABLE" "$domain" 1 \
        || die "Nginx site validation failed after TLS provisioning"
    else
      validate_nginx_site_file "$SHOPBUKET1_NGINX_AVAILABLE" "$domain" 0 \
        || die "Nginx site validation failed"
      log "HTTP site active for ${domain}; TLS pending (DNS + CERTBOT_EMAIL)"
    fi
  else
    validate_nginx_site_file "$SHOPBUKET1_NGINX_AVAILABLE" "" 0 \
      || die "Nginx bootstrap site validation failed"
  fi

  log "Nginx provisioned (server_name=${domain})"
}

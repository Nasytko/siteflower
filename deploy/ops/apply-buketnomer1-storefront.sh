#!/usr/bin/env bash
# One-time HostFly helper: point shopbuket1 storefront env + HSTS at buketnomer1.by.
# Does NOT deploy app containers, does NOT touch erpbuket1, does NOT print secrets.
#
# Usage (on VPS, as root or with sudo for nginx/env):
#   cd /opt/shopbuket1
#   sudo ./deploy/ops/apply-buketnomer1-storefront.sh
# Then:
#   ./deploy.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=../../deploy/lib/common.sh
source "${SCRIPT_DIR}/deploy/lib/common.sh"
# shellcheck source=../../deploy/lib/nginx.sh
source "${SCRIPT_DIR}/deploy/lib/nginx.sh"

CANON="${SHOPBUKET1_CANONICAL_PUBLIC_HOST}"
ENV_FILE="${SHOPBUKET1_ENV_FILE}"
STAMP="$(date -u +'%Y%m%dT%H%M%SZ')"
SITE_CANDIDATES=(
  "/etc/nginx/sites-available/shopbuket1-domain"
  "/etc/nginx/sites-enabled/shopbuket1-domain"
)

require_root() {
  [[ "${EUID}" -eq 0 ]] || die "Run as root: sudo ./deploy/ops/apply-buketnomer1-storefront.sh"
}

backup_env() {
  local bak="${ENV_FILE}.bak.${STAMP}"
  [[ -f "$ENV_FILE" ]] || die "Missing $ENV_FILE"
  cp -a "$ENV_FILE" "$bak"
  chmod 600 "$bak" || true
  log "Backed up env → ${bak}"
  printf '%s\n' "$bak"
}

# Update or append a KEY=value line without dumping the file.
upsert_env_kv() {
  local key="$1" value="$2" file="$3"
  local tmp
  tmp="$(mktemp)"
  chmod 600 "$tmp"
  if grep -Eq "^${key}=" "$file"; then
    # Preserve file; rewrite only matching key lines.
    awk -v k="$key" -v v="$value" '
      BEGIN { done=0 }
      $0 ~ ("^" k "=") {
        if (!done) { print k "=" v; done=1 }
        next
      }
      { print }
      END { if (!done) print k "=" v }
    ' "$file" >"$tmp"
  else
    cat "$file" >"$tmp"
    printf '%s=%s\n' "$key" "$value" >>"$tmp"
  fi
  cat "$tmp" >"$file"
  rm -f "$tmp"
  chmod 600 "$file" || true
}

merge_cors_origins() {
  local current required="https://${CANON}"
  current="$(grep -E '^CORS_ORIGINS=' "$ENV_FILE" | head -n1 | sed 's/^CORS_ORIGINS=//' || true)"
  current="${current//$'\r'/}"
  current="${current#"${current%%[![:space:]]*}"}"
  current="${current%"${current##*[![:space:]]}"}"
  if [[ -z "$current" ]]; then
    printf '%s\n' "$required"
    return 0
  fi
  # Drop retired shop host; keep other entries; ensure apex is present.
  local out="" part
  IFS=',' read -r -a parts <<<"$current"
  for part in "${parts[@]}"; do
    part="${part#"${part%%[![:space:]]*}"}"
    part="${part%"${part##*[![:space:]]}"}"
    [[ -z "$part" ]] && continue
    if [[ "$part" == *"shop.nasytko.ru"* ]]; then
      continue
    fi
    if [[ -z "$out" ]]; then
      out="$part"
    else
      out="${out},${part}"
    fi
  done
  if [[ "$out" != *"${required}"* ]]; then
    if [[ -z "$out" ]]; then
      out="$required"
    else
      out="${required},${out}"
    fi
  fi
  printf '%s\n' "$out"
}

show_public_keys() {
  log "Public storefront keys (values only for non-secret domain settings):"
  grep -E '^(NEXT_PUBLIC_SITE_URL|CORS_ORIGINS|PUBLIC_DOMAIN)=' "$ENV_FILE" \
    | sed 's/\r$//' || true
}

resolve_live_site_file() {
  local f real
  for f in "${SITE_CANDIDATES[@]}"; do
    [[ -e "$f" ]] || continue
    real="$(nginx_site_realpath "$f")"
    if site_file_covers_domain "$real" "$CANON"; then
      printf '%s\n' "$real"
      return 0
    fi
  done
  if site_file="$(find_nginx_site_for_domain "$CANON")"; then
    printf '%s\n' "$site_file"
    return 0
  fi
  return 1
}

ensure_hsts_in_site() {
  local file="$1"
  local bak="${file}.bak.${STAMP}"
  local tmp

  cp -a "$file" "$bak"
  log "Backed up Nginx site → ${bak}"

  if grep -Ei 'add_header[[:space:]]+Strict-Transport-Security' "$file" >/dev/null; then
    if validate_hsts_add_header_line "$file"; then
      log "HSTS already present and acceptable in ${file}"
      return 0
    fi
    die "Existing HSTS in ${file} is unsafe or too short. Edit manually (no includeSubDomains/preload; max-age>=${SHOPBUKET1_HSTS_MAX_AGE}), then re-run."
  fi

  tmp="$(mktemp)"
  awk -v age="${SHOPBUKET1_HSTS_MAX_AGE}" '
    BEGIN { inserted=0 }
    /listen[[:space:]]+\[::\]:443/ { seen443=1 }
    /listen[[:space:]]+443/ { seen443=1 }
    seen443 && /ssl_certificate_key/ && !inserted {
      print
      print "    # Added by apply-buketnomer1-storefront.sh — apex only, short max-age."
      print "    add_header Strict-Transport-Security \"max-age=" age "\" always;"
      inserted=1
      next
    }
    { print }
    END {
      if (!inserted) {
        exit 2
      }
    }
  ' "$file" >"$tmp" || {
    rm -f "$tmp"
    die "Could not locate a TLS server block to insert HSTS in ${file}. Insert manually, then nginx -t."
  }
  install -m 644 "$tmp" "$file"
  rm -f "$tmp"
  validate_hsts_add_header_line "$file" || die "HSTS validation failed after edit: $file"
  log "Inserted HSTS max-age=${SHOPBUKET1_HSTS_MAX_AGE} into ${file}"
}

assert_no_erp_touch() {
  local path
  for path in "$@"; do
    [[ "$(basename "$path")" == erpbuket1* ]] && die "Refusing to touch ERP path: $path"
  done
}

main() {
  require_root
  require_cmd nginx
  require_cmd awk

  log "=== shopbuket1 storefront domain fix (buketnomer1.by) ==="
  backup_env >/dev/null

  log "Before:"
  show_public_keys

  upsert_env_kv "NEXT_PUBLIC_SITE_URL" "https://${CANON}" "$ENV_FILE"
  upsert_env_kv "PUBLIC_DOMAIN" "${CANON}" "$ENV_FILE"
  upsert_env_kv "CORS_ORIGINS" "$(merge_cors_origins)" "$ENV_FILE"

  log "After:"
  show_public_keys

  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a
  assert_storefront_domain_settings
  log "OK production.env storefront domain settings"

  local site
  site="$(resolve_live_site_file)" || die "No shopbuket1 Nginx site serves ${CANON}. Check sites-enabled/shopbuket1-domain."
  assert_no_erp_touch "$site"
  log "Live storefront Nginx site: ${site}"

  ensure_hsts_in_site "$site"
  nginx -t
  systemctl reload nginx
  log "Nginx reloaded"

  if curl -fsSI --max-time 20 "https://${CANON}/" | grep -qi 'strict-transport-security'; then
    log "OK live HSTS header on https://${CANON}/"
  else
    die "HTTPS responds but HSTS header still missing on https://${CANON}/ — inspect ${site}"
  fi

  log "Next: cd ${SCRIPT_DIR} && ./healthcheck.sh && ./deploy.sh"
  log "ERP was not modified."
}

main "$@"

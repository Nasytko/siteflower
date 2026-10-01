#!/usr/bin/env bash
# Shared helpers for shopbuket1 production ops scripts.
# shellcheck shell=bash

set -euo pipefail

# Production infrastructure identity (NOT a public domain).
SHOPBUKET1_PROJECT_NAME="${SHOPBUKET1_PROJECT_NAME:-shopbuket1}"
SHOPBUKET1_ENV_FILE="${SHOPBUKET1_ENV_FILE:-/etc/shopbuket1/production.env}"
SHOPBUKET1_OPT_DIR="${SHOPBUKET1_OPT_DIR:-/opt/shopbuket1}"
SHOPBUKET1_BACKUP_DIR="${SHOPBUKET1_BACKUP_DIR:-/var/backups/shopbuket1}"
SHOPBUKET1_STATE_DIR="${SHOPBUKET1_STATE_DIR:-/var/lib/shopbuket1}"
SHOPBUKET1_LOCK_FILE="${SHOPBUKET1_LOCK_FILE:-${SHOPBUKET1_STATE_DIR}/deploy.lock}"
SHOPBUKET1_COMPOSE_FILE="${SHOPBUKET1_COMPOSE_FILE:-deploy/docker-compose.prod.yml}"
SHOPBUKET1_NGINX_TEMPLATE="${SHOPBUKET1_NGINX_TEMPLATE:-deploy/nginx/shopbuket1.conf.template}"
SHOPBUKET1_NGINX_AVAILABLE="${SHOPBUKET1_NGINX_AVAILABLE:-/etc/nginx/sites-available/shopbuket1}"
SHOPBUKET1_NGINX_ENABLED="${SHOPBUKET1_NGINX_ENABLED:-/etc/nginx/sites-enabled/shopbuket1}"
SHOPBUKET1_RELEASES_DIR="${SHOPBUKET1_RELEASES_DIR:-${SHOPBUKET1_STATE_DIR}/releases}"
SHOPBUKET1_CURRENT_FILE="${SHOPBUKET1_CURRENT_FILE:-${SHOPBUKET1_STATE_DIR}/current-release}"
SHOPBUKET1_PREVIOUS_FILE="${SHOPBUKET1_PREVIOUS_FILE:-${SHOPBUKET1_STATE_DIR}/previous-release}"

# Sibling ERP stack on the same VPS — never touch these resources.
ERPBUKET1_PREFIX="${ERPBUKET1_PREFIX:-erpbuket1}"

# Always log to stderr so messages survive command substitution (e.g. rev="$(resolve_ref)").
log() { printf '%s %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }
require_cmd() { command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"; }

repo_root() {
  local here
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  printf '%s\n' "$here"
}

assert_shopbuket1_owned_name() {
  local name="$1"
  local kind="${2:-resource}"
  if [[ "$name" == "${ERPBUKET1_PREFIX}"* ]]; then
    die "Refusing to touch ${kind} owned by ${ERPBUKET1_PREFIX}: $name"
  fi
  if [[ "$name" != "${SHOPBUKET1_PROJECT_NAME}"* ]]; then
    die "Refusing to touch non-${SHOPBUKET1_PROJECT_NAME} ${kind}: $name"
  fi
}

load_env_file() {
  local file="${1:-$SHOPBUKET1_ENV_FILE}"
  [[ -f "$file" ]] || die "Missing env file: $file"
  [[ -r "$file" ]] || die "Env file not readable: $file"
  set -a
  # shellcheck disable=SC1090
  source "$file"
  set +a
}

compose() {
  local root
  root="$(repo_root)"
  [[ -n "${SHOPBUKET1_ENV_FILE:-}" ]] || die "SHOPBUKET1_ENV_FILE is not set"
  SHOPBUKET1_ENV_FILE="${SHOPBUKET1_ENV_FILE}" \
    docker compose \
      -p "$SHOPBUKET1_PROJECT_NAME" \
      -f "$root/$SHOPBUKET1_COMPOSE_FILE" \
      --env-file "$SHOPBUKET1_ENV_FILE" \
      "$@"
}

acquire_lock() {
  require_cmd flock
  mkdir -p "$SHOPBUKET1_STATE_DIR" "$(dirname "$SHOPBUKET1_LOCK_FILE")"
  exec 9>"$SHOPBUKET1_LOCK_FILE"
  if ! flock -n 9; then
    die "Another shopbuket1 deployment holds the lock ($SHOPBUKET1_LOCK_FILE)"
  fi
}

validate_git_ref() {
  local ref="${1:-}"
  [[ -n "$ref" ]] || die "Git ref is empty"
  if [[ ! "$ref" =~ ^[A-Za-z0-9._/-]+$ ]]; then
    die "Refused unsafe git ref: $ref"
  fi
  if [[ "$ref" == *".."* ]]; then
    die "Refused unsafe git ref: $ref"
  fi
}

urlencode() {
  local raw="$1"
  local length=${#raw}
  local i c
  for ((i = 0; i < length; i++)); do
    c="${raw:i:1}"
    case "$c" in
      [a-zA-Z0-9.~_-]) printf '%s' "$c" ;;
      *) printf '%%%02X' "'$c" ;;
    esac
  done
}

ensure_database_url() {
  if [[ -n "${DATABASE_URL:-}" ]]; then
    if [[ "$DATABASE_URL" != *"@postgres:"* && "$DATABASE_URL" != *"@postgres/"* ]]; then
      die "DATABASE_URL must use Docker hostname 'postgres' in production (got host that is not postgres)"
    fi
    return 0
  fi
  [[ -n "${POSTGRES_USER:-}" ]] || die "POSTGRES_USER is required"
  [[ -n "${POSTGRES_PASSWORD:-}" ]] || die "POSTGRES_PASSWORD is required"
  [[ -n "${POSTGRES_DB:-}" ]] || die "POSTGRES_DB is required"
  local enc
  enc="$(urlencode "$POSTGRES_PASSWORD")"
  export DATABASE_URL="postgresql://${POSTGRES_USER}:${enc}@postgres:5432/${POSTGRES_DB}?schema=public"
}

validate_production_env() {
  load_env_file "$SHOPBUKET1_ENV_FILE"
  ensure_database_url

  [[ "${NODE_ENV:-}" == "production" ]] || die "NODE_ENV must be production"
  [[ -n "${NEXT_PUBLIC_SITE_URL:-}" ]] || die "NEXT_PUBLIC_SITE_URL is required"
  [[ "${NEXT_PUBLIC_SITE_URL}" == https://* ]] || log "WARN: NEXT_PUBLIC_SITE_URL is not https:// — OK only before TLS is ready"
  [[ -n "${POSTGRES_USER:-}" ]] || die "POSTGRES_USER is required"
  [[ -n "${POSTGRES_PASSWORD:-}" ]] || die "POSTGRES_PASSWORD is required"
  [[ -n "${POSTGRES_DB:-}" ]] || die "POSTGRES_DB is required"
  [[ -n "${DATABASE_URL:-}" ]] || die "DATABASE_URL is required"
  [[ -n "${CORS_ORIGINS:-}" ]] || die "CORS_ORIGINS is required"
  [[ "${CORS_ORIGINS}" != *"*"* ]] || die "CORS_ORIGINS must not contain *"
  [[ "${TRUST_PROXY:-}" == "true" || "${TRUST_PROXY:-}" == "1" ]] || die "TRUST_PROXY must be true behind Nginx"
  [[ -n "${SESSION_HMAC_SECRET:-}" ]] || die "SESSION_HMAC_SECRET is required"
  [[ "${#SESSION_HMAC_SECRET}" -ge 32 ]] || die "SESSION_HMAC_SECRET must be ≥32 chars"
  [[ "$SESSION_HMAC_SECRET" != *"dev-only"* && "$SESSION_HMAC_SECRET" != *"change-me"* ]] \
    || die "SESSION_HMAC_SECRET looks like a placeholder"
  [[ -n "${ORDER_RECOVERY_ENCRYPTION_KEY:-}" ]] || die "ORDER_RECOVERY_ENCRYPTION_KEY is required"
  local key_bytes
  key_bytes="$(printf '%s' "$ORDER_RECOVERY_ENCRYPTION_KEY" | base64 -d 2>/dev/null | wc -c | tr -d ' ')"
  [[ "$key_bytes" == "32" ]] || die "ORDER_RECOVERY_ENCRYPTION_KEY must decode to exactly 32 bytes"
  [[ "${MEDIA_STORAGE:-}" == "s3" ]] || die "MEDIA_STORAGE must be s3 in production"
  [[ -n "${S3_ENDPOINT:-}" ]] || die "S3_ENDPOINT is required"
  [[ -n "${S3_REGION:-}" ]] || die "S3_REGION is required"
  [[ -n "${S3_BUCKET:-}" ]] || die "S3_BUCKET is required"
  [[ -n "${S3_ACCESS_KEY_ID:-}" ]] || die "S3_ACCESS_KEY_ID is required"
  [[ -n "${S3_SECRET_ACCESS_KEY:-}" ]] || die "S3_SECRET_ACCESS_KEY is required"
  [[ -n "${S3_PUBLIC_BASE_URL:-}" || -n "${MEDIA_PUBLIC_BASE_URL:-}" ]] \
    || die "S3_PUBLIC_BASE_URL (or MEDIA_PUBLIC_BASE_URL) is required"
}

write_release_metadata() {
  local rev="$1"
  local api_image="$2"
  local web_image="$3"
  assert_shopbuket1_owned_name "$api_image" "image"
  assert_shopbuket1_owned_name "$web_image" "image"
  mkdir -p "$SHOPBUKET1_RELEASES_DIR"
  local stamp file
  stamp="$(date -u +'%Y%m%dT%H%M%SZ')"
  file="${SHOPBUKET1_RELEASES_DIR}/${stamp}-${rev}.json"
  umask 077
  cat >"$file" <<EOF
{
  "revision": "$(printf '%s' "$rev" | sed 's/"/\\"/g')",
  "api_image": "$(printf '%s' "$api_image" | sed 's/"/\\"/g')",
  "web_image": "$(printf '%s' "$web_image" | sed 's/"/\\"/g')",
  "deployed_at": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
}
EOF
  if [[ -f "$SHOPBUKET1_CURRENT_FILE" ]]; then
    cp -f "$SHOPBUKET1_CURRENT_FILE" "$SHOPBUKET1_PREVIOUS_FILE"
  fi
  printf '%s\n' "$file" >"$SHOPBUKET1_CURRENT_FILE"
  chmod 600 "$file" "$SHOPBUKET1_CURRENT_FILE" "$SHOPBUKET1_PREVIOUS_FILE" 2>/dev/null || true
}

read_release_file() {
  local pointer="$1"
  [[ -f "$pointer" ]] || die "No release metadata at $pointer"
  local path
  path="$(tr -d '\r\n' <"$pointer")"
  [[ -f "$path" ]] || die "Release metadata missing: $path"
  printf '%s\n' "$path"
}

json_field() {
  local file="$1" key="$2"
  sed -n "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" "$file" | head -n1
}

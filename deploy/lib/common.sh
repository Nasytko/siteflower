#!/usr/bin/env bash
# Shared helpers for SiteFlower production ops scripts.
# shellcheck shell=bash

set -euo pipefail

SITEFLOWER_PROJECT_NAME="${SITEFLOWER_PROJECT_NAME:-siteflower}"
SITEFLOWER_ENV_FILE="${SITEFLOWER_ENV_FILE:-/etc/siteflower/production.env}"
SITEFLOWER_OPT_DIR="${SITEFLOWER_OPT_DIR:-/opt/siteflower}"
SITEFLOWER_BACKUP_DIR="${SITEFLOWER_BACKUP_DIR:-/var/backups/siteflower}"
SITEFLOWER_STATE_DIR="${SITEFLOWER_STATE_DIR:-/var/lib/siteflower}"
SITEFLOWER_LOCK_FILE="${SITEFLOWER_LOCK_FILE:-${SITEFLOWER_STATE_DIR}/deploy.lock}"
SITEFLOWER_COMPOSE_FILE="${SITEFLOWER_COMPOSE_FILE:-deploy/docker-compose.prod.yml}"
SITEFLOWER_NGINX_TEMPLATE="${SITEFLOWER_NGINX_TEMPLATE:-deploy/nginx/siteflower.conf.template}"
SITEFLOWER_NGINX_AVAILABLE="${SITEFLOWER_NGINX_AVAILABLE:-/etc/nginx/sites-available/siteflower}"
SITEFLOWER_NGINX_ENABLED="${SITEFLOWER_NGINX_ENABLED:-/etc/nginx/sites-enabled/siteflower}"
SITEFLOWER_RELEASES_DIR="${SITEFLOWER_RELEASES_DIR:-${SITEFLOWER_STATE_DIR}/releases}"
SITEFLOWER_CURRENT_FILE="${SITEFLOWER_CURRENT_FILE:-${SITEFLOWER_STATE_DIR}/current-release}"
SITEFLOWER_PREVIOUS_FILE="${SITEFLOWER_PREVIOUS_FILE:-${SITEFLOWER_STATE_DIR}/previous-release}"

log() { printf '%s %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"; }
die() { log "ERROR: $*"; exit 1; }
require_cmd() { command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"; }

repo_root() {
  local here
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  printf '%s\n' "$here"
}

load_env_file() {
  local file="${1:-$SITEFLOWER_ENV_FILE}"
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
  [[ -n "${SITEFLOWER_ENV_FILE:-}" ]] || die "SITEFLOWER_ENV_FILE is not set"
  SITEFLOWER_ENV_FILE="${SITEFLOWER_ENV_FILE}" \
    docker compose \
      -p "$SITEFLOWER_PROJECT_NAME" \
      -f "$root/$SITEFLOWER_COMPOSE_FILE" \
      --env-file "$SITEFLOWER_ENV_FILE" \
      "$@"
}

acquire_lock() {
  require_cmd flock
  mkdir -p "$SITEFLOWER_STATE_DIR" "$(dirname "$SITEFLOWER_LOCK_FILE")"
  exec 9>"$SITEFLOWER_LOCK_FILE"
  if ! flock -n 9; then
    die "Another SiteFlower deployment holds the lock ($SITEFLOWER_LOCK_FILE)"
  fi
}

validate_git_ref() {
  local ref="${1:-}"
  [[ -n "$ref" ]] || die "Git ref is empty"
  # Reject shell metacharacters / path escape attempts.
  if [[ ! "$ref" =~ ^[A-Za-z0-9._/-]+$ ]]; then
    die "Refused unsafe git ref: $ref"
  fi
  if [[ "$ref" == *".."* ]]; then
    die "Refused unsafe git ref: $ref"
  fi
}

urlencode() {
  # Minimal RFC3986 encode for password segments in DATABASE_URL.
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
  # Prefer an explicit DATABASE_URL; otherwise build one for Docker DNS host "postgres".
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
  load_env_file "$SITEFLOWER_ENV_FILE"
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
  mkdir -p "$SITEFLOWER_RELEASES_DIR"
  local stamp file
  stamp="$(date -u +'%Y%m%dT%H%M%SZ')"
  file="${SITEFLOWER_RELEASES_DIR}/${stamp}-${rev}.json"
  umask 077
  cat >"$file" <<EOF
{
  "revision": "$(printf '%s' "$rev" | sed 's/"/\\"/g')",
  "api_image": "$(printf '%s' "$api_image" | sed 's/"/\\"/g')",
  "web_image": "$(printf '%s' "$web_image" | sed 's/"/\\"/g')",
  "deployed_at": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
}
EOF
  if [[ -f "$SITEFLOWER_CURRENT_FILE" ]]; then
    cp -f "$SITEFLOWER_CURRENT_FILE" "$SITEFLOWER_PREVIOUS_FILE"
  fi
  printf '%s\n' "$file" >"$SITEFLOWER_CURRENT_FILE"
  chmod 600 "$file" "$SITEFLOWER_CURRENT_FILE" "$SITEFLOWER_PREVIOUS_FILE" 2>/dev/null || true
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
  # Tiny extractor without jq dependency.
  local file="$1" key="$2"
  sed -n "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" "$file" | head -n1
}

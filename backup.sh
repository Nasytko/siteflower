#!/usr/bin/env bash
# shopbuket1 — PostgreSQL backup (custom format). Never touches S3 media or erpbuket1.
# Usage:
#   ./backup.sh
#   ./backup.sh pre-migrate

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib/common.sh
source "${SCRIPT_DIR}/deploy/lib/common.sh"

LABEL="${1:-manual}"
if [[ ! "$LABEL" =~ ^[A-Za-z0-9._-]+$ ]]; then
  die "Unsafe backup label: $LABEL"
fi

main() {
  require_cmd docker
  load_env_file "$SHOPBUKET1_ENV_FILE"
  [[ -n "${POSTGRES_USER:-}" && -n "${POSTGRES_DB:-}" ]] || die "POSTGRES_USER/DB required"

  mkdir -p "$SHOPBUKET1_BACKUP_DIR"
  chmod 750 "$SHOPBUKET1_BACKUP_DIR" || true

  local stamp tmp final
  stamp="$(date -u +'%Y%m%dT%H%M%SZ')"
  tmp="${SHOPBUKET1_BACKUP_DIR}/.tmp-${stamp}-${LABEL}.dump"
  final="${SHOPBUKET1_BACKUP_DIR}/shopbuket1-${stamp}-${LABEL}.dump"

  umask 077
  log "Creating PostgreSQL dump ${final}"
  if ! compose exec -T postgres \
    pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-acl >"$tmp"; then
    rm -f "$tmp"
    die "pg_dump failed"
  fi

  local size
  size="$(wc -c <"$tmp" | tr -d ' ')"
  [[ "$size" -gt 100 ]] || { rm -f "$tmp"; die "Backup file too small (${size} bytes)"; }

  mv -f "$tmp" "$final"
  chmod 600 "$final"
  chown root:shopbuket1 "$final" 2>/dev/null || true
  log "Backup OK (${size} bytes): $final"

  local retain="${BACKUP_RETENTION_DAYS:-14}"
  if [[ "$retain" =~ ^[0-9]+$ ]] && [[ "$retain" -gt 0 ]]; then
    find "$SHOPBUKET1_BACKUP_DIR" -maxdepth 1 -type f -name 'shopbuket1-*.dump' -mtime "+${retain}" -delete \
      || true
  fi

  if [[ -n "${BACKUP_S3_ENDPOINT:-}" ]]; then
    log "BACKUP_S3_ENDPOINT is set but upload helper is not enabled in this release (media S3 ≠ DB DR)."
  fi
}

main "$@"

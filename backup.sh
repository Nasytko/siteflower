#!/usr/bin/env bash
# shopbuket1 — PostgreSQL backup (custom format). Never touches S3 media or erpbuket1.
# Usage:
#   ./backup.sh
#   ./backup.sh pre-migrate
#
# Structural validation only: size + pg_restore -l (TOC listing).
# TOC success is NOT proof the dump can be restored — use:
#   ./scripts/release.sh restore-test --dump <path> --db shopbuket1_preflight_<name>
# Rotates aged dumps but never deletes the newest artifact.
# Stores under /var/backups/shopbuket1 (outside releases).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib/common.sh
source "${SCRIPT_DIR}/deploy/lib/common.sh"

LABEL="${1:-manual}"
if [[ ! "$LABEL" =~ ^[A-Za-z0-9._-]+$ ]]; then
  die "Unsafe backup label: $LABEL"
fi

# Structural archive check only (custom-format TOC). Does NOT restore data.
# Never treat success here as restore-test PASS.
validate_pg_dump_file() {
  local dump="$1"
  local toc_count
  [[ -f "$dump" ]] || die "Dump missing for validation: $dump"
  if ! toc_count="$(compose exec -T postgres \
    pg_restore -l <"$dump" 2>/dev/null | grep -cE '^[0-9]+;')" \
    || [[ -z "$toc_count" ]]; then
    die "pg_restore -l failed — dump is not a valid custom-format archive: $dump"
  fi
  toc_count="$(echo "$toc_count" | tr -d '[:space:]')"
  [[ "$toc_count" =~ ^[0-9]+$ ]] || die "Could not count TOC entries in $dump"
  [[ "$toc_count" -ge 5 ]] || die "Dump TOC too small (${toc_count} entries) — refusing: $dump"
  log "Dump TOC OK (${toc_count} entries) — structural only, not a restore-test: $dump"
  printf '%s\n' "$toc_count"
}

rotate_backups() {
  local retain="${BACKUP_RETENTION_DAYS:-14}"
  [[ "$retain" =~ ^[0-9]+$ ]] && [[ "$retain" -gt 0 ]] || return 0

  local newest
  newest="$(ls -1t "${SHOPBUKET1_BACKUP_DIR}"/shopbuket1-*.dump 2>/dev/null | head -n1 || true)"
  [[ -n "$newest" ]] || return 0

  # Never delete the newest dump (last known-good artifact after a successful backup).
  local path
  while IFS= read -r path; do
    [[ -n "$path" ]] || continue
    if [[ "$path" == "$newest" ]]; then
      log "Retention: keeping newest backup $path"
      continue
    fi
    log "Retention: removing aged backup $path"
    rm -f "$path" || true
  done < <(
    find "$SHOPBUKET1_BACKUP_DIR" -maxdepth 1 -type f -name 'shopbuket1-*.dump' -mtime "+${retain}" \
      2>/dev/null || true
  )
}

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
  # Passwords stay in env file / compose network — never echoed here.
  if ! compose exec -T postgres \
    pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-acl >"$tmp"; then
    rm -f "$tmp"
    die "pg_dump failed (exit non-zero)"
  fi

  local size
  size="$(wc -c <"$tmp" | tr -d ' ')"
  [[ "$size" -gt 1000 ]] || { rm -f "$tmp"; die "Backup file too small (${size} bytes)"; }

  validate_pg_dump_file "$tmp" >/dev/null

  mv -f "$tmp" "$final"
  chmod 600 "$final"
  chown root:shopbuket1 "$final" 2>/dev/null || true
  log "Backup OK (${size} bytes): $final"

  rotate_backups

  if [[ -n "${BACKUP_S3_ENDPOINT:-}" ]]; then
    log "BACKUP_S3_ENDPOINT is set but upload helper is not enabled in this release (media S3 ≠ DB DR)."
  fi

  # Print path for callers (preflight) — last line only on stdout.
  printf '%s\n' "$final"
}

# Allow unit tests to source helpers without running main.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi

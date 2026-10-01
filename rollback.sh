#!/usr/bin/env bash
# shopbuket1 — roll back APPLICATION containers to the previous release.
# Does NOT reverse Prisma migrations. Never touches erpbuket1 resources.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib/common.sh
source "${SCRIPT_DIR}/deploy/lib/common.sh"

EXPLICIT_META="${1:-}"

main() {
  acquire_lock
  require_cmd docker
  validate_production_env

  local meta_path
  if [[ -n "$EXPLICIT_META" ]]; then
    [[ -f "$EXPLICIT_META" ]] || die "Release metadata not found: $EXPLICIT_META"
    meta_path="$EXPLICIT_META"
  else
    meta_path="$(read_release_file "$SHOPBUKET1_PREVIOUS_FILE")"
  fi

  local rev api_image web_image
  rev="$(json_field "$meta_path" revision)"
  api_image="$(json_field "$meta_path" api_image)"
  web_image="$(json_field "$meta_path" web_image)"
  [[ -n "$api_image" && -n "$web_image" ]] || die "Incomplete release metadata in $meta_path"
  assert_shopbuket1_owned_name "$api_image" "image"
  assert_shopbuket1_owned_name "$web_image" "image"

  cat <<EOF
============================================================
APPLICATION ROLLBACK (shopbuket1)
Target revision: ${rev}
API image:       ${api_image}
Web image:       ${web_image}

WARNING: Prisma migrations are NOT rolled back.
If a newer migration already ran, the previous app may be
incompatible with the current database schema.
Restore Postgres from ${SHOPBUKET1_BACKUP_DIR} only with a
deliberate, documented recovery plan.
============================================================
EOF

  docker image inspect "$api_image" >/dev/null 2>&1 || die "Missing local image $api_image"
  docker image inspect "$web_image" >/dev/null 2>&1 || die "Missing local image $web_image"

  export SHOPBUKET1_API_IMAGE="$api_image"
  export SHOPBUKET1_WEB_IMAGE="$web_image"
  compose up -d api web

  local i
  for i in $(seq 1 40); do
    if "$SCRIPT_DIR/healthcheck.sh"; then
      if [[ -f "$SHOPBUKET1_CURRENT_FILE" ]]; then
        cp -f "$SHOPBUKET1_CURRENT_FILE" "${SHOPBUKET1_STATE_DIR}/rolled-forward-from" || true
      fi
      printf '%s\n' "$meta_path" >"$SHOPBUKET1_CURRENT_FILE"
      log "Rollback healthy for $rev"
      exit 0
    fi
    sleep 5
  done
  die "Rollback healthchecks failed — inspect docker logs for shopbuket1-api / shopbuket1-web"
}

main "$@"

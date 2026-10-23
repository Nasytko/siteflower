#!/usr/bin/env bash
# One-shot: reset passwordHash for an EXISTING shopbuket1 admin inside the running API container.
# Does not rebuild, deploy, or touch erpbuket1.
#
# Usage (on VPS):
#   cd /opt/shopbuket1
#   ./deploy/ops/admin-reset-password-existing.sh --email 'admin@example.com'

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=../../deploy/lib/common.sh
source "${REPO_ROOT}/deploy/lib/common.sh"

JS_SRC="${SCRIPT_DIR}/admin-reset-password-existing.cjs"
JS_DST="/tmp/admin-reset-password-existing.cjs"
CONTAINER="shopbuket1-api"

main() {
  local -a user_args=("$@")
  local has_email=0
  local arg
  for arg in "${user_args[@]}"; do
    if [[ "$arg" == "--email" ]]; then
      has_email=1
      break
    fi
  done
  [[ "$has_email" -eq 1 ]] || die "Usage: $0 --email <existing-admin-email>"

  require_cmd docker
  [[ -f "$JS_SRC" ]] || die "Missing ${JS_SRC}"
  docker inspect "$CONTAINER" >/dev/null 2>&1 \
    || die "${CONTAINER} is not running"

  if [[ ! -t 0 || ! -t 1 ]]; then
    die "Interactive TTY required (hidden password prompt)"
  fi

  assert_shopbuket1_owned_name "$CONTAINER" "container"

  log "Copying one-shot script into ${CONTAINER}:${JS_DST}"
  docker cp "$JS_SRC" "${CONTAINER}:${JS_DST}"

  cleanup() {
    docker exec "$CONTAINER" rm -f "$JS_DST" >/dev/null 2>&1 || true
  }
  trap cleanup EXIT

  log "Running password reset inside ${CONTAINER} (only passwordHash will be updated)"
  # -it for hidden prompt; -w /app so require('@bouquet-one/database') resolves.
  # DATABASE_URL is already injected by compose into the API container.
  docker exec -it -w /app "$CONTAINER" node "$JS_DST" "${user_args[@]}"
}

main "$@"

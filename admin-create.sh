#!/usr/bin/env bash
# Interactive SUPER_ADMIN bootstrap using the existing API admin:create script.
# Never invents a default password.
#
# Usage:
#   ./admin-create.sh
#   ./admin-create.sh --email director@example.com --name "Director"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib/common.sh
source "${SCRIPT_DIR}/deploy/lib/common.sh"

main() {
  require_cmd docker
  load_env_file "$SHOPBUKET1_ENV_FILE"
  ensure_database_url

  docker inspect shopbuket1-api >/dev/null 2>&1 \
    || die "shopbuket1-api is not running — deploy first"

  log "Launching interactive admin:create inside shopbuket1-api"
  if [[ -t 0 ]]; then
    compose exec -e "DATABASE_URL=${DATABASE_URL}" api \
      pnpm exec tsx scripts/admin-create.ts "$@"
  else
    die "Interactive TTY required for password entry (or pass --password for automation only)"
  fi
}

main "$@"

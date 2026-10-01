#!/usr/bin/env bash
# Interactive SUPER_ADMIN bootstrap using the compiled production CLI.
# Never invents a default password.
#
# Usage:
#   ./admin-create.sh
#   ./admin-create.sh --email director@example.com --name "Director"
#   ./admin-create.sh --email director@example.com --name "Director" --password '...'

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib/common.sh
source "${SCRIPT_DIR}/deploy/lib/common.sh"

main() {
  # Capture user argv immediately — nested compose()/docker must not drop flags.
  local -a user_args=("$@")
  local has_password=0
  local arg
  for arg in "${user_args[@]}"; do
    if [[ "$arg" == "--password" ]]; then
      has_password=1
      break
    fi
  done

  require_cmd docker
  load_env_file "$SHOPBUKET1_ENV_FILE"
  ensure_database_url

  docker inspect shopbuket1-api >/dev/null 2>&1 \
    || die "shopbuket1-api is not running — deploy first"

  if [[ ! -t 0 && "$has_password" -ne 1 ]]; then
    die "Interactive TTY required for password entry (or pass --password for automation only)"
  fi

  log "Launching interactive admin:create inside shopbuket1-api"

  local root
  root="$(repo_root)"
  local -a cmd=(
    docker compose
    -p "$SHOPBUKET1_PROJECT_NAME"
    -f "$root/$SHOPBUKET1_COMPOSE_FILE"
    --env-file "$SHOPBUKET1_ENV_FILE"
    exec
  )
  # Non-interactive automation (--password) must not allocate a TTY.
  if [[ ! -t 0 ]]; then
    cmd+=(-T)
  fi
  cmd+=(-e "DATABASE_URL=${DATABASE_URL}")
  # `--` ensures --email/--name/--password are CLI args, not compose exec options.
  cmd+=(api -- node dist/cli/admin-create.js)
  cmd+=("${user_args[@]}")

  SHOPBUKET1_ENV_FILE="${SHOPBUKET1_ENV_FILE}" "${cmd[@]}"
}

main "$@"

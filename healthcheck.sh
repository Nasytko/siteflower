#!/usr/bin/env bash
# shopbuket1 healthcheck — used by deploy/rollback and manual ops.
#
# Usage:
#   ./healthcheck.sh                 # production (full)
#   ./healthcheck.sh --startup       # containers + local HTTP only
#   ./healthcheck.sh --preflight     # env + Nginx site/HSTS/cert (no containers)
#   ./healthcheck.sh --production    # full gate
#
# Exit: 0 ok | 1 transient | 2 permanent

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib/common.sh
source "${SCRIPT_DIR}/deploy/lib/common.sh"
# shellcheck source=deploy/lib/nginx.sh
source "${SCRIPT_DIR}/deploy/lib/nginx.sh"
SHOPBUKET1_NGINX_LIB_LOADED=1
# shellcheck source=deploy/lib/health.sh
source "${SCRIPT_DIR}/deploy/lib/health.sh"

MODE="production"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --startup) MODE="startup" ;;
    --preflight) MODE="preflight" ;;
    --production) MODE="production" ;;
    --quiet) SHOPBUKET1_HEALTH_QUIET=1 ;;
    -h|--help)
      cat <<'EOF'
Usage: ./healthcheck.sh [--startup|--preflight|--production] [--quiet]
EOF
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
  shift
done

rc=0
run_healthcheck_mode "$MODE" || rc=$?
exit "$rc"

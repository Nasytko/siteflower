#!/usr/bin/env bash
# shopbuket1 — idempotent Nginx + Let's Encrypt provisioning.
# Usage: sudo ./provision-nginx.sh
#
# Reads PUBLIC_DOMAIN or host(NEXT_PUBLIC_SITE_URL) from
# /etc/shopbuket1/production.env. Rejects YOUR_DOMAIN placeholders.
# Does not touch Docker, Postgres, S3, or erpbuket1.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib/common.sh
source "${SCRIPT_DIR}/deploy/lib/common.sh"
# shellcheck source=deploy/lib/nginx.sh
source "${SCRIPT_DIR}/deploy/lib/nginx.sh"

require_root() {
  [[ "${EUID}" -eq 0 ]] || die "Run as root: sudo ./provision-nginx.sh"
}

main() {
  require_root
  [[ -f "$SHOPBUKET1_ENV_FILE" ]] || die "Missing $SHOPBUKET1_ENV_FILE — run sudo ./install.sh first and edit the env"
  provision_nginx strict
  log "Done. Verify with: curl -fsSI https://<your-domain>/ and ./healthcheck.sh"
}

main "$@"

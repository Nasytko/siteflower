#!/usr/bin/env bash
# SiteFlower — first-time Ubuntu 24.04 VPS bootstrap (HostFly).
# Usage: sudo ./install.sh
#
# Safe to re-run. Does NOT overwrite an existing /etc/siteflower/production.env.
# Does NOT run docker system prune. Does NOT touch NewERP resources.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib/common.sh
source "${SCRIPT_DIR}/deploy/lib/common.sh"

require_root() {
  [[ "${EUID}" -eq 0 ]] || die "Run as root: sudo ./install.sh"
}

check_os() {
  [[ -f /etc/os-release ]] || die "Cannot detect OS"
  # shellcheck disable=SC1091
  source /etc/os-release
  [[ "${ID:-}" == "ubuntu" ]] || die "Unsupported OS (need Ubuntu). Detected: ${ID:-unknown}"
  case "${VERSION_ID:-}" in
    24.04|22.04) ;;
    *) die "Unsupported Ubuntu version ${VERSION_ID:-unknown} (need 24.04 LTS, 22.04 accepted)" ;;
  esac
  local arch
  arch="$(uname -m)"
  [[ "$arch" == "x86_64" || "$arch" == "amd64" || "$arch" == "aarch64" ]] \
    || die "Unsupported architecture: $arch"

  local mem_kb disk_avail
  mem_kb="$(awk '/MemTotal/ {print $2}' /proc/meminfo)"
  if [[ "${mem_kb:-0}" -lt 3500000 ]]; then
    log "WARN: less than ~3.5 GiB RAM detected; 8 GiB is recommended"
  fi
  disk_avail="$(df -P /opt 2>/dev/null | awk 'NR==2{print $4}')"
  if [[ "${disk_avail:-0}" -lt 8000000 ]]; then
    log "WARN: low free disk under /opt"
  fi
}

install_base_packages() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y --no-install-recommends \
    ca-certificates curl gnupg git nginx ufw openssl jq \
    needrestart
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    log "Docker Engine + Compose plugin already present"
    return 0
  fi

  install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
  fi

  # shellcheck disable=SC1091
  source /etc/os-release
  local arch
  arch="$(dpkg --print-architecture)"
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' \
    "$arch" "${VERSION_CODENAME}" >/etc/apt/sources.list.d/docker.list

  apt-get update -y
  apt-get install -y --no-install-recommends \
    docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  systemctl enable --now docker
}

configure_docker_log_defaults() {
  mkdir -p /etc/docker
  if [[ ! -f /etc/docker/daemon.json ]]; then
    cat >/etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "20m",
    "max-file": "5"
  }
}
EOF
    systemctl restart docker
  else
    log "Leaving existing /etc/docker/daemon.json unchanged"
  fi
}

create_user_and_dirs() {
  if ! id -u siteflower >/dev/null 2>&1; then
    useradd --system --create-home --home-dir /home/siteflower --shell /bin/bash siteflower
  fi
  usermod -aG docker siteflower || true

  mkdir -p /etc/siteflower \
    "$SITEFLOWER_OPT_DIR" \
    "$SITEFLOWER_BACKUP_DIR" \
    "$SITEFLOWER_STATE_DIR" \
    "$SITEFLOWER_RELEASES_DIR" \
    /var/log/siteflower

  chown root:siteflower /etc/siteflower
  chmod 750 /etc/siteflower
  chown siteflower:siteflower "$SITEFLOWER_OPT_DIR" "$SITEFLOWER_STATE_DIR" "$SITEFLOWER_RELEASES_DIR"
  chown root:siteflower "$SITEFLOWER_BACKUP_DIR"
  chmod 750 "$SITEFLOWER_BACKUP_DIR"
  chmod 755 /var/log/siteflower
}

seed_env_template() {
  local dest="/etc/siteflower/production.env"
  local template="${SCRIPT_DIR}/deploy/env/production.env.example"
  if [[ -f "$dest" ]]; then
    log "Keeping existing $dest (not overwritten)"
    return 0
  fi
  local session_hmac recovery_key db_pass enc
  session_hmac="$(openssl rand -base64 48 | tr -d '\n')"
  recovery_key="$(openssl rand -base64 32 | tr -d '\n')"
  db_pass="$(openssl rand -base64 36 | tr -d '\n=/+' | head -c 32)"
  enc="$(urlencode "$db_pass")"

  umask 077
  sed \
    -e "s|^SESSION_HMAC_SECRET=.*|SESSION_HMAC_SECRET=${session_hmac}|" \
    -e "s|^ORDER_RECOVERY_ENCRYPTION_KEY=.*|ORDER_RECOVERY_ENCRYPTION_KEY=${recovery_key}|" \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${db_pass}|" \
    -e "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://siteflower:${enc}@postgres:5432/siteflower?schema=public|" \
    "$template" >"$dest"
  chmod 640 "$dest"
  chown root:siteflower "$dest"
  log "Created $dest with generated DB password + session/recovery secrets"
  log "EDIT remaining placeholders (domain, S3) before deploy"
}

prepare_checkout() {
  # Prefer using the directory from which install.sh was invoked (cloned repo).
  local src="$SCRIPT_DIR"
  if [[ ! -f "$src/package.json" || ! -f "$src/deploy/docker-compose.prod.yml" ]]; then
    die "install.sh must be run from a SiteFlower git checkout"
  fi
  chmod +x \
    "$src/install.sh" \
    "$src/deploy.sh" \
    "$src/rollback.sh" \
    "$src/backup.sh" \
    "$src/healthcheck.sh" \
    "$src/admin-create.sh" \
    || true
  if [[ "$src" != "$SITEFLOWER_OPT_DIR" && ! -e "$SITEFLOWER_OPT_DIR/current" ]]; then
    ln -sfn "$src" "$SITEFLOWER_OPT_DIR/current"
    log "Linked $SITEFLOWER_OPT_DIR/current -> $src"
  fi
  chown -R siteflower:siteflower "$src" || true
}

configure_nginx() {
  install -m 644 "${SCRIPT_DIR}/deploy/nginx/siteflower-map.conf" \
    /etc/nginx/conf.d/siteflower-map.conf

  local domain="${SITEFLOWER_DOMAIN:-_}"
  if [[ -f /etc/siteflower/production.env ]]; then
    # shellcheck disable=SC1091
    set -a; source /etc/siteflower/production.env; set +a
    domain="${SITEFLOWER_DOMAIN:-${NEXT_PUBLIC_SITE_URL:-_}}"
    domain="${domain#https://}"
    domain="${domain#http://}"
    domain="${domain%%/*}"
  fi
  [[ -n "$domain" ]] || domain='_'

  sed "s/__SITEFLOWER_DOMAIN__/${domain}/g" \
    "${SCRIPT_DIR}/deploy/nginx/siteflower.conf.template" \
    >"$SITEFLOWER_NGINX_AVAILABLE"
  ln -sfn "$SITEFLOWER_NGINX_AVAILABLE" "$SITEFLOWER_NGINX_ENABLED"
  # Disable default site if present to avoid conflicts
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl enable --now nginx
  systemctl reload nginx
}

configure_ufw() {
  if ! command -v ufw >/dev/null 2>&1; then
    log "ufw not installed; skipping firewall"
    return 0
  fi
  # Allow SSH BEFORE enabling — never lock the operator out.
  ufw allow OpenSSH || ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable
  ufw status verbose || true
  log "UFW enabled with 22/80/443. Postgres/API/Web are not publicly allowed."
}

print_summary() {
  cat <<EOF

============================================================
SiteFlower VPS bootstrap complete
============================================================
Docker:     $(docker --version 2>/dev/null || echo missing)
Compose:    $(docker compose version 2>/dev/null || echo missing)
Nginx:      $(nginx -v 2>&1 || true)
Env file:   /etc/siteflower/production.env
App link:   ${SITEFLOWER_OPT_DIR}/current
Backups:    ${SITEFLOWER_BACKUP_DIR}

NEXT MANUAL STEPS:
  1) Edit /etc/siteflower/production.env
     - NEXT_PUBLIC_SITE_URL / CORS_ORIGINS / SITEFLOWER_DOMAIN
     - HostFly S3_* fields
     - Confirm DATABASE_URL host is "postgres"
  2) Point DNS A/AAAA to this VPS
  3) From the repo as a user in group docker (or siteflower):
       ./deploy.sh
  4) Create admin:
       ./admin-create.sh
  5) After DNS is live, issue TLS:
       sudo certbot --nginx -d YOUR_DOMAIN
  6) Verify:
       ./healthcheck.sh

Docs: docs/deployment-hostfly.md
============================================================
EOF
}

main() {
  require_root
  check_os
  install_base_packages
  install_docker
  configure_docker_log_defaults
  create_user_and_dirs
  seed_env_template
  prepare_checkout
  configure_nginx
  configure_ufw
  print_summary
}

main "$@"

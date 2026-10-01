#!/usr/bin/env bash
# shopbuket1 — first-time Ubuntu 24.04 VPS bootstrap (HostFly).
# Usage: sudo ./install.sh
#
# Safe to re-run. Does NOT overwrite an existing /etc/shopbuket1/production.env.
# Does NOT run docker system prune. Does NOT touch erpbuket1 resources.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib/common.sh
source "${SCRIPT_DIR}/deploy/lib/common.sh"
# shellcheck source=deploy/lib/nginx.sh
source "${SCRIPT_DIR}/deploy/lib/nginx.sh"

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
    certbot needrestart
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
  if ! id -u shopbuket1 >/dev/null 2>&1; then
    useradd --system --create-home --home-dir /home/shopbuket1 --shell /bin/bash shopbuket1
  fi
  usermod -aG docker shopbuket1 || true

  mkdir -p /etc/shopbuket1 \
    "$SHOPBUKET1_OPT_DIR" \
    "$SHOPBUKET1_BACKUP_DIR" \
    "$SHOPBUKET1_STATE_DIR" \
    "$SHOPBUKET1_RELEASES_DIR" \
    /var/log/shopbuket1

  chown root:shopbuket1 /etc/shopbuket1
  chmod 750 /etc/shopbuket1
  chown shopbuket1:shopbuket1 "$SHOPBUKET1_OPT_DIR" "$SHOPBUKET1_STATE_DIR" "$SHOPBUKET1_RELEASES_DIR"
  chown root:shopbuket1 "$SHOPBUKET1_BACKUP_DIR"
  chmod 750 "$SHOPBUKET1_BACKUP_DIR"
  chmod 755 /var/log/shopbuket1
}

# Migrates/cleans ONLY obsolete pre-deploy bootstrap paths from the first
# siteflower-named install.sh. Never deletes Docker volumes or foreign stacks.
migrate_legacy_siteflower_bootstrap() {
  local legacy_env="/etc/siteflower/production.env"
  local new_env="/etc/shopbuket1/production.env"
  local has_pg_volume=0
  local has_running=0

  if command -v docker >/dev/null 2>&1; then
    if docker volume inspect siteflower_pgdata >/dev/null 2>&1 \
      || docker volume inspect shopbuket1_pgdata >/dev/null 2>&1; then
      has_pg_volume=1
    fi
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -Eq '^(siteflower|shopbuket1)-'; then
      has_running=1
    fi
  fi

  if [[ "$has_pg_volume" -eq 1 || "$has_running" -eq 1 ]]; then
    log "Legacy bootstrap cleanup: Docker volume/container for siteflower/shopbuket1 detected."
    log "Refusing automatic deletion of DB volumes/containers. Only config path migration may proceed."
  fi

  # Move env file if the new path is missing.
  if [[ -f "$legacy_env" && ! -f "$new_env" ]]; then
    mkdir -p /etc/shopbuket1
    cp -a "$legacy_env" "$new_env"
    # Domain config key rename (infrastructure is shopbuket1; domain stays config-only).
    if grep -q '^SITEFLOWER_DOMAIN=' "$new_env"; then
      sed -i 's/^SITEFLOWER_DOMAIN=/PUBLIC_DOMAIN=/' "$new_env"
    fi
    chown root:shopbuket1 "$new_env"
    chmod 640 "$new_env"
    log "Migrated $legacy_env -> $new_env"
  elif [[ -f "$legacy_env" && -f "$new_env" ]]; then
    log "Both legacy and new env files exist; keeping $new_env (not overwriting)"
  fi

  # Obsolete Nginx site from first bootstrap (replaced by shopbuket1 below).
  rm -f /etc/nginx/sites-enabled/siteflower \
    /etc/nginx/sites-available/siteflower \
    /etc/nginx/conf.d/siteflower-map.conf

  # Symlink-only current pointer (never delete a real git checkout under /opt/siteflower/repo).
  if [[ -L /opt/siteflower/current ]]; then
    rm -f /opt/siteflower/current
    log "Removed legacy symlink /opt/siteflower/current"
  fi

  # Empty / near-empty legacy dirs only.
  for d in /etc/siteflower /var/backups/siteflower /var/lib/siteflower /var/log/siteflower; do
    if [[ -d "$d" ]]; then
      # Do not delete if non-empty beyond a leftover env we already migrated.
      if [[ "$d" == "/etc/siteflower" && -f "$d/production.env" && -f "$new_env" ]]; then
        rm -f "$d/production.env"
      fi
      if [[ -z "$(find "$d" -mindepth 1 -maxdepth 1 2>/dev/null | head -n1)" ]]; then
        rmdir "$d" 2>/dev/null && log "Removed empty legacy dir $d" || true
      else
        log "WARN: legacy dir $d is not empty — left in place for manual review"
        find "$d" -mindepth 1 -maxdepth 2 -printf '  leftover: %p\n' 2>/dev/null || true
      fi
    fi
  done

  # /opt/siteflower: remove only if empty or only contains an empty repo placeholder.
  if [[ -d /opt/siteflower ]]; then
    if [[ -d /opt/siteflower/repo ]]; then
      log "NOTE: /opt/siteflower/repo still exists. Prefer moving the checkout to /opt/shopbuket1/repo"
      log "  Example: sudo mv /opt/siteflower/repo /opt/shopbuket1/repo"
    fi
    if [[ -z "$(find /opt/siteflower -mindepth 1 -maxdepth 1 2>/dev/null | head -n1)" ]]; then
      rmdir /opt/siteflower 2>/dev/null && log "Removed empty legacy dir /opt/siteflower" || true
    fi
  fi

  # Never auto-delete Docker volumes named siteflower_* — even if "unused".
  if [[ "$has_pg_volume" -eq 0 ]]; then
    log "No siteflower_pgdata/shopbuket1_pgdata volume detected — OK for pre-deploy bootstrap repair"
  else
    log "Docker volumes present — they were NOT deleted (by design)"
  fi
}

seed_env_template() {
  local dest="/etc/shopbuket1/production.env"
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
    -e "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://shopbuket1:${enc}@postgres:5432/shopbuket1?schema=public|" \
    "$template" >"$dest"
  chmod 640 "$dest"
  chown root:shopbuket1 "$dest"
  log "Created $dest with generated DB password + session/recovery secrets"
  log "EDIT remaining placeholders (NEXT_PUBLIC_SITE_URL / CORS_ORIGINS / S3) before deploy"
}

prepare_checkout() {
  local src="$SCRIPT_DIR"
  if [[ ! -f "$src/package.json" || ! -f "$src/deploy/docker-compose.prod.yml" ]]; then
    die "install.sh must be run from the shopbuket1 application git checkout"
  fi
  chmod +x \
    "$src/install.sh" \
    "$src/deploy.sh" \
    "$src/provision-nginx.sh" \
    "$src/rollback.sh" \
    "$src/backup.sh" \
    "$src/healthcheck.sh" \
    "$src/admin-create.sh" \
    || true
  if [[ "$src" != "$SHOPBUKET1_OPT_DIR" && ! -e "$SHOPBUKET1_OPT_DIR/current" ]]; then
    ln -sfn "$src" "$SHOPBUKET1_OPT_DIR/current"
    log "Linked $SHOPBUKET1_OPT_DIR/current -> $src"
  fi
  chown -R shopbuket1:shopbuket1 "$src" || true
}

configure_nginx() {
  # Bootstrap may run before env placeholders are replaced — never write YOUR_DOMAIN.
  provision_nginx bootstrap
}

configure_ufw() {
  if ! command -v ufw >/dev/null 2>&1; then
    log "ufw not installed; skipping firewall"
    return 0
  fi
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
shopbuket1 VPS bootstrap complete
============================================================
Docker:     $(docker --version 2>/dev/null || echo missing)
Compose:    $(docker compose version 2>/dev/null || echo missing)
Nginx:      $(nginx -v 2>&1 || true)
Env file:   /etc/shopbuket1/production.env
App link:   ${SHOPBUKET1_OPT_DIR}/current
Backups:    ${SHOPBUKET1_BACKUP_DIR}

NEXT MANUAL STEPS:
  1) Edit /etc/shopbuket1/production.env
     - NEXT_PUBLIC_SITE_URL=https://shop.example.com
     - CORS_ORIGINS=https://shop.example.com
     - optional PUBLIC_DOMAIN=shop.example.com
     - CERTBOT_EMAIL=ops@example.com  (for Let's Encrypt)
     - HostFly S3_* (example bucket: shopbuket1-media)
     - Confirm DATABASE_URL host is "postgres"
  2) Point DNS A/AAAA to this VPS
  3) Provision Nginx + TLS (idempotent; rejects YOUR_DOMAIN):
       sudo ./provision-nginx.sh
  4) From the repo as a user in group docker (or shopbuket1):
       ./deploy.sh
  5) Create admin:
       ./admin-create.sh
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
  migrate_legacy_siteflower_bootstrap
  seed_env_template
  prepare_checkout
  configure_nginx
  configure_ufw
  print_summary
}

main "$@"

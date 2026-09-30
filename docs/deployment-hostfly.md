# HostFly production deployment (Ubuntu 24.04 + Docker Compose + Nginx)

Infrastructure identity for this storefront stack: **`shopbuket1`** (domain-neutral).

Future ERP on the same VPS uses a separate identity: **`erpbuket1`**.

Public domains (`NEXT_PUBLIC_SITE_URL`, `CORS_ORIGINS`, Nginx `server_name`, TLS certs) are **configuration only**. Changing the domain later must not require recreating Docker volumes, PostgreSQL data, S3 media, or reinstalling the VPS.

Local development is unchanged (`docker compose up -d` still starts **Postgres only** on host port 5433).

## Architecture

```text
Internet
  -> Nginx :80/:443 (host)
       -> 127.0.0.1:3000  shopbuket1-web
       -> 127.0.0.1:3001  shopbuket1-api   (/api/*)
  -> Docker network shopbuket1_internal
       -> web, api, postgres[(optional) worker]
HostFly S3  <- API only (credentials never in NEXT_PUBLIC_*)
```

| Resource | shopbuket1 | erpbuket1 (future) |
| --- | --- | --- |
| Compose project | `shopbuket1` | `erpbuket1` |
| Network | `shopbuket1_internal` | `erpbuket1_*` |
| Volume | `shopbuket1_pgdata` | `erpbuket1_*` |
| Opt dir | `/opt/shopbuket1` | `/opt/erpbuket1` |
| Env | `/etc/shopbuket1` | `/etc/erpbuket1` |
| Backups | `/var/backups/shopbuket1` | `/var/backups/erpbuket1` |
| Example S3 bucket | `shopbuket1-media` | `erpbuket1-media` |

**Worker:** not started by default. Outbox delivery stays off until `INTEGRATION_ENABLED=true` and `INTEGRATION_MODE` is `SIMULATOR` or `ERP`. Then:

```bash
export SHOPBUKET1_ENV_FILE=/etc/shopbuket1/production.env
docker compose -p shopbuket1 -f deploy/docker-compose.prod.yml --env-file "$SHOPBUKET1_ENV_FILE" --profile integrations up -d
```

## Paths

| Path | Purpose |
| --- | --- |
| `/opt/shopbuket1/current` | Symlink to the git checkout used for ops |
| `/etc/shopbuket1/production.env` | Secrets (mode `640`, `root:shopbuket1`) |
| `/var/backups/shopbuket1` | Postgres dumps |
| `/var/lib/shopbuket1` | Release metadata + deploy lock |
| `/etc/nginx/sites-available/shopbuket1` | Nginx site |

## A. First install (clean Ubuntu VPS)

```bash
ssh root@YOUR_VPS_IP
apt-get update && apt-get install -y git
git clone <THIS_REPOSITORY_URL> /opt/shopbuket1/repo
cd /opt/shopbuket1/repo
sudo ./install.sh
```

`install.sh` (idempotent):

- Installs Docker Engine (official Docker apt repo) + Compose plugin + Nginx + UFW
- Creates system user `shopbuket1` (docker group)
- Seeds `/etc/shopbuket1/production.env` **only if missing**
- Installs Nginx site `shopbuket1` (HTTP; `server_name` from config)
- Enables UFW for **22/80/443 only**

It does **not** overwrite an existing production env. It never runs `docker system prune`. It never touches `erpbuket1*`.

If an older (pre-rename) `install.sh` already created `/etc/siteflower`, `/opt/siteflower/current`, etc. **and** `./deploy.sh` has not been run yet, re-running `sudo ./install.sh` from this revision migrates the env file to `/etc/shopbuket1/production.env` and removes only empty/obsolete bootstrap paths. It never deletes Docker volumes.

## Repair VPS after a one-time legacy bootstrap (no deploy yet)

On the VPS where the old `install.sh` already ran but **`./deploy.sh` was never run**:

```bash
# 1) Pull the fixed revision into the checkout you used (adjust path if needed)
cd /opt/siteflower/repo 2>/dev/null || cd /opt/shopbuket1/repo 2>/dev/null || cd "$(pwd)"
git fetch origin
git checkout main
git pull --ff-only origin main

# 2) Re-run install (creates shopbuket1 paths + migrates legacy bootstrap)
sudo ./install.sh

# 3) Confirm new paths
ls -la /etc/shopbuket1/production.env
ls -la /opt/shopbuket1/current
test ! -e /etc/siteflower && echo "legacy /etc/siteflower gone"
test ! -e /opt/siteflower/current && echo "legacy current symlink gone"

# 4) If the git checkout still lives under /opt/siteflower/repo, move it:
# sudo mkdir -p /opt/shopbuket1
# sudo mv /opt/siteflower/repo /opt/shopbuket1/repo
# sudo ln -sfn /opt/shopbuket1/repo /opt/shopbuket1/current
# cd /opt/shopbuket1/repo

# 5) Edit secrets/domain/S3 (PUBLIC_DOMAIN / NEXT_PUBLIC_SITE_URL — not SITEFLOWER_DOMAIN)
sudoeditor /etc/shopbuket1/production.env

# 6) Only now deploy
./deploy.sh
```

**Do not** run `docker volume rm` / `docker system prune` as part of this repair.

## B. Fill production env

```bash
sudoeditor /etc/shopbuket1/production.env
```

Must set at least:

- `NEXT_PUBLIC_SITE_URL=https://YOUR_DOMAIN`
- `CORS_ORIGINS=https://YOUR_DOMAIN`
- optional `PUBLIC_DOMAIN=YOUR_DOMAIN` (Nginx `server_name`; defaults from site URL)
- `TRUST_PROXY=true`
- `MEDIA_STORAGE=s3` + all `S3_*` (example bucket `shopbuket1-media`)
- Confirm `DATABASE_URL` host is **`postgres`**

## C. HostFly S3 fields

| Variable | Meaning |
| --- | --- |
| `S3_ENDPOINT` | HostFly S3 API endpoint (HTTPS) |
| `S3_REGION` | Usually `auto` |
| `S3_BUCKET` | e.g. `shopbuket1-media` (ERP: `erpbuket1-media`) |
| `S3_ACCESS_KEY_ID` | Access key |
| `S3_SECRET_ACCESS_KEY` | Secret key |
| `S3_PUBLIC_BASE_URL` | Public HTTPS base for browsers / `next/image` |
| `S3_FORCE_PATH_STYLE` | Default `true` |

After deploy: Admin → **Медиа / Site Health** → **Проверить хранилище**, then upload a real product image.

## D–E. DNS + TLS

1. Point DNS A/AAAA to the VPS.
2. Reload Nginx after editing domain config: `sudo nginx -t && sudo systemctl reload nginx`
3. Issue certificate **only after DNS resolves**:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d YOUR_DOMAIN
```

Changing `YOUR_DOMAIN` later is a config/cert change — not a volume recreate.

## F. First deploy

```bash
cd /opt/shopbuket1/repo   # or /opt/shopbuket1/current
./deploy.sh
```

Optional: `./deploy.sh <git-ref>`

## G. SUPER_ADMIN

```bash
./admin-create.sh
# or
./admin-create.sh --email director@example.com --name "Director"
```

Runs inside `shopbuket1-api`. No default password.

## H. Verify

```bash
./healthcheck.sh
```

```bash
export SHOPBUKET1_ENV_FILE=/etc/shopbuket1/production.env
docker compose -p shopbuket1 -f deploy/docker-compose.prod.yml --env-file "$SHOPBUKET1_ENV_FILE" restart api web
```

## I–K. Update / rollback / backup

```bash
./deploy.sh
./rollback.sh
./backup.sh
```

Restore (destructive — practice on a staging clone first):

```bash
export SHOPBUKET1_ENV_FILE=/etc/shopbuket1/production.env
docker compose -p shopbuket1 -f deploy/docker-compose.prod.yml --env-file "$SHOPBUKET1_ENV_FILE" stop api web worker || true

docker exec -i shopbuket1-postgres \
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists \
  < /var/backups/shopbuket1/shopbuket1-YYYYMMDDThhmmssZ-manual.dump

docker compose -p shopbuket1 -f deploy/docker-compose.prod.yml --env-file "$SHOPBUKET1_ENV_FILE" start api web
./healthcheck.sh
```

## Public vs private ports

| Public | Not public |
| --- | --- |
| 22/tcp SSH | 5432 Postgres |
| 80/tcp HTTP | Docker API |
| 443/tcp HTTPS | Direct 3000/3001 from the internet (bound to `127.0.0.1` only) |

## Isolation guarantees

shopbuket1 scripts:

- Use Compose project `-p shopbuket1` only
- Prune/delete only images matching `shopbuket1-*`
- Refuse names starting with `erpbuket1`
- Never run `docker system prune` / `volume prune`

## Related docs

- [production-readiness.md](./production-readiness.md)
- [media-production.md](./media-production.md)
- [security.md](./security.md)

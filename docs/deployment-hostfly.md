# HostFly production deployment (Ubuntu 24.04 + Docker Compose + Nginx)

Infrastructure identity for this storefront stack: **`shopbuket1`** (domain-neutral).

Future ERP on the same VPS uses a separate identity: **`erpbuket1`**.

Public domains (`NEXT_PUBLIC_SITE_URL`, `CORS_ORIGINS`, Nginx `server_name`, TLS certs) are **configuration only**. Changing the domain later must not require recreating Docker volumes, PostgreSQL data, S3 media, or reinstalling the VPS.

Local development is unchanged (`docker compose up -d` still starts **Postgres only** on host port 5433).

## Production container packaging

- API image (`deploy/Dockerfile.api`) builds the monorepo, then runs
  `pnpm --filter @bouquet-one/api --prod deploy /out` with
  `injectWorkspacePackages: true` so NestJS and workspace packages land in a
  portable production `node_modules` (no broken pnpm symlinks into a missing
  monorepo tree).
- Prisma CLI remains in the API image for `prisma migrate deploy` during
  `./deploy.sh`. Real `DATABASE_URL` is supplied only at runtime from
  `/etc/shopbuket1/production.env` (a build-time dummy URL is used solely for
  `prisma generate`).
- Web image uses Next.js `output: 'standalone'`.

## Architecture

```text
Internet
  -> Nginx :80/:443 (host)
       -> 127.0.0.1:3000  shopbuket1-web
       -> 127.0.0.1:3001  shopbuket1-api   (/api/*)
  -> Docker network shopbuket1_internal
       -> web, api, postgres[(optional) worker]
       -> api --POST /api/revalidate--> web:3000  (internal; REVALIDATE_SECRET)
HostFly S3  <- API only (credentials never in NEXT_PUBLIC_*)
```

**Storefront revalidation:** after admin catalog/storefront mutations the API calls
`http://web:3000/api/revalidate` on the Compose network (not the public HTTPS domain).
Set `REVALIDATE_SECRET` (≥16) in `production.env` to enable; leave unset for fail-soft no-op.
Do not add `depends_on: web` on the api service (web already waits on healthy api).

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
- Installs Nginx site `shopbuket1` via `deploy/lib/nginx.sh` (never writes `YOUR_DOMAIN`)
- Installs `certbot` for later TLS; TLS itself is applied by `sudo ./provision-nginx.sh` after DNS + real domain in env
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

- `NEXT_PUBLIC_SITE_URL=https://shop.nasytko.ru` (real FQDN — never `YOUR_DOMAIN`)
- `CORS_ORIGINS=https://shop.nasytko.ru`
- optional `PUBLIC_DOMAIN=shop.nasytko.ru` (Nginx `server_name`; defaults to host from `NEXT_PUBLIC_SITE_URL`)
- `CERTBOT_EMAIL=ops@example.com` (Let's Encrypt account email for `provision-nginx.sh`)
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
| `S3_PUBLIC_BASE_URL` | Public HTTPS base for browsers / API media URLs **and** Next.js `images.remotePatterns` (Docker **build-arg** — rebuild web image when this changes) |
| `S3_FORCE_PATH_STYLE` | Default `true` |

After deploy: Admin → **Медиа / Site Health** → **Проверить хранилище**, then upload a real product image.

## D–E. DNS + Nginx/TLS provisioning

1. Point DNS A/AAAA for the shop hostname to the VPS.
2. Ensure `/etc/shopbuket1/production.env` has a real domain + `CERTBOT_EMAIL` (not `YOUR_DOMAIN`).
3. Provision Nginx + Let's Encrypt **idempotently** (owns the site file; certs stay under `/etc/letsencrypt`, never in Git):

```bash
cd /opt/shopbuket1/repo   # or /opt/shopbuket1/current
sudo ./provision-nginx.sh
```

What it does:

- Resolves `PUBLIC_DOMAIN` or host of `NEXT_PUBLIC_SITE_URL`
- Rejects placeholders (`YOUR_DOMAIN`, `example.com`, …)
- Writes `/etc/nginx/sites-available/shopbuket1` with correct `server_name`
- Runs `nginx -t` before every reload
- Issues/reuses Let's Encrypt cert via webroot when `CERTBOT_EMAIL` is set
- When cert exists: `listen 443`, HTTP→HTTPS redirect, same `/api/` + `/` proxy scheme
- Installs renew hook: `nginx -t && systemctl reload nginx`

### Repair an existing VPS that still has `server_name YOUR_DOMAIN`

```bash
cd /opt/shopbuket1/repo 2>/dev/null || cd /opt/shopbuket1/current
git pull --ff-only origin main

# 1) Fix domain + certbot email (example for shop.nasytko.ru)
sudoeditor /etc/shopbuket1/production.env
# NEXT_PUBLIC_SITE_URL=https://shop.nasytko.ru
# CORS_ORIGINS=https://shop.nasytko.ru
# PUBLIC_DOMAIN=shop.nasytko.ru
# CERTBOT_EMAIL=you@example.com

# 2) Re-render Nginx + issue/install TLS
sudo ./provision-nginx.sh

# 3) Confirm
sudo grep -E 'server_name|listen' /etc/nginx/sites-available/shopbuket1
sudo nginx -t
curl -fsSI http://shop.nasytko.ru/ | head
curl -fsSI https://shop.nasytko.ru/ | head
./healthcheck.sh
```

Changing the public domain later is a config/cert change — not a volume recreate. Re-run `sudo ./provision-nginx.sh` after editing env.

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

Runs inside `shopbuket1-api` as `node dist/cli/admin-create.js` (compiled production CLI; no TypeScript source tree required). No default password.


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

## Media orphan cleanup (ops)

Canonical command (dry-run by default — never destructive without `--execute`):

```bash
pnpm media:cleanup              # preview candidates past 7-day orphanedAt grace
pnpm media:cleanup -- --execute # delete S3 master+derivatives then MediaAsset rows
```

Run on a schedule (cron/systemd timer) against the API host with production env. Prefer dry-run after deploy before the first `--execute`. Cleanup is retry-safe: S3 failures leave DB metadata; missing keys are treated as success.

See [media-production.md](./media-production.md) for lifecycle details.

## Related docs

- [production-readiness.md](./production-readiness.md)
- [media-production.md](./media-production.md)
- [security.md](./security.md)

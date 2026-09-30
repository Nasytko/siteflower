# HostFly production deployment (Ubuntu 24.04 + Docker Compose + Nginx)

SiteFlower-only, namespaced so NewERP can share the same VPS later without collisions.

Local development is unchanged (`docker compose up -d` still starts **Postgres only** on host port 5433).

## Architecture

```text
Internet
  -> Nginx :80/:443 (host)
       -> 127.0.0.1:3000  siteflower-web
       -> 127.0.0.1:3001  siteflower-api   (/api/*)
  -> Docker network siteflower_internal
       -> web, api, postgres[(optional) worker]
HostFly S3  <- API only (credentials never in NEXT_PUBLIC_*)
```

Compose project name: **`siteflower`**  
Volumes: **`siteflower_pgdata`** only  
Networks: **`siteflower_internal`** only

**Worker:** not started by default. Outbox delivery stays off until `INTEGRATION_ENABLED=true` and `INTEGRATION_MODE` is `SIMULATOR` or `ERP`. Then:

```bash
docker compose -p siteflower -f deploy/docker-compose.prod.yml --profile integrations up -d
```

## Paths

| Path | Purpose |
| --- | --- |
| `/opt/siteflower/current` | Symlink to the git checkout used for ops |
| `/etc/siteflower/production.env` | Secrets (mode `640`, `root:siteflower`) |
| `/var/backups/siteflower` | Postgres dumps |
| `/var/lib/siteflower` | Release metadata + deploy lock |

## A. First install (clean Ubuntu VPS)

On your laptop (or any machine with SSH):

```bash
ssh root@YOUR_VPS_IP
apt-get update && apt-get install -y git
git clone https://github.com/Nasytko/siteflower.git /opt/siteflower/repo
cd /opt/siteflower/repo
sudo ./install.sh
```

`install.sh` (idempotent):

- Installs Docker Engine (official Docker apt repo) + Compose plugin + Nginx + UFW
- Creates system user `siteflower` (docker group)
- Seeds `/etc/siteflower/production.env` **only if missing** (generates DB password, `SESSION_HMAC_SECRET`, `ORDER_RECOVERY_ENCRYPTION_KEY`)
- Installs Nginx site (HTTP)
- Enables UFW for **22/80/443 only** (SSH allowed before enable)

It does **not** overwrite an existing production env. It never runs `docker system prune`.

## B. Fill production env

```bash
sudo -u root editable=true nano /etc/siteflower/production.env
# or: sudoeditor /etc/siteflower/production.env
```

Must set at least:

- `NEXT_PUBLIC_SITE_URL=https://YOUR_DOMAIN`
- `CORS_ORIGINS=https://YOUR_DOMAIN`
- `SITEFLOWER_DOMAIN=YOUR_DOMAIN` (optional; Nginx uses it)
- `TRUST_PROXY=true`
- `MEDIA_STORAGE=s3` + all `S3_*`
- Confirm `DATABASE_URL` host is **`postgres`** (Docker DNS)

## C. HostFly S3 fields to obtain

| Variable | Meaning |
| --- | --- |
| `S3_ENDPOINT` | HostFly S3 API endpoint (HTTPS) |
| `S3_REGION` | Usually `auto` or the region HostFly documents |
| `S3_BUCKET` | Bucket name for product media |
| `S3_ACCESS_KEY_ID` | Access key (least privilege on this bucket) |
| `S3_SECRET_ACCESS_KEY` | Secret key |
| `S3_PUBLIC_BASE_URL` | Public HTTPS base used by browsers / `next/image` |
| `S3_FORCE_PATH_STYLE` | Default `true` (required for most HostFly/MinIO-compatible APIs) |

Do **not** make the bucket world-listable. Public-read on object URLs (or CDN in front) matches the existing media model — see [media-production.md](./media-production.md).

Repository tests cannot prove HostFly S3. After deploy: Admin → **Медиа / Site Health** → **Проверить хранилище**, then upload a real product image.

## D–E. DNS + TLS

1. Point DNS A/AAAA to the VPS.
2. Reload Nginx after editing domain: `sudo nginx -t && sudo systemctl reload nginx`
3. Issue certificate **only after DNS resolves**:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d YOUR_DOMAIN
```

Do not fake HTTPS before DNS is ready.

## F. First deploy

As a user in group `docker` (e.g. `siteflower`):

```bash
cd /opt/siteflower/repo   # or /opt/siteflower/current
./deploy.sh
```

Optional immutable ref:

```bash
./deploy.sh v1.2.3
# or
./deploy.sh abcdef012345
```

`deploy.sh` will:

1. Take a deploy lock  
2. Validate production env  
3. Fetch/checkout the ref (refuses dirty trees unless ref given)  
4. Build `siteflower-api:<sha>` and `siteflower-web:<sha>`  
5. Start Postgres  
6. `./backup.sh pre-migrate`  
7. `prisma migrate deploy` inside the API image  
8. Recreate api/web  
9. `./healthcheck.sh`  
10. Record release metadata for rollback  

**Downtime:** single-VPS recreate is short but **not** zero-downtime.

## G. SUPER_ADMIN

```bash
./admin-create.sh
# or
./admin-create.sh --email director@example.com --name "Director"
```

Uses the existing interactive `pnpm admin:create` inside `siteflower-api`. No default password.

## H. Verify

```bash
./healthcheck.sh
```

Then manually:

- Storefront homepage
- Admin login
- Медиа / Site Health probe + real upload
- Cart → checkout
- Restart stack and confirm media still loads from S3

```bash
docker compose -p siteflower -f deploy/docker-compose.prod.yml restart api web
```

## I. Normal update

```bash
./deploy.sh
```

## J. Rollback (application only)

```bash
./rollback.sh
```

Restores previous **images**. **Does not** reverse Prisma migrations. If a forward migration already ran, restore DB from `/var/backups/siteflower` only with an explicit recovery plan.

## K. Backup / restore

Backup:

```bash
./backup.sh
```

Custom-format dumps land in `/var/backups/siteflower/` (mode `600`). Retention: `BACKUP_RETENTION_DAYS` (default 14).

**Restore (destructive — practice on a staging clone first):**

```bash
# Stop app writers
docker compose -p siteflower -f deploy/docker-compose.prod.yml stop api web worker || true

# Restore into the SiteFlower postgres container only
docker exec -i siteflower-postgres \
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists \
  < /var/backups/siteflower/siteflower-YYYYMMDDThhmmssZ-manual.dump

docker compose -p siteflower -f deploy/docker-compose.prod.yml start api web
./healthcheck.sh
```

HostFly media S3 is **not** a substitute for Postgres DR. Keep an independent off-provider copy of dumps when you can.

## Public vs private ports

| Public | Not public |
| --- | --- |
| 22/tcp SSH | 5432 Postgres |
| 80/tcp HTTP | Docker API |
| 443/tcp HTTPS | Direct 3000/3001 from the internet (bound to `127.0.0.1` only) |

## Security notes

- Secrets live in `/etc/siteflower/production.env`, never in Git  
- Deploy lock prevents concurrent deploys  
- Git refs validated against metacharacters  
- No browser-accessible deploy endpoint / webhook  
- Scripts never run `docker system prune`, `volume prune`, or delete foreign Compose projects  
- App containers run as UID `10001` (`siteflower`)  
- `TRUST_PROXY=true` only behind Nginx  

## Related docs

- [production-readiness.md](./production-readiness.md)
- [media-production.md](./media-production.md)
- [security.md](./security.md)
- [security-hardening.md](./security-hardening.md)

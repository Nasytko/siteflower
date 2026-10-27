# SiteFlower release runbook (shopbuket1)

Pull-based model: develop locally → push GitHub → server `git pull` → preflight → deploy.

Cursor has **no SSH** to production. Never upload DB dumps to GitHub/CI.

Entry point: **`./scripts/release.sh`** (wraps existing `deploy.sh` / `backup.sh` / `rollback.sh` / `healthcheck.sh`).

---

## Paths (server)

| Path | Purpose |
|------|---------|
| `/opt/shopbuket1/repo` (or `current`) | Git checkout |
| `/etc/shopbuket1/production.env` | Secrets (not in Git) |
| `/var/backups/shopbuket1` | `pg_dump -Fc` backups |
| `/var/lib/shopbuket1` | Deploy lock + release metadata |
| `/var/lib/shopbuket1/preflight/` | Preflight PASS/FAIL JSON reports |

Compose project: **`shopbuket1`**. Never touch **`erpbuket1`**.

Production DB hostname inside Docker: **`postgres:5432`** (not localhost from host `.env`).

---

## 1. Push a release (developer workstation)

```bash
# after CI is green on the branch
git push origin HEAD
```

Do not enable automatic production deploy from GitHub Actions.

---

## 2. Fetch on the server (operator)

```bash
cd /opt/shopbuket1/repo   # or /opt/shopbuket1/current
git fetch --tags --prune origin
git checkout main
git pull --ff-only origin main
# or pin: git checkout --detach <full-sha>
```

---

## 3. Preflight (mandatory before cutover / migrate)

```bash
cd /opt/shopbuket1/repo
./scripts/release.sh preflight
# or: ./scripts/release.sh preflight <full-sha>
```

What it does (does **not** change production schema):

1. Tools / Docker / disk / env / Nginx domain checks  
2. Read-only table inventory  
3. `pg_dump -Fc` via `./backup.sh preflight` → `/var/backups/shopbuket1/`  
4. Restore into isolated DB `shopbuket1_preflight_<sha12>`  
5. `prisma migrate deploy` against that isolated DB only  
6. Relationship smoke checks  
7. Drops the temporary DB  
8. Writes `/var/lib/shopbuket1/preflight/<sha>.json` (`status: PASS|FAIL`)

Review:

```bash
./scripts/release.sh status
cat "$(cat /var/lib/shopbuket1/preflight/latest)"
```

**Stop if FAIL.** Production application and production schema are untouched.

---

## 4. Deploy (only after PASS for the same SHA)

```bash
./scripts/release.sh deploy
# or: ./scripts/release.sh deploy <same-full-sha>
```

This verifies the preflight report (same revision, recent, backup present), then runs `./deploy.sh <sha>`:

- Build API/web images tagged with commit  
- Backup again (`pre-migrate`)  
- `prisma migrate deploy` on **live** DB (single `compose run` — not duplicated by app containers)  
- Recreate api/web  
- Startup + production healthchecks (containers, API, HTTPS apex)

Then run SEO separately (not part of the production health gate):

```bash
./scripts/release.sh seo-smoke
# or: ./healthcheck.sh --seo
```

---

## 5. Verify success

```bash
./healthcheck.sh --production
./scripts/release.sh status
curl -fsS https://buketnomer1.by/api/v1/health
curl -fsSI https://buketnomer1.by/bukety | head
curl -fsS https://buketnomer1.by/sitemap.xml | head
```

Logs:

```bash
docker logs shopbuket1-api --tail 100
docker logs shopbuket1-web --tail 100
docker logs shopbuket1-postgres --tail 50
```

---

## 6. Application rollback

```bash
./scripts/release.sh rollback
# or: ./rollback.sh /var/lib/shopbuket1/releases/<file>.json
```

Restores **previous API/web images** only. **Does not** reverse Prisma migrations.

If a migration already applied is incompatible with the previous app:

1. Do **not** blindly `pg_restore` over production (destroys newer orders).  
2. Prefer a forward fix migration + redeploy.  
3. DB restore from `/var/backups/shopbuket1/*.dump` requires **explicit operator approval** and a written recovery window.

---

## 7. Catalog cutover extras (after migrate deploy)

```bash
# inside API container / ops one-shot — only after live migrate
docker compose -p shopbuket1 -f deploy/docker-compose.prod.yml \
  --env-file /etc/shopbuket1/production.env \
  run --rm --no-deps api \
  node -e "console.log('prefer compiled ops scripts when available')"
```

Use repo scripts when present in the image or from a maintenance checkout:

- `ensure-catalog-slug-redirects`  
- `migrate-legacy-nav-urls --apply`  

(See `docs/catalog-url-modernization.md`.)

---

## Local testing (developer)

```bash
bash deploy/test/release-preflight.test.sh
bash deploy/test/deploy-health.test.sh
```

Full server preflight cannot be claimed from Cursor (no production access).

---

## Approvals required

| Action | Approval |
|--------|----------|
| Push to GitHub | normal review / CI green |
| Server `preflight` | ops (read-only + backup + isolated DB) |
| Server `deploy` (live migrate) | explicit ops approval after PASS report |
| DB restore from backup | separate written approval |
| ERP / `erpbuket1` | never |

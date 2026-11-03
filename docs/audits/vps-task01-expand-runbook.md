# VPS Runbook — Task 01 Expand (manual SSH)

**Audience:** operator on the HostFly VPS  
**Cursor / CI must not SSH here.**

| Item | Value |
|------|--------|
| Stack | `shopbuket1` |
| Compose | `deploy/docker-compose.prod.yml` |
| Project | `-p shopbuket1` |
| Services | `postgres`, `api`, `web` |
| Env | `/etc/shopbuket1/production.env` |
| Checkout | `/opt/shopbuket1/current` (symlink) or `/opt/shopbuket1/repo` |
| Branch | `feature/task-01-composition-simplify` |
| Approved SHA | `0ea13cebaac10917ccd0b0c69d2d88b83d8c0075` |
| Scripts | `./deploy.sh`, `./backup.sh`, `./rollback.sh` (repo root) |

**Forbidden (stop if tempted):**  
`prisma migrate reset` · `db push --force-reset` · `DROP DATABASE` · `docker compose down -v` · `docker volume prune` / `rm` on `shopbuket1_pgdata` · deferred **contract** SQL · production seed · `git reset --hard` · auto DB rollback.

**Safe deploy order (implemented by `./deploy.sh staging <SHA>`):**  
checkout SHA → build SHA-tagged API/Web images → **backup** → **`prisma migrate deploy` from new API image while old api/web still serve** → schema verify → recreate api/web only (volumes untouched).

---

## Шаг 1 — Preflight

```bash
export SHOPBUKET1_ENV_FILE=/etc/shopbuket1/production.env
cd /opt/shopbuket1/current   # or: cd /opt/shopbuket1/repo

test -f "$SHOPBUKET1_ENV_FILE" || { echo "Missing env"; exit 1; }
test -x ./deploy.sh && test -x ./backup.sh && test -x ./rollback.sh

git fetch --all --tags
git status
# If porcelain output is non-empty: STOP. Do not deploy; do not git reset --hard.
git rev-parse HEAD
git branch -vv
git log -3 --oneline --decorate

# Confirm the published feature commit is reachable:
git cat-file -t 0ea13cebaac10917ccd0b0c69d2d88b83d8c0075
git log -1 --oneline 0ea13cebaac10917ccd0b0c69d2d88b83d8c0075

docker compose -p shopbuket1 -f deploy/docker-compose.prod.yml --env-file "$SHOPBUKET1_ENV_FILE" ps

# Postgres health (env vars come from the container, not the host shell):
docker compose -p shopbuket1 -f deploy/docker-compose.prod.yml --env-file "$SHOPBUKET1_ENV_FILE" exec -T postgres \
  sh -lc 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

df -h /
df -h /var/lib/docker 2>/dev/null || true
ls -lt /var/backups/shopbuket1 | head

# Current migrate status from the RUNNING api image (may not know Task 01 yet):
docker compose -p shopbuket1 -f deploy/docker-compose.prod.yml --env-file "$SHOPBUKET1_ENV_FILE" exec -T api \
  sh -lc 'cd /app/node_modules/@bouquet-one/database && ./node_modules/.bin/prisma migrate status' \
  || echo "WARN: migrate status from old image failed — continue only if postgres is healthy"

# After you will checkout the feature SHA, contract must stay OUT of prisma/migrations:
# (checked again post-checkout inside deploy; spot-check on GitHub tree is enough for now)
```

Record: previous HEAD, free disk, newest existing backup name.

Optional dry-run (read-only; no mutate):

```bash
./deploy.sh staging --dry-run 0ea13cebaac10917ccd0b0c69d2d88b83d8c0075
```

---

## Шаг 2 — Backup (fresh dump — mandatory before mutate)

`./deploy.sh staging` also runs `./backup.sh staging-pre-migrate` internally.  
Still take an **extra labelled dump** first so you have a named restore point independent of deploy lock timing.

```bash
cd /opt/shopbuket1/current   # or repo
export SHOPBUKET1_ENV_FILE=/etc/shopbuket1/production.env

./backup.sh pre-task01-expand
# Prints final path on stdout; also logs size + TOC structural check.
# Retention never deletes the newest dump; aged dumps may rotate after 14 days.

ls -lh /var/backups/shopbuket1/shopbuket1-*-pre-task01-expand.dump
# Expect size >> 1KB. Do not delete previous backups manually.
```

Do **not** treat an old dump as the sole backup for this change.

---

## Шаг 3 — Expand migration + Шаг 4 — Deployment

One command performs both (migrate **before** new API serves traffic):

```bash
cd /opt/shopbuket1/current
export SHOPBUKET1_ENV_FILE=/etc/shopbuket1/production.env

./deploy.sh staging 0ea13cebaac10917ccd0b0c69d2d88b83d8c0075
```

What this does:

1. `git fetch` + **detached checkout** of the SHA (working tree must be clean unless you pass this explicit ref — explicit ref is required here).  
2. Build/pin `shopbuket1-api:0ea13cebaac1` and `shopbuket1-web:0ea13cebaac1` from that commit.  
3. Ensure postgres healthy.  
4. `./backup.sh staging-pre-migrate`.  
5. `prisma migrate deploy` via **immutable new API image id** (only `packages/database/prisma/migrations/**`).  
6. Live schema verify gate.  
7. `compose up -d --force-recreate api web` — **does not** remove volumes.  
8. Health waits + release metadata.

**Expected Task 01 migration applied:**  
`20261102220000_flower_type_composition_class`

- ADD nullable `flower_types.composition_class` (no backfill)  
- `product_components.display_name` → `DEFAULT ''` + DROP NOT NULL  
- reaffirm `unit`/`role` defaults  
- **no DROP** of `quantity` / `unit` / `role` / `color_id` / `display_name`  
- **does not** delete products or orders  

**Must NOT apply:**  
`packages/database/prisma/deferred/20261102230000_simplify_product_composition_contract.sql`  
(not under `prisma/migrations` → invisible to `migrate deploy`)

### Verify after deploy

```bash
export SHOPBUKET1_ENV_FILE=/etc/shopbuket1/production.env
cd /opt/shopbuket1/current

git rev-parse HEAD   # expect 0ea13cebaac10917ccd0b0c69d2d88b83d8c0075 (detached)

docker compose -p shopbuket1 -f deploy/docker-compose.prod.yml --env-file "$SHOPBUKET1_ENV_FILE" exec -T api \
  sh -lc 'cd /app/node_modules/@bouquet-one/database && ./node_modules/.bin/prisma migrate status'

docker compose -p shopbuket1 -f deploy/docker-compose.prod.yml --env-file "$SHOPBUKET1_ENV_FILE" exec -T postgres \
  sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' <<'SQL'
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'flower_types' AND column_name = 'composition_class';

SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'product_components'
  AND column_name IN ('display_name','quantity','unit','role','color_id','flower_item_id')
ORDER BY column_name;

SELECT COUNT(*) AS products FROM products;
SELECT COUNT(*) AS orders FROM orders;
SQL
```

Expect: `composition_class` present; all listed legacy component columns still present; product/order counts unchanged vs preflight notes.

### Inventory (read-only, optional after verify)

```bash
export SHOPBUKET1_ENV_FILE=/etc/shopbuket1/production.env
OUT="/var/backups/shopbuket1/inventory-task01-$(date -u +%Y%m%dT%H%M%SZ).txt"

docker compose -p shopbuket1 -f deploy/docker-compose.prod.yml --env-file "$SHOPBUKET1_ENV_FILE" exec -T postgres \
  sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' \
  < packages/database/prisma/ops/inventory-composition-simplify-staging.sql \
  | tee "$OUT"
```

Do not auto-classify FlowerTypes. Do not run contract SQL.

---

## Шаг 5 — Smoke tests

```bash
curl -fsS http://127.0.0.1:3001/api/v1/health
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/
docker compose -p shopbuket1 -f deploy/docker-compose.prod.yml --env-file "$SHOPBUKET1_ENV_FILE" logs --tail=200 api
docker compose -p shopbuket1 -f deploy/docker-compose.prod.yml --env-file "$SHOPBUKET1_ENV_FILE" logs --tail=200 web
```

Browser / admin checklist:

1. Home  
2. Catalog (`/katalog` or hub)  
3. Product PDP — composition without stem qty from ProductComponent  
4. Unclassified FlowerTypes → product `compositionKind` **UNKNOWN** (no MONO guess)  
5. MONO/MIXED filters + thematic SEO pages (may under-select until classify)  
6. Admin product editor composition (FlowerItem list)  
7. Duplicate draft product → kind **re-derived**  
8. ERP SKU, variants, options intact  
9. Cart + checkout UI without real payment  
10. No Prisma errors on composition save  

---

## Шаг 6 — Rollback

### App images only

```bash
cd /opt/shopbuket1/current
export SHOPBUKET1_ENV_FILE=/etc/shopbuket1/production.env
./rollback.sh
```

- Does **not** reverse expand migration.  
- Old app + expand DB is the supported rollback window (additive schema + `display_name DEFAULT ''`).  
- New component rows may show empty legacy display names after app rollback — OK.  
- If deploy set `SCHEMA_ADVANCED` mid-process, `deploy.sh` itself refuses unsafe auto image rollback; use `./rollback.sh` deliberately or forward-fix.

### Never

- `docker compose down -v`  
- automatic DB rollback  
- deferred contract  
- `git reset --hard` to “fix” a dirty tree  

### DB restore (last resort, operator-approved)

Use the `pre-task01-expand` dump via your documented recovery path (`docs/deployment-hostfly.md` / `scripts/release.sh restore-test`). Not part of normal rollback.

---

## Classification (later — not part of install)

Until FlowerTypes are marked BLOOM/DECORATIVE manually, catalog MONO/MIXED/SEO may show **UNKNOWN** / sparse results. That is expected.  
**Do not** run contract migration in this release.

---

## First command on VPS

```bash
export SHOPBUKET1_ENV_FILE=/etc/shopbuket1/production.env
cd /opt/shopbuket1/current && git fetch --all && git status && git rev-parse HEAD && ./backup.sh pre-task01-expand
```

After backup OK:

```bash
./deploy.sh staging 0ea13cebaac10917ccd0b0c69d2d88b83d8c0075
```

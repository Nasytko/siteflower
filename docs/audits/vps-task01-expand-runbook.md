# VPS Runbook — Task 01 Expand (manual SSH)

**Audience:** operator on the HostFly VPS  
**Cursor / CI must not SSH here.**  
**Stack:** `shopbuket1` (`deploy/docker-compose.prod.yml`, `./deploy.sh`, `./backup.sh`, `./rollback.sh`)  
**Env file:** `/etc/shopbuket1/production.env`  
**Repo path (typical):** `/opt/shopbuket1/current` or `/opt/shopbuket1/repo`  
**Branch to test:** `feature/task-01-composition-simplify` (publish SHA first)  
**Forbidden:** `prisma migrate reset`, `db push --force-reset`, `DROP DATABASE`, `docker volume prune`, deferred **contract** SQL, auto DB rollback, production seed.

Order for this release:

1. Preflight + backup  
2. Fetch feature commit  
3. **Expand** via `deploy.sh staging <SHA>` (migrate deploy includes only `prisma/migrations`)  
4. Inventory (read-only)  
5. Smoke  
6. Manual FlowerType classification (later)  
7. **Do not** apply contract  

---

## A. Preflight

```bash
export SHOPBUKET1_ENV_FILE=/etc/shopbuket1/production.env
cd /opt/shopbuket1/current   # adjust if your checkout path differs

git fetch --all --tags
git status
git rev-parse HEAD
git branch -vv
git log -3 --oneline --decorate

# Do NOT discard local edits if present — stop and decide manually.
test -f "$SHOPBUKET1_ENV_FILE"

docker compose -p shopbuket1 -f deploy/docker-compose.prod.yml --env-file "$SHOPBUKET1_ENV_FILE" ps
docker compose -p shopbuket1 -f deploy/docker-compose.prod.yml --env-file "$SHOPBUKET1_ENV_FILE" exec -T postgres \
  pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"

df -h
ls -lt /var/backups/shopbuket1 | head

# Migrations currently applied (API container or one-off):
docker compose -p shopbuket1 -f deploy/docker-compose.prod.yml --env-file "$SHOPBUKET1_ENV_FILE" exec -T api \
  sh -lc 'cd /app/node_modules/@bouquet-one/database && ./node_modules/.bin/prisma migrate status' \
  || true

# Confirm deferred contract is NOT under prisma/migrations (after fetch of new SHA):
ls packages/database/prisma/migrations | tail
ls packages/database/prisma/deferred
test ! -d packages/database/prisma/migrations/20261102230000_simplify_product_composition_contract \
  && echo "OK: contract not in migrate path"
```

Record: **previous HEAD SHA**, API/Web image tags, free disk.

---

## B. Backup (fresh dump — mandatory)

```bash
cd /opt/shopbuket1/current
export SHOPBUKET1_ENV_FILE=/etc/shopbuket1/production.env
./backup.sh pre-task01-expand

ls -lh /var/backups/shopbuket1 | head
# Structural TOC check is inside backup.sh; optionally deeper:
# ./scripts/release.sh restore-test --dump <newest.dump> --db shopbuket1_preflight_task01
```

Do **not** reuse an old dump as the sole backup for this change.

### Restore (only if operator-approved incident)

```bash
# Example outline — stop writers, restore into controlled path, never invent DROP.
# Prefer documented release restore-test / ops recovery; do not paste ad-hoc destroy commands.
# Keep the dump path recorded in the incident note.
```

---

## C. Expand migration + app deploy

`deploy.sh staging <SHA>` builds SHA-tagged images, runs **`prisma migrate deploy`** from the pinned API image (only folders under `prisma/migrations`), then switches api/web.

```bash
cd /opt/shopbuket1/current
export SHOPBUKET1_ENV_FILE=/etc/shopbuket1/production.env

# Optional dry-run:
./deploy.sh staging --dry-run <APPROVED_SHA>

# Live:
./deploy.sh staging <APPROVED_SHA>
```

Expected new migration only for Task 01:

- `20261102220000_flower_type_composition_class`  
  - adds `flower_types.composition_class` (nullable)  
  - softens `product_components.display_name` (`DEFAULT ''`, DROP NOT NULL)  
  - reaffirms `unit`/`role` defaults  
  - **no DROP** of legacy columns  

**Must not run:**  
`packages/database/prisma/deferred/20261102230000_simplify_product_composition_contract.sql`

### Verify schema after migrate

```bash
docker compose -p shopbuket1 -f deploy/docker-compose.prod.yml --env-file "$SHOPBUKET1_ENV_FILE" exec -T api \
  sh -lc 'cd /app/node_modules/@bouquet-one/database && ./node_modules/.bin/prisma migrate status'

docker compose -p shopbuket1 -f deploy/docker-compose.prod.yml --env-file "$SHOPBUKET1_ENV_FILE" exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 <<'SQL'
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'flower_types' AND column_name = 'composition_class';

SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'product_components'
  AND column_name IN ('display_name','quantity','unit','role','color_id','flower_item_id')
ORDER BY column_name;
SQL
```

Expect: `composition_class` present; legacy component columns **still present**.

---

## D. Inventory (read-only)

```bash
cd /opt/shopbuket1/current
# Copy results to a dated file on the host, e.g. /var/backups/shopbuket1/inventory-task01-$(date +%F).txt
docker compose -p shopbuket1 -f deploy/docker-compose.prod.yml --env-file "$SHOPBUKET1_ENV_FILE" exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 \
  -f - < packages/database/prisma/ops/inventory-composition-simplify-staging.sql \
  | tee "/var/backups/shopbuket1/inventory-task01-$(date +%F-%H%M).txt"
```

Rules:

- Read-only only  
- **Do not** auto-set `composition_class` from names or ComponentRole  
- **Do not** run contract / destructive SQL  

---

## E. Deployment health

```bash
docker compose -p shopbuket1 -f deploy/docker-compose.prod.yml --env-file "$SHOPBUKET1_ENV_FILE" ps
curl -fsS http://127.0.0.1:3001/api/v1/health
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/
docker compose -p shopbuket1 -f deploy/docker-compose.prod.yml --env-file "$SHOPBUKET1_ENV_FILE" logs --tail=200 api
docker compose -p shopbuket1 -f deploy/docker-compose.prod.yml --env-file "$SHOPBUKET1_ENV_FILE" logs --tail=200 web
```

Forbidden: `docker volume rm`, prune with `--volumes`, deleting `shopbuket1_pgdata`.

---

## F. Smoke tests (manual browser / API)

1. Home page loads  
2. Catalog /katalog listing loads  
3. Product PDP: composition summary **without** stem qty from ProductComponent  
4. Products with unclassified types → `compositionKind` **UNKNOWN** (not guessed MONO)  
5. Filters MONO / MIXED / flower-type: no false expansion from null class  
6. Thematic SEO pages still open; qty-based rule keys may be residual until contract  
7. Admin: FlowerType `compositionClass` field; product composition editor (FlowerItem list)  
8. Create / edit / **duplicate** a draft test product → compositionKind **re-derived**  
9. ERP SKU, variants, options unchanged  
10. Cart + checkout UI path without placing a real payable order  
11. API logs: no Prisma errors on component save (`display_name` / missing column)

---

## G. Rollback

### App-only (preferred first response)

```bash
cd /opt/shopbuket1/current
export SHOPBUKET1_ENV_FILE=/etc/shopbuket1/production.env
./rollback.sh
```

Notes:

- Does **not** reverse expand migration.  
- After expand, old app + expand DB is designed to work (additive + `display_name DEFAULT ''`).  
- If **new** app already rewrote `product_components`, rolled-back old UI may show empty display names (`''`) — acceptable; NULL would have broken Prisma reads (mitigated by DEFAULT).  
- `deploy.sh` may refuse automatic image rollback if `SCHEMA_ADVANCED=1` in that process — use `./rollback.sh` / forward fix deliberately.

### Database restore (last resort)

Only with explicit approval: restore the **pre-task01-expand** dump via your documented recovery path. Never auto-rollback Postgres from deploy scripts.

---

## H. Classification (separate stage — after smoke)

Until FlowerTypes used by published floral products have `composition_class`:

- Affected products stay **UNKNOWN**  
- MONO/MIXED filters and SEO pages that require classified blooms under-select or show empty — **expected**, not a migrate failure  
- Set BLOOM / DECORATIVE manually in admin; never invent from ComponentRole  

**Contract migration stays deferred.** Do not promote or run  
`deferred/20261102230000_simplify_product_composition_contract.sql` in this release.

---

## First command to run on VPS

```bash
export SHOPBUKET1_ENV_FILE=/etc/shopbuket1/production.env
cd /opt/shopbuket1/current && git fetch --all && git status && git rev-parse HEAD && ./backup.sh pre-task01-expand
```

Then, only after backup succeeds: `./deploy.sh staging <APPROVED_SHA>`.

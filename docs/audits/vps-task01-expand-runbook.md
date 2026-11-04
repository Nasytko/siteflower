# VPS Runbook — Task 01 Expand + follow-ups (manual SSH)

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
| Deploy ref | `origin/feature/task-01-composition-simplify` (**always tip** after `git fetch`) |
| Task 01 expand SHA | `0ea13cebaac10917ccd0b0c69d2d88b83d8c0075` (must be ancestor of tip) |
| Scripts | `./deploy.sh`, `./backup.sh`, `./rollback.sh` (repo root) |

**This tip includes (cumulative):**

1. Task 01 expand — `FlowerType.compositionClass`, soft `display_name`
2. Unified product description (`shortDescription` canonical; legacy `description` kept in DB)
3. Admin product editor UX simplify
4. Drop `products.badge_label` (archived then dropped)
5. Dead-code cleanup (`suggestVisualPaletteColorIds`, badge CSS, unused editor props)

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

# Confirm the published feature tip is reachable and contains Task 01:
git rev-parse --verify origin/feature/task-01-composition-simplify
git log -1 --oneline origin/feature/task-01-composition-simplify
git merge-base --is-ancestor 0ea13cebaac10917ccd0b0c69d2d88b83d8c0075 origin/feature/task-01-composition-simplify \
  && echo "OK: Task 01 code commit is on the feature tip"

docker compose -p shopbuket1 -f deploy/docker-compose.prod.yml --env-file "$SHOPBUKET1_ENV_FILE" ps

docker compose -p shopbuket1 -f deploy/docker-compose.prod.yml --env-file "$SHOPBUKET1_ENV_FILE" exec -T postgres \
  sh -lc 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

df -h /
df -h /var/lib/docker 2>/dev/null || true
ls -lt /var/backups/shopbuket1 | head

docker compose -p shopbuket1 -f deploy/docker-compose.prod.yml --env-file "$SHOPBUKET1_ENV_FILE" exec -T api \
  sh -lc 'cd /app/node_modules/@bouquet-one/database && ./node_modules/.bin/prisma migrate status' \
  || echo "WARN: migrate status from old image failed — continue only if postgres is healthy"
```

Record: previous HEAD, free disk, newest existing backup name.

Optional dry-run (read-only; no mutate):

```bash
./deploy.sh staging --dry-run origin/feature/task-01-composition-simplify
```

---

## Шаг 2 — Backup (fresh dump — mandatory before mutate)

`./deploy.sh staging` also runs `./backup.sh staging-pre-migrate` internally.  
Still take an **extra labelled dump** first.

```bash
cd /opt/shopbuket1/current   # or repo
export SHOPBUKET1_ENV_FILE=/etc/shopbuket1/production.env

# First-time Task 01 expand on this VPS:
./backup.sh pre-task01-expand

# If Task 01 expand was already applied earlier, use a new label instead:
# ./backup.sh pre-badge-drop

ls -lh /var/backups/shopbuket1/shopbuket1-*-pre-*.dump | head
# Expect size >> 1KB. Do not delete previous backups manually.
```

---

## Шаг 3–4 — Migrations + deployment

```bash
cd /opt/shopbuket1/current
export SHOPBUKET1_ENV_FILE=/etc/shopbuket1/production.env

git fetch --all --tags
TIP="$(git rev-parse origin/feature/task-01-composition-simplify)"
echo "Deploying tip: $TIP"
./deploy.sh staging "$TIP"
```

What this does:

1. `git fetch` + **detached checkout** of the tip SHA.
2. Build/pin `shopbuket1-api:<12-char>` and `shopbuket1-web:<12-char>` from that commit.
3. Ensure postgres healthy.
4. `./backup.sh staging-pre-migrate`.
5. `prisma migrate deploy` via **immutable new API image id** (only `packages/database/prisma/migrations/**`).
6. Live schema verify gate.
7. `compose up -d --force-recreate api web` — **does not** remove volumes.
8. Health waits + release metadata.

### Expected migrations on tip

| Migration | Effect |
|-----------|--------|
| `20261102220000_flower_type_composition_class` | ADD nullable `flower_types.composition_class`; soft `product_components.display_name`; **no DROP** of qty/role/unit/color_id |
| `20261104120000_drop_product_badge_label` | Archive non-null badges → `_archive_product_badge_label`, then `DROP products.badge_label` |

**Must NOT apply:**  
`packages/database/prisma/deferred/20261102230000_simplify_product_composition_contract.sql`  
(not under `prisma/migrations` → invisible to `migrate deploy`)

---

### Verify after deploy

```bash
export SHOPBUKET1_ENV_FILE=/etc/shopbuket1/production.env
cd /opt/shopbuket1/current

git rev-parse HEAD   # = tip SHA you passed to deploy.sh (detached)
git log -1 --oneline

docker compose -p shopbuket1 -f deploy/docker-compose.prod.yml --env-file "$SHOPBUKET1_ENV_FILE" exec -T api \
  sh -lc 'cd /app/node_modules/@bouquet-one/database && ./node_modules/.bin/prisma migrate status'

docker compose -p shopbuket1 -f deploy/docker-compose.prod.yml --env-file "$SHOPBUKET1_ENV_FILE" exec -T postgres \
  sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' <<'SQL'
-- Task 01 expand
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'flower_types' AND column_name = 'composition_class';

SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'product_components'
  AND column_name IN ('display_name','quantity','unit','role','color_id','flower_item_id')
ORDER BY column_name;

-- Badge drop
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'badge_label';
-- expect 0 rows

SELECT COUNT(*) AS archived_badges FROM "_archive_product_badge_label";

SELECT COUNT(*) AS products FROM products;
SELECT COUNT(*) AS orders FROM orders;
SQL
```

Expect:

- `composition_class` present
- legacy component columns (`quantity`/`unit`/`role`/`color_id`) **still present** until contract
- `badge_label` **absent** from `products`
- product/order counts unchanged vs preflight

### Inventory (optional, read-only)

```bash
export SHOPBUKET1_ENV_FILE=/etc/shopbuket1/production.env
OUT="/var/backups/shopbuket1/inventory-task01-$(date -u +%Y%m%dT%H%M%SZ).txt"

docker compose -p shopbuket1 -f deploy/docker-compose.prod.yml --env-file "$SHOPBUKET1_ENV_FILE" exec -T postgres \
  sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' \
  < packages/database/prisma/ops/inventory-composition-simplify-staging.sql \
  | tee "$OUT"
```

Optional description conflicts (not a migration):

`packages/database/prisma/ops/inventory-product-descriptions.sql`

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
3. Product PDP — one description block; **no** merch badge «Хит»; availability + sale % OK
4. Unclassified FlowerTypes → `compositionKind` **UNKNOWN**
5. MONO/MIXED filters + thematic pages (may under-select until classify)
6. Admin product editor — no badge field; composition = FlowerItem list
7. Duplicate draft → kind **re-derived**
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

- Does **not** reverse migrations.
- Expand-only window (before badge drop): old app + expand DB is supported.
- **After** `20261104120000_drop_product_badge_label`: do **not** roll app back to a build that still selects `badgeLabel` — Prisma will fail. Forward-fix or restore DB from the labelled dump (operator-approved).
- If deploy set `SCHEMA_ADVANCED` mid-process, `deploy.sh` refuses unsafe auto image rollback; use `./rollback.sh` deliberately or forward-fix.

### Never

- `docker compose down -v`
- automatic DB rollback
- deferred contract
- `git reset --hard` to “fix” a dirty tree

### DB restore (last resort, operator-approved)

Use the labelled dump via `docs/deployment-hostfly.md` / `scripts/release.sh restore-test`. Not part of normal rollback.

---

## Classification (later — not part of install)

Until FlowerTypes are marked BLOOM/DECORATIVE manually, catalog MONO/MIXED/SEO may show **UNKNOWN** / sparse results. That is expected.  
**Do not** run contract migration in this release.

---

## First command on VPS

```bash
export SHOPBUKET1_ENV_FILE=/etc/shopbuket1/production.env
cd /opt/shopbuket1/current && git fetch --all --tags && git status && git rev-parse HEAD && ./backup.sh pre-task01-expand
```

After backup OK:

```bash
TIP="$(git rev-parse origin/feature/task-01-composition-simplify)"
echo "Deploying tip: $TIP"
./deploy.sh staging "$TIP"
```

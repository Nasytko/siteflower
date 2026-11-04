# SiteFlower release runbook (shopbuket1)

Pull-based model: develop locally → push GitHub → server `git pull` → **one-command deploy**.

Cursor has **no SSH** to production. Never upload DB dumps to GitHub/CI. Never enable production auto-deploy on every push.

**Canonical entrypoint:**

```bash
./deploy.sh production
# or pinned:
./deploy.sh production <full-40-char-sha>
# plan only:
./deploy.sh production --dry-run
./deploy.sh production --dry-run <full-40-char-sha>
# deep cleanup (approved plan only — never ad-hoc DROP):
./deploy.sh production --cleanup-plan deploy/cleanup-plans/task05-seo-landing-drop.v1.json <sha>
```

This wraps `./scripts/release.sh production` (preflight → deploy). Lower-level commands remain available.

---

## Paths (server)

| Path | Purpose |
|------|---------|
| `/opt/shopbuket1` · `/opt/shopbuket1/repo` · `/opt/shopbuket1/current` | Git checkout (use whichever exists; ops scripts live in that tree) |
| `/etc/shopbuket1/production.env` | Secrets (not in Git) |
| `/var/backups/shopbuket1` | `pg_dump -Fc` backups (outside releases) |
| `/var/lib/shopbuket1` | Deploy lock + release metadata |
| `/var/lib/shopbuket1/releases/` | Release JSON (pruned; current/previous protected) |
| `/var/lib/shopbuket1/preflight/` | Preflight PASS/FAIL JSON reports |

Compose project: **`shopbuket1`**. Never touch **`erpbuket1`**.

Production DB hostname inside Docker: **`postgres:5432`**.

Resolve checkout once:

```bash
cd /opt/shopbuket1/repo 2>/dev/null || cd /opt/shopbuket1/current 2>/dev/null || cd /opt/shopbuket1
pwd
ls deploy.sh
```

---

## 1. Publish the commit (developer workstation)

```bash
# after CI is green — the SHA must be on the remote before VPS can deploy it
git push origin HEAD
```

Do **not** deploy unpublished local commits. Pin an explicit SHA after it is published.

---

## 2. Fetch on the server (operator)

```bash
cd /opt/shopbuket1/repo 2>/dev/null || cd /opt/shopbuket1/current 2>/dev/null || cd /opt/shopbuket1
export SHOPBUKET1_ENV_FILE=/etc/shopbuket1/production.env
git fetch --tags --prune origin
# tip of a published feature branch:
git checkout feature/task-01-composition-simplify
git pull --ff-only origin feature/task-01-composition-simplify
# or pin: git checkout --detach <full-sha>
# or main: git checkout main && git pull --ff-only origin main
```

---

## 3. Dry-run (optional, safe)

Current VPS stack (no isolated rehearsal DB):

```bash
./deploy.sh staging --dry-run
./deploy.sh staging --dry-run <full-sha>
```

Future production path (rehearsal DB):

```bash
./deploy.sh production --dry-run
./deploy.sh production --dry-run <full-sha>
```

Prints current HEAD, target SHA, live release pointer, and planned stages. **No** backup, migrate, build, or container switch.

---

## 4. One-command deploy

**VPS / current live stack (use this):**

```bash
./deploy.sh staging
# or: ./deploy.sh staging <full-sha>
```

**Future production path (rehearsal then switch):**

```bash
./deploy.sh production
# or: ./deploy.sh production <full-sha>
```

Non-interactive. Stages:

1. `flock` deploy lock (blocks concurrent deploys)
2. Validate `/etc/shopbuket1/production.env` + Nginx/domain preflight
3. Resolve git to the target **commit SHA**
4. Migration conflict check + read-only table inventory (incl. `erp_sku_registry`)
5. Validated `pg_dump -Fc` → `/var/backups/shopbuket1/` (size + `pg_restore -l` TOC)
6. Restore + `prisma migrate deploy` on isolated `shopbuket1_preflight_<sha12>` only
7. Verify rehearsal (FK smoke + `erp_sku_registry` PK); drop temp DB
8. On PASS: build images, second `pre-migrate` backup, **live** `prisma migrate deploy`
9. Recreate api/web; startup + production healthchecks
10. Write release metadata; prune old shopbuket1 images + old release JSON (never backups, `.env`, volumes, media)

**Stop on FAIL** before live migrate. Production schema untouched until step 8.

Equivalent split form:

```bash
./scripts/release.sh preflight <full-sha>
./scripts/release.sh deploy <same-full-sha>
```

---

## 5. After deploy

```bash
./scripts/release.sh status
./scripts/release.sh releases
./scripts/release.sh seo-smoke
./scripts/release.sh seo-reconcile   # read-only; never DROP seo_landing_pages
./healthcheck.sh --production
```

---

## 6. Application rollback (manual)

```bash
./deploy.sh --help   # see also:
./scripts/release.sh rollback
# or: ./rollback.sh /var/lib/shopbuket1/releases/<file>.json
```

Restores **previous API/web images** only. **Does not** reverse Prisma migrations.

If a newer migration already ran and the previous app is schema-incompatible:

1. Do **not** auto `pg_restore` over production.
2. Prefer a forward fix + redeploy.
3. DB restore requires **explicit operator approval** (see §7).

Failed deploy **before** container switch leaves the running app untouched (migrate failure included).

Failed deploy **after** container switch: automatic app-image rollback is **refused** if this deploy already applied live migrations (`SCHEMA_ADVANCED=1`), to avoid running an old app against a newer schema. DB is never auto-rolled back.

---

## 7. Backup restore procedure (test first)

**Never** restore over the live `POSTGRES_DB` without a written recovery window.

**Backup TOC check ≠ restore proof.** `backup.sh` only runs size + `pg_restore -l` (structural). Full proof:

```bash
./scripts/release.sh restore-test \
  --dump /var/backups/shopbuket1/shopbuket1-....dump \
  --db shopbuket1_preflight_restore_manual1
```

Both `--dump` and `--db` are **required** (no automatic dump/DB selection). Target must match `shopbuket1_preflight_*` and must not be the live `POSTGRES_DB`. Performs full `pg_restore`, counts public tables, then **drops** the temp DB.

Manual recovery to a **new** DB (operator-approved):

1. Pick dump under `/var/backups/shopbuket1/` (newest successful preflight/pre-migrate).
2. Create a new database (not erpbuket1).
3. `pg_restore -U … -d <new_db> --no-owner --no-acl --exit-on-error < dump`
4. Point a staging stack at `<new_db>` and verify.
5. Only then consider cutover with downtime + approvals.

Backup rotation: aged dumps beyond `BACKUP_RETENTION_DAYS` (default 14) are removed, but the **newest** dump is never deleted.

---

## 8. Cleanup policy

Automatic cleanup removes only:

- Old `shopbuket1-api` / `shopbuket1-web` image tags (keep newest 5)
- Old release metadata JSON beyond `SHOPBUKET1_RELEASE_METADATA_KEEP` (default 10), never current/previous pointers
- Temporary preflight DBs and temp dump files

**Never** auto-delete: user uploads, media, persistent volumes, `.env`, backups (except aged rotation above), PostgreSQL data, `erpbuket1*`, or `docker system prune --volumes`.

---

## 9. Local unit tests (developer / CI)

```bash
bash deploy/test/release-preflight.test.sh
bash deploy/test/deploy-health.test.sh
bash deploy/test/deploy-safe.test.sh
bash deploy/test/nginx-provision.test.sh
bash deploy/test/resolve-ref.test.sh
```

Full server preflight cannot be claimed from Cursor (no production access).

---

## Approvals required

| Action | Approval |
|--------|----------|
| Push / publish commit (incl. Task 04A) | review / CI green |
| Server `./deploy.sh production` (live migrate) | explicit ops after dry-run + understanding of SHA |
| DB restore onto production | separate written approval + recovery window |
| DROP `seo_landing_pages` / legacy SEO tables | separate cutover report — **not** automated |
| Touch `erpbuket1` | never |
| Production auto-deploy on push | never |

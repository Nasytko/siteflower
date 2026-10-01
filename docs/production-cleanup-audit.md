# Production cleanup audit

Date: 2026-10-01  
Scope: repository hygiene before / during HostFly production use  
Commit baseline: `2552cf5`  
Rules: no functional, UI, API, schema, auth, S3, or deployment-behavior changes.

---

### SAFE TO DELETE

| Item | Reason | Proof |
| --- | --- | --- |
| *(no tracked source files)* | — | Every candidate `.ts` module checked has imports, Nest wiring, scripts, Docker, CI, or tests. |

Local-only junk already ignored (do **not** commit deletion of ignored paths as a “cleanup”):

- `.tmp-prod-verify/` — local Docker verify artifacts (already in `.gitignore`)
- `debug.log`, `apps/api/smoke.log` — covered by `*.log`
- `artifacts/`, `test-results/`, `coverage/`, `.next/`, `dist/`, `node_modules/`

---

### SAFE TO REMOVE DEPENDENCY

| Package | Where | Reason | Proof |
| --- | --- | --- | --- |
| `zod` | `apps/web` | Never imported in web source | `rg` over `apps/web` finds only `package.json` |
| `uuid` | `apps/api` dependencies | Unused; code uses `node:crypto` `randomUUID` | No `from 'uuid'` / `require('uuid')` anywhere under `apps/api` |
| `@types/uuid` | `apps/api` | Only existed for unused `uuid` | Same as above |
| `@types/sharp` | `apps/api` | Deprecated; Sharp 0.35 ships its own types | `sharp/package.json` has `"types"`; `@types/sharp` is obsolete |
| `cross-env` | `apps/api` | Not referenced by any api script | Only listed in `apps/api/package.json`; web still has its own copy for `next build` |
| `ts-node` | `apps/api` | Not referenced; Jest uses `ts-jest`, Nest build uses `nest build` | No `ts-node` references outside `package.json` |

After removal: refresh `pnpm-lock.yaml` via `pnpm install`.

---

### SAFE TO REFACTOR

| Change | Why | Risk |
| --- | --- | --- |
| Extend `.dockerignore` with local/tooling paths | Shrink Docker build context / transfer time | Low if we do not exclude files copied by Dockerfiles |

Recommended ignore additions:

- `.tmp-prod-verify/`
- `playwright.config.ts`
- `.editorconfig`
- `.prettierrc`
- `.prettierignore`

**Do not** exclude `turbo.json` (copied in Docker deps stage), Prisma schema/migrations, or package sources.

No duplicate-utility consolidations recommended: merging helpers could change runtime behavior.

---

### KEEP

| Item | Why it looked suspicious | Why keep |
| --- | --- | --- |
| `apps/api/src/media/media-orphan.service.ts` | Not registered in Nest module | Used by CLI via `src/cli/media-cli-context.ts` → media-check/cleanup/repair |
| `apps/api/src/cli/media-cli-context.ts` | Not named in `package.json` scripts | Shared helper imported by media ops CLIs |
| `install.sh` `migrate_legacy_siteflower_bootstrap` | Legacy SiteFlower paths | Required one-time VPS repair path |
| `docs/phase-4.2-report.md`, `docs/admin-security-cleanup-audit.md` | Historical | Operational history; still linked/referenced as audit trail |
| Root `docker-compose.yml` | Dev-only Postgres | Local development; not production |
| `prisma` as API prod dep | Look heavy | Required for migrate in deploy image |
| `tsx` | Looked like prod CLI runner | Dev-only; production CLIs run as `node dist/cli/*.js` |
| `pino-http`, `reflect-metadata`, `rxjs` | Few direct imports | NestJS runtime peers |
| `pg` (api devDependency) | Not in `src/` | Integration tests import `pg` |
| `pino-pretty` | Dev-looking | Wired in `app.module.ts` for non-prod logging |
| Public category PNGs / `hero.jpg` | Large | Referenced by storefront assets |
| `apps/web/CLAUDE.md`, `AGENTS.md` | Tooling docs | Harmless; already excluded from Docker via `**/*.md` |
| Entire `e2e/`, Playwright config, CI | Not in production runtime | Quality gates |

---

### LEGACY

| Item | Classification | Action |
| --- | --- | --- |
| `siteflower` branding in README / outbox docs / probe strings | Application / docs | Keep |
| `install.sh` legacy path migration | Recovery | Keep |
| `docs/deployment-hostfly.md` repair section | Operational docs | Keep |
| Old `/etc/siteflower` etc. | Must not be recreated by normal deploy | Already true |

---

### DO NOT TOUCH

- `deploy/Dockerfile.api`, `Dockerfile.web`, `docker-compose.prod.yml` behavior
- `deploy.sh` / rollback / backup / healthcheck semantics
- Prisma schema & migrations
- S3 / media security architecture
- Auth, CORS, TRUST_PROXY, cookies
- Nest/Next business modules
- ERP / `erpbuket1` isolation
- Production env variable names
- UI components / CSS / page layout

---

### RECOMMENDED OPTIMIZATIONS

1. Remove the six unused dependencies above + lockfile update.
2. Tighten `.dockerignore` with the listed local/tooling paths.
3. Optionally note in docs that historical audits remain for trail (no deletion).

**Not recommended now:** deleting historical docs, merging duplicate helpers, changing Docker multi-stage layout, removing workspace packages, pruning images/volumes.

---

### Execution note

Only items in **SAFE TO REMOVE DEPENDENCY** and the `.dockerignore` additions under **SAFE TO REFACTOR** will be applied in the follow-up cleanup commit.

---

## Re-audit (2026-10-01, post `ef0bb1a`)

Re-scanned dependencies and tracked files after the first cleanup commit (`00a9448`) and the deploy.sh SHA fix (`ef0bb1a`).

### Additional SAFE TO DELETE / REMOVE

| Item | Result |
| --- | --- |
| Tracked source / config files | **None** — no new proven-unused tracked files |
| Dependencies | **None** — remaining “no direct import” hits (`pino-http`, `reflect-metadata`, `rxjs`) are NestJS runtime peers and must stay |
| Docs / historical audits | **Keep** — operational trail, not dead code |
| Local ignored junk (`.tmp-prod-verify/`, `artifacts/`, `test-results/`, `debug.log`) | Safe to delete **locally only** (already gitignored; not part of the repo) |

### Conclusion

Further tracked cleanup would be speculative. Quality over deletion count: **no additional repo commit required** unless new unused items appear later.

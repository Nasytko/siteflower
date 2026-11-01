# Task 00 — Test & verification baseline

**Status:** historical record of Task 00 local runs + **current R21 policy**  
**Host:** Windows + Cursor, Node `v24.21.0`, `corepack pnpm` `10.17.0`  
**Date:** 2026-11-01  
**Policy then/now:** no dependency updates, no lint autofix, no destructive Prisma ops, **no VPS**

Raw logs: `docs/refactor/_baseline-logs/` (credentials scrubbed).

---

## Current policy (authoritative)

**R21 = P0 OPEN.** Task 00.1 safety harness was **rolled back**. There is **no** technical integration gate in the repo. API DB integration is under an **organizational ban** only: do not run `test:integration` / package `test` / Turbo api `test`. Do not rewrite working `DATABASE_URL` as a workaround. Canonical text: [00.1-db-integration-ban.md](./00.1-db-integration-ban.md) · [03-risk-register.md](./03-risk-register.md) R21, R22.

The sections below document **what Task 00 already measured**. They are **not** permission to re-run those DB tests while R21 is OPEN.

---

## Connection safety (Task 00 evidence)

| Mechanism | Behavior | `DIRECT_URL`? |
| --- | --- | --- |
| Prisma CLI (`packages/database/prisma.config.ts`) | dotenv + `DATABASE_URL` | Not used |
| Nest (`app-config.module.ts`) | env files; `ignoreEnvFile` when `NODE_ENV==='test'` | No |
| `integration-database-url.ts` | prefers `DATABASE_URL`, else probes ports with default **`bouquet_one`** | No |
| Many `*.integration-spec.ts` | `DATABASE_URL ?? '…/bouquet_one?schema=public'` | No |

| Database (local instance) | OID (Task 00) | Role |
| --- | --- | --- |
| `bouquet_one` | `16385` | Working / app DB name |
| `bouquet_one_baseline_audit` | `18423` | Isolated audit DB |

| Scenario | Safe for destructive tests? | Effective fallback DB |
| --- | --- | --- |
| Ambient (no forced URL) | **No** | Working `bouquet_one` |
| Process `DATABASE_URL` forced to audit | Yes for that run | `bouquet_one_baseline_audit` |

Evidence: `_baseline-logs/09a-ambient-connection-safety.json`, `09b-forced-audit-connection-safety.json`. Working DB markers unchanged after gated run: `_baseline-logs/14-working-db-unchanged.json`.

---

## Environment (Task 00 host)

| Check | Result |
| --- | --- |
| Docker CLI | Not installed |
| `127.0.0.1:5433` | Closed |
| `127.0.0.1:5432` | Open |
| E2E | NOT RUN |

---

## Command results (Task 00)

| Command | Exit | Log / notes |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | 0 | `01-install.log` |
| `pnpm db:generate` | 0 | `02-db-generate.log` |
| First migrate deploy (empty audit) | 0 | `04-migrate-deploy-audit.log` (38 applied) |
| lint / typecheck / build | 0 | `11`–`13` (and first-pass `05`–`07`) |
| migrate deploy (continuation) | 0 | `10-migrate-deploy-audit.log`; DB=`bouquet_one_baseline_audit` |
| `pnpm test` (forced audit URL) | **1** | `14-test.log`; API unit pass; integration 2 failed / 11 passed |

### Integration failures recorded (not fixed in Task 00)

1. `media-hardening.integration-spec.ts` — API failed to start on ephemeral port.
2. `commerce.integration-spec.ts` — expected `CONFIRMED`, got `RECEIVED` after HTTP 201.

### Not run

| Check | Reason |
| --- | --- |
| E2E / visual | No Compose stack; writes orders/media |
| Ambient ungated integration | Would hit `bouquet_one` — refused |
| `migrate reset` / force-reset | Forbidden |
| VPS | No permission |

---

## Interpretation

- Lint / typecheck / build: green (Task 00).
- Migrations on isolated audit DB: green (38).
- API integration: red on two suites when last gated.
- Defaults remain unsafe → **R21 OPEN**; ban is organizational until a future technical fix.

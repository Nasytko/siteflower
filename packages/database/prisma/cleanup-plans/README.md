# Cleanup plans (gated destructive migrations)

Migrations here are **not** applied by normal `prisma migrate deploy`.

They are installed into `prisma/migrations/` only when:

```bash
./deploy.sh production --cleanup-plan deploy/cleanup-plans/<id>.json
```

passes approval gates (`status=approved`, matching `SHOPBUKET1_CLEANUP_APPROVAL_TOKEN`, SEO SQL gates, restore-test flag).

Do not invent DROP statements from schema diffs. Each plan is a fixed, reviewed SQL set.

See also: `prisma/deferred/` (historical staging) and `docs/task05-cleanup-audit.md`.

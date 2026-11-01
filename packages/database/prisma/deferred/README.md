# Deferred SQL (not migrate history)

Files in this folder are **intentionally outside** `prisma/migrations`.

- `pnpm db:migrate` / `prisma migrate deploy` only read `prisma/migrations` (see `prisma.config.ts`).
- Promote a script here into `prisma/migrations/<timestamp>_*/migration.sql` only after explicit review and preconditions in the file header are met.
- Never copy DROP scripts into migrations without reconciliation + backup proof.

# Media

Index for media subsystem docs (no behavior changes here).

| Doc | Purpose |
| --- | --- |
| [media-architecture.md](./media-architecture.md) | Storage port, pipeline, security, product gallery rules |
| [media-production.md](./media-production.md) | Production delivery, S3 checklist, VPS notes |
| [media-recovery.md](./media-recovery.md) | Consistency check, orphan cleanup, repair, incident playbooks |

## Quick ops

```bash
pnpm media:check -- --probe
pnpm media:cleanup            # dry-run
pnpm media:cleanup -- --execute
pnpm media:repair -- --execute
pnpm media:migrate-local-to-s3
```

Local default: `MEDIA_STORAGE=local`. Production: `MEDIA_STORAGE=s3` (+ bucket credentials). Local production-mode boots only with `ALLOW_PRODUCTION_LOCAL_MEDIA=true`.

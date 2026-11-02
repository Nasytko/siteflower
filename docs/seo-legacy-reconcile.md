# SEO legacy tables — reconciliation gate (read-only)

**Policy:** `seo_landing_pages` and related legacy SEO artifacts are **not** dropped by `./deploy.sh production`, preflight, migrate deploy, or cleanup.

## Automated read-only inventory (on VPS)

```bash
./scripts/release.sh seo-reconcile
```

Reports counts for:

- `seo_landing_pages`
- `catalog_categories` (Task 03 SoT for catalog SEO)
- `slug_redirects`

## Drop eligibility (requires separate approval)

Use the prepared cleanup plan (not ad-hoc SQL):

1. `./scripts/release.sh seo-reconcile` → published orphans = 0  
2. Full `buildCatalogSeoReconcileReport` → `blockedForLegacyDrop === false`  
3. Restore-test on explicit DB; set `SHOPBUKET1_CLEANUP_RESTORE_TEST_OK=1`  
4. Edit `deploy/cleanup-plans/task05-seo-landing-drop.v1.json` → `"status": "approved"`  
5. Export `SHOPBUKET1_CLEANUP_APPROVAL_TOKEN=APPROVE_TASK05_SEO_LANDING_DROP_V1`  
6. `./deploy.sh production --cleanup-plan deploy/cleanup-plans/task05-seo-landing-drop.v1.json <sha>`

Until then: normal deploy keeps the tables; DROP SQL stays under `prisma/cleanup-plans/` only.

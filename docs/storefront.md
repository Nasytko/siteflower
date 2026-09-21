# Storefront

Public catalog + constrained CMS for БУКЕТ №1 (Grodno).

## Public routes

| Path | Purpose |
| --- | --- |
| `/` | Homepage (hero + configured sections) |
| `/bukety` | Catalog listing + filters |
| `/bukety/[slug]` | Product PDP (canonical slug) |
| `/tsvety/[slug]`, `/povod/[slug]`, `/komu/[slug]` | Taxonomy landings |
| `/kollektsii/[slug]` | Collection |
| `/izbrannoe` | Favorites (client-only) |
| `/dostavka`, `/o-nas`, `/kontakty` | Static business pages |

## Admin storefront config

| Path | Permission | API |
| --- | --- | --- |
| `/admin/storefront/homepage` | `CONTENT_READ` / `CONTENT_UPDATE` | `GET/PATCH /api/v1/admin/storefront/homepage` |
| `/admin/storefront/settings` | `SETTINGS_READ` / `SETTINGS_UPDATE` | `GET/PATCH /api/v1/admin/storefront/settings` |

Both editors use optimistic concurrency (`expectedVersion`) and surface HTTP 409 on conflict.

## Dev catalog seed

Idempotent upsert of ~10 published bouquets, taxonomies, collections, local placeholder media, and storefront defaults.

```bash
# from repo root — refused unless NODE_ENV is not production AND ALLOW_DEV_CATALOG_SEED=true
# also refuses DATABASE_URL hosts that look like production (rds, neon, supabase, …)
ALLOW_DEV_CATALOG_SEED=true pnpm seed:dev-catalog
```

Media files are written under `MEDIA_LOCAL_ROOT` (default `./storage/media`) as solid-color JPEG placeholders with one WebP derivative — no hotlinked stock photos.

## SEO: filters, canonical, noindex

- **Canonical product URL** is always `/bukety/{canonicalSlug}`. Old slugs resolve via `SlugRedirect` and should redirect, not compete.
- **Filtered catalog URLs** (`?flower=…`, price bands, sort) are discovery aids: prefer `noindex` (or omit from sitemap) so filter permutations do not create thin duplicate index entries. Keep a clean canonical on `/bukety` (and taxonomy landings) instead.
- **Environment indexing**: non-production stays `noindex` unless `ALLOW_INDEXING=true`. Production indexes by default; set `ALLOW_INDEXING=false` only for deliberate holdbacks.

## Favorites

Favorites are **local-only** (`localStorage`, key `bouquet-one:favorites:v1`). No auth, no server sync in this phase. The shape (`productId`, `slug`, `savedAt`) is ready for a future account sync without rewriting the client API.

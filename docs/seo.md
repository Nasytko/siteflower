# SEO foundation

## Goals

Technical SEO is first-class. Public pages default to Server Components and support SSR/SSG. Avoid unnecessary `"use client"`.

Catalog URL and filter policy: [catalog-simplification-and-merchandising.md](./catalog-simplification-and-merchandising.md), [storefront.md](./storefront.md).

## Implemented helpers

Centralized under `apps/web/src/lib/seo/`:

| Helper | Role |
| --- | --- |
| `metadata.ts` | Root + page `Metadata` builders (title, description, canonical, OG, Twitter) |
| `site-url.ts` | Canonical site origin from `NEXT_PUBLIC_SITE_URL` |
| `indexing.ts` | Environment-aware index/noindex policy |
| `json-ld.ts` / `product-json-ld.ts` | JSON-LD builders + safe serialization |
| `app/robots.ts` | `robots.txt` |
| `app/sitemap.ts` | `sitemap.xml` foundation |

## Indexing policy

- **Non-production:** `noindex` unless `ALLOW_INDEXING=true`
- **Production:** indexing allowed unless `ALLOW_INDEXING=false`

This keeps local/staging safe by default and prevents production from accidentally staying noindex just because `.env.example` ships with `ALLOW_INDEXING=false` — production should omit the flag or set it intentionally.

## Public entity routes

Each public route should call `buildPageMetadata()` (and JSON-LD where useful):

| Entity | Path | Notes |
| --- | --- | --- |
| Catalog | `/bukety` | Filtered query URLs: same canonical, typically `noIndex` |
| Product | `/bukety/[slug]` | Primary image + Offer JSON-LD |
| Promotions | `/akcii` | Effective promotions only |
| Flower hub / landing | `/cvety`, `/cvety/[slug]` | |
| Occasion hub / landing | `/povod`, `/povod/[slug]` | |
| Recipient | `/komu/[slug]` | |
| SEO Landing Page | CMS-driven slug (future) | Dedicated metadata + content blocks |

Category, Style, and Collection landing routes are **not** part of the current product. Legacy `/collections/*` redirects away.

Rules:

1. Canonical URLs always from configured site origin — not raw `Host`
2. Draft/unpublished content must be `noIndex: true`
3. Admin routes always noindex
4. Sitemap includes only publicly indexable published URLs (static hubs + API sitemap entries)

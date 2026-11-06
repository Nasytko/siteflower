# SEO foundation

## Goals

Technical SEO is first-class. Public pages default to Server Components and support SSR/SSG. Avoid unnecessary `"use client"`.

Catalog URL and filter policy: [catalog.md](./catalog.md), [storefront.md](./storefront.md).

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

This keeps local/staging safe by default. `deploy/env/production.env.example` ships `ALLOW_INDEXING=true` for buketnomer1.by — set `false` only for a deliberate holdback.

## Homepage local SEO

- Title / description / H1 are **not** taken from promo hero slides.
- Defaults target Grodno delivery queries; empty admin fields restore defaults (`resolveHomepageSeo`).
- Edit overrides in **Admin → SEO → SEO главной** (`PATCH /admin/storefront/homepage/seo`).
- WebSite JSON-LD on `/` includes `alternateName`: «Букет №1», «Букет номер один».

## Catalog pagination

- Clean `?page=2+` gets its own canonical and stays indexable when the page has results.
- Filters and non-default sort stay `noindex` with canonical on the clean category URL.

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
2. Draft/unpublished products are excluded from the public catalog and sitemap by **lifecycle** (`effectivelyPublished`); they are not indexable before explicit publish. The product `noIndex` flag is an additional override for published pages — duplicate does not need to force `noIndex=true`.
3. Admin routes always noindex
4. Sitemap includes only publicly indexable published URLs (static hubs + API sitemap entries)
5. Manual `seoTitle` / `seoDescription` on a duplicated DRAFT are copied as-is; SEO Health shows them as manual overrides and the editor Reset clears them back to automatic titles/descriptions

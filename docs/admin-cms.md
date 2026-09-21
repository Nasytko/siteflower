# Admin / CMS architecture (future)

Do not implement this phase — design only.

## Placement

Admin UI lives in `apps/web` under `/admin` (route group `(admin)`). It calls the same Commerce API as the storefront. No separate admin deployable in v1.

## Capabilities the CMS must eventually cover

- Products & variants
- Photos / media ordering / primary image / alt text
- Categories, collections, occasions, recipients
- Flower taxonomy
- Homepage content & banners
- Delivery & pickup settings
- SEO fields & SEO landing pages
- FAQ & contacts
- Business settings
- Users & roles
- Orders
- Publication scheduling
- Drafts & previews
- Audit / change history

## Content lifecycle

```
DRAFT → PUBLISHED → ARCHIVED
```

Supporting features:

| Feature | Intent |
| --- | --- |
| Scheduled publishing | `publish_at` in the future; worker or request-time promotion |
| Preview URLs | Signed, time-limited tokens for draft/scheduled content |
| Change history | Immutable revisions per entity (or event log) |
| Rollback | Restore a previous revision into DRAFT, then publish deliberately |

## Suggested content model traits

Every publishable entity should eventually include:

- `status` (`DRAFT` \| `PUBLISHED` \| `ARCHIVED`)
- `slug` (unique among non-deleted)
- `seo_title`, `seo_description`, canonical overrides when needed
- `published_at`, `publish_at` (schedule)
- `created_by`, `updated_by`
- revision / audit linkage

## API shape (future)

- Admin routes under `/api/v1/admin/...` protected by authZ
- Public read models under `/api/v1/...` returning only published content
- Preview endpoint validates signed token and may return draft payloads

## Principle

Editors must manage catalog and content **without developer intervention**. Developers own schema/migrations and complex integrations — not day-to-day merchandising.

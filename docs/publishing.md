# Publishing

## Draft workflow

Create → save incomplete draft → edit → preview → publish.

Drafts may omit publish-required fields.

## Publish validation

Transition to `PUBLISHED` requires:

- name
- valid slug
- short description + description
- ≥1 active variant with price ≥ 0
- primary image

Failures return structured issues (`PublishValidationError` / issue list). UI shows “Cannot publish — N issues”.

## Scheduling

- `publishAt` / `unpublishAt` (timestamptz UTC)
- Admin input interpreted with `BUSINESS_TIMEZONE` (Europe/Minsk) at boundaries
- Public visibility computed from current time — **no in-process timer required**

## Preview

Authorized admins: `GET /api/v1/admin/catalog/products/:id/preview` and `/admin/catalog/products/[id]/preview`.

Drafts are never exposed on public catalog endpoints.

## Archive

Removes from public catalog; keeps admin record, media, relationships. Hard delete is not the normal path for published products.

Archived products may still be **duplicated** into a new DRAFT (template reuse). Duplicate never re-publishes and never copies promotions or bestsellers.

## Slug changes

Changing a published (or any) slug records `SlugRedirect` (`entityType`, `fromSlug` → `toSlug`). Loop prevention on write. Public slug lookup follows redirects.

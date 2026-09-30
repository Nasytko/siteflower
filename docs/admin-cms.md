# Admin / CMS

Admin UI lives in `apps/web` under `/admin` (route group `(admin)`). It calls the same Commerce API as the storefront. No separate admin deployable in v1.

Merchandising model: [catalog-simplification-and-merchandising.md](./catalog-simplification-and-merchandising.md).

## Implemented

- Auth (session cookie, RBAC, CSRF, audit)
- Users & roles (system roles)
- Catalog products / variants / media / publish
- Taxonomies: flowers, colors, bouquet sizes, occasions, recipients
- Promotions (`/admin/promotions`) and bestsellers (`/admin/bestsellers`)
- Storefront settings (including budget ranges); homepage layout is fixed (no admin block editor)
- Instagram curated feed manager
- Legal entity + versioned legal documents
- ERP outbox admin (status, events, retry, simulator test)
- Fulfillment (delivery / pickup windows)
- Orders list / detail / status transitions / cancel

## Navigation (summary)

| Group | Sections |
| --- | --- |
| Работа | Заказы |
| Каталог | Товары, Справочники (вкладки: Цветы, Цвета, Размеры, Линейки, Поводы, Кому), Акции, Бестселлеры |
| Витрина | Instagram, Настройки магазина, Получение и доставка, Юридическая информация |
| Система | ERP, Пользователи, Аудит, Медиа / Site Health |

Category, Style, and Collections admin UIs were removed; do not reintroduce them. Homepage block editor was removed; do not reintroduce it.

## Still out of scope (do not implement in current phases)

- Payments / ExpressPay
- NewERP application itself (SiteFlower outbox/simulator admin UI already exists)
- Customer accounts
- MFA / email password reset
- Custom roles editor
- Site Health dashboard includes media diagnostics at `/admin/media-health` (SITE_HEALTH_READ)

## Rules

- Admin mutations must write AuditLog in the same transaction when changing sensitive state
- Storefront never reads admin-only fields
- Preview routes stay noindex

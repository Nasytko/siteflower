# Admin / CMS

Admin UI lives in `apps/web` under `/admin` (route group `(admin)`). It calls the same Commerce API as the storefront. No separate admin deployable in v1.

Merchandising model: [catalog-simplification-and-merchandising.md](./catalog-simplification-and-merchandising.md).

## Implemented

- Auth (session cookie, RBAC, CSRF, audit)
- Users & roles (system roles)
- Catalog products / variants / media / publish
- Taxonomies: flowers, colors, bouquet sizes, occasions, recipients
- Promotions (`/admin/promotions`) and bestsellers (`/admin/bestsellers`)
- Homepage & storefront settings (including budget ranges)
- Instagram curated feed manager
- Legal entity + versioned legal documents
- ERP outbox admin (status, events, retry, simulator test)
- Fulfillment (delivery / pickup windows)
- Orders list / detail / status transitions / cancel

## Navigation (summary)

| Group | Sections |
| --- | --- |
| Работа | Заказы |
| Каталог | Товары, Цветы, Цвета, Размеры, Линейки, Поводы, Кому |
| Продвижение | Акции, Бестселлеры, Instagram, Главная |
| Магазин | Получение и доставка, Настройки, Юридическая информация, ERP |
| Управление | Пользователи, Аудит |

Category, Style, and Collections admin UIs were removed; do not reintroduce them.

## Still out of scope (do not implement in current phases)

- Payments / ExpressPay
- NewERP application itself (SiteFlower outbox/simulator admin UI already exists)
- Customer accounts
- MFA / email password reset
- Custom roles editor
- Site Health dashboard (future; not implemented)

## Rules

- Admin mutations must write AuditLog in the same transaction when changing sensitive state
- Storefront never reads admin-only fields
- Preview routes stay noindex

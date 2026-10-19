# SiteFlower — план рефакторинга

Опирается на `docs/refactoring-audit.md`. Каждый этап оставляет магазин рабочим. Миграции — только additive, пока не подтверждён cutover.

## Целевая архитектура

- **Тип товара** = `ProductKind` (единственный коммерческий SSoT).
- **Состав** = `ProductComponent` → `FlowerItem` (вид/сорт/форма/происхождение/высота стебля, роль, цвет линии).
- **Витринные разделы** = `CatalogCategory.listingKind` + `resolveCategoryListingScope` (хабы = kind-only).
- **Подарки** = `ProductKind.GIFT` + `catalogCategoryId` как подтип.
- **SEO-посадочные** = `SeoLandingPage` /p/{slug} по правилам, без генерации всех комбинаций.
- **Навигация** = `NavigationMenu`, не дерево категорий.
- **Канон «Цветы поштучно»** = `/katalog/tsvety`. «Букеты с X» = `/p/…` или `/bukety?flower=`.

Опасные изменения (отдельное согласование): 301 `/cvety` → канон; drop `diameter_cm`; смена slug хаба; outbox на смену статуса заказа; Playwright в CI.

`matchCategoryOrProductKind` удалён (2026-10-19): хабы всегда kind-only; category+kind только через AND.

## Порядок

| Этап | Содержание | Миграции | Обратная совместимость |
| --- | --- | --- | --- |
| **C1** | Admin nav + копирайт + ссылки на скрытые экраны | нет | URL админки те же |
| **C2** | Таблица товаров: колонки/фильтры ProductKind | нет (нужен additive DTO) | query `catalogCategoryId` остаётся в API |
| **C3** | Редактор: копирайт, STEM без категории, create-flow | нет | PUT `/editor` тот же |
| **C4** | Справочники: группировка, usage counts, копирайт категорий | нет | CRUD endpoints те же |
| **C5** | Классификация: без «Витринной категории»; gift subtype; placement block | нет | `catalogCategoryId` остаётся (hub/gift) |
| **C6** | SEO: канон URL, count labels, предупреждение пересечений | нет до 301 | существующие `/p` сохранить |
| **C7** | Доставка: progressive disclosure + ссылка на адрес магазина | нет | settings schema тот же |
| **C8** | Очистка: DTO productKind на list, bulk permission annotation, dead copy | additive DTO | |
| **C9** | Регресс: lint, typecheck, unit, e2e критичных сценариев | — | |

## C1 — навигация Admin (этот этап)

Сделать:

1. Сайт → Instagram доступен из «Главная и меню» (`isActive` включает `/admin/storefront/instagram`).
2. Настройки → «Юридическая информация».
3. Подписи SEO: диагностика vs подборки (без смены href).
4. Справочники: категории — витрина и подтипы подарков, не тип товара.
5. Сводка: «товары», не «букеты».
6. Доставка: ссылка на адрес/часы в настройках магазина.
7. Список товаров: «Новый товар» вместо «Новый букет» (копирайт, не колонки).

Не делать в C1: колонки таблицы, schema, публичные редиректы, drop полей.

Follow-up после аудита каталога: `/bukety` и связанные посадочные передают `categorySlug: 'bukety'` (только `BOUQUET`). Канон `/bukety` vs `/katalog/bukety` — в C6.

Критерий готовности C1: все рабочие экраны достижимы из сайдбара или явной ссылки соседнего экрана; права как раньше.

## C2 — таблица товаров ✅ (2026-10-19)

Сделано:

1. `ProductListItemDto` + mapper: `productKind`, `compositionKind`, `compositionSummary` (`adminProductCompositionSummary`).
2. Admin list query: `productKind`, `compositionKind`, `flowerTypeId`; `catalogCategoryId` сохранён для подтипа подарка / legacy.
3. UI: колонки фото / название / тип / состав / цена / публикация / наличие / действия; фильтры по ТЗ; подтип подарка только при `GIFT`.
4. Создание: «Добавить товар» с выбором типа (`productKind` в POST).
5. Быстрые действия: наличие, bulk publish/unpublish, открыть, предпросмотр, дублировать.
6. Тесты: contracts summary, mapper display, repository filters (без cartesian join), admin-catalog-contract query, permissions guard.

Критерий: менеджер находит STEM фильтром «Тип = Цветок поштучно» без «категория Цветы».

## C3 — редактор

Не переписывать `product-editor.tsx`. Точечно: create label, STEM-форма (вид/сорт/высота) уже на composition tab — проверить, что категория не всплывает; unsaved guard уже есть. Автосоздание справочника из editor — сохранить.

## C5 — классификация ✅ (2026-10-19)

Сделано:

1. Убрано поле «Витринная / ручная категория» из редактора букетов, композиций и цветов поштучно.
2. Для `GIFT` осталось понятное «Подтип подарка» (`catalogCategoryId` в дереве GIFTS).
3. `catalogCategoryId` не обязателен при create/save/publish; create назначает канонический хаб по `ProductKind`.
4. `resolveCatalogCategoryIdForProductKind`: non-gift → всегда hub; gift → subtype GIFTS или hub.
5. Смена типа с подтверждением при потере подтипа подарка; сервер не оставляет флоральную категорию у подарка и не пишет merchandising leaf у букетов.
6. Блок «Где отображается товар» (`GET …/placement`): хаб, подтип, фактические SEO-подборки (LIVE / draft / excluded).
7. Таблица `CatalogCategory` и URL не удалялись; мультивыбор категорий не вводился.

## C6 — SEO / URL (осторожно)

1. Сначала инвентарь: кто ссылается на `/cvety` (nav, sitemap, health, seed).
2. План 301: `/cvety` → `/katalog/tsvety` **или** оставить `/cvety` как alias хаба STEM (предпочтительно одно каноническое). Рекомендация плана: **канон `/katalog/tsvety`**, `/cvety` 301 после согласования (разрушительно для текущего индекса — **стоп до разрешения**).
3. `/cvety/[slug]` сегодня = букеты с цветком. Это ближе к SEO-landing, не к STEM. Рекомендация: 301 на `/p/{landing}` если landing есть, иначе `/bukety?flower=`. **Не делать без карты редиректов.**

## Тестирование (C9)

Обязательный прогон (не заявлять без запуска):

- `pnpm lint` / `pnpm typecheck` / `pnpm test`
- `pnpm test:e2e` если окружение поднято
- Ручные: создать STEM, опубликовать, `/katalog/tsvety`, SEO preview, заказ доставка/самовывоз

## Необратимое — только с отдельным «да»

- Production migrate drop column/table
- 301 публичных URL
- Смена секретов, push, deploy
- Reset DB / удаление заказов и медиа

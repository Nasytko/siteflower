# SiteFlower — аудит рефакторинга

Дата: 2026-10-18. Репозиторий: modular monolith `apps/web` (Next.js) + `apps/api` (NestJS) + Prisma/PostgreSQL. Без предположений: каждое утверждение опирается на код.

## Вердикт

Доменная модель каталога уже близка к целевой: **`ProductKind` — коммерческий источник истины**, состав (`FlowerItem` → `ProductComponent`) описывает цветы, **SEO-подборки** (`SeoLandingPage.rules`) и **навигация** (`NavigationMenu`) отделены от типа товара. Хбы `/katalog` фильтруют по `productKind`, без `category OR kind`.

Главный долг — **не схема, а админка и публичная IA**: таблица товаров всё ещё думает категориями; на витрине «Цветы» живут в двух смыслах (`/cvety` = букеты с цветком vs `/katalog/tsvety` = поштучно). Переписывать бэкенд с нуля не нужно.

---

## 1. Что уже правильно (не ломать)

| Область | Доказательство |
| --- | --- |
| `ProductKind` SSoT | `packages/database/prisma/schema.prisma` (`Product.productKind`); editor `product-editor-main-tab.tsx` («Раздел каталога определяется типом автоматически») |
| Хабы без OR со старой категорией | `resolveCategoryListingScope`: hubs → productKind only; OR-флаг удалён |
| Моно по PRIMARY, зелень не считается | enum `CompositionKind` + `ComponentRole.GREENERY`; `resolveStoredCompositionKind` обнуляет mono/mixed для STEM/GIFT |
| Цвет линии ≠ палитра карточки | `ProductComponent.colorId` vs `ProductColor`; SEO constructor: `componentColorId` vs `colorId` |
| Подарки через категорию-подтип | `productKindNeedsGiftSubtype` + `giftSubtypeOptions`; listing leaf → `useCategoryTree: true` |
| SEO без JSON для менеджера | `seo-landings-manager.tsx` — форма правил, не сырой JSON |
| Заказы / Europe/Minsk | `FulfillmentSettings`, `Order.fulfillmentDate`, `packages/contracts/src/orders.ts` |
| RBAC | `@RequirePermissions` на admin controllers; `packages/contracts/src/permissions.ts` |
| Админ-навигация по группам | `admin-shell-nav.tsx`: Работа / Каталог / Сайт / Настройки / Система |

---

## 2. Проблемы

Формат: где → что → почему → риск → приоритет → решение.

### P0 — `/bukety` не ограничивал ProductKind

**Где.** `catalogStateToListParams` раньше не передавал `categorySlug`. Хаб `/katalog/bukety` фильтрует `productKinds: ['BOUQUET']`, а `/bukety` ходил в `listProducts` без scope — в выдачу попадали STEM/GIFT/прочее.

**Почему это проблема.** Покупатель на «Букетах» видит поштучные цветы и подарки. Это тот же класс ошибки, что OR category∨kind, только с другой стороны: хаб без kind.

**Риск.** Высокий для витрины.

**Решение (сделано в follow-up 2026-10-18).** `categorySlug: 'bukety'` на `/bukety`, `/cvety/[slug]`, taxonomy landings и fallback `/akcii`. Тот же `resolveCategoryListingScope`.

---

### P0 — витрина: два смысла «Цветы»

**Где.**  
- `/cvety` — хаб `FlowerType`, тексты про букеты: `apps/web/src/app/(storefront)/cvety/page.tsx`, `flower-type-landing.tsx` (`listProducts({ flowerTypeSlug })` **без** `productKinds: ['STEM']`, ссылка «Уточнить» → `/bukety?flower=`).  
- `/katalog/tsvety` — хаб `listingKind=FLOWERS` → только `STEM` (`CANONICAL_LISTING_HUB_SLUGS.FLOWERS = 'tsvety'`).  
- `categoryPublicHref`: slug `cvety` → `/cvety`, slug `tsvety` → `/katalog/tsvety` (`packages/contracts/src/storefront.ts`).  
- Fallback-меню: «Цветы» → `/cvety` (`primary-nav.tsx`). Тест навигации ожидает `tsvety` → `/katalog/tsvety`.

**Проблема.** Покупатель и менеджер видят разные «Цветы»: поштучные стебли vs букеты, в составе которых есть вид. Скриншоты `/katalog` «Цветы» с сортами/высотой — STEM-хаб; карточки с букетами на фото — STEM-товары, завёрнутые как букет, или путаница данных.

**Почему это проблема.** Конкурирующие источники истины на публичной IA; SEO-дубли (`/cvety/rozy` vs `/katalog/rozy` vs `/p/…`).

**Риск.** Высокий для SEO и конверсии; ломает обещание «категория не дублирует тип».

**Решение.** Зафиксировать канон:  
1. Поштучно = `/katalog/tsvety` (+ листья `rozy` как STEM + `scopeFlowerTypeSlugs`).  
2. «Букеты с розами» = `SeoLandingPage` `/p/…` и/или фильтр `/bukety?flower=`.  
3. `/cvety` и `/cvety/[slug]` — 301 на канон (после инвентаризации индекса).  
4. Nav и `categoryPublicHref` привести к одному slug (`tsvety`).  
Не удалять URL до редиректов.

---

### P1 — таблица товаров всё ещё про категории — ✅ C2

**Было.** Колонки/фильтр по категории, create «Новый букет», нет `productKind` в list DTO.

**Сделано (C2).** Колонки: тип + `compositionSummary`; фильтры `productKind` / вид цветка / состав; подтип подарка только при GIFT; create с выбором типа. `catalogCategoryId` остаётся в API для gift subtype.

---

### P1 — публичные дубли URL и счётчик «букета»

**Где.** `categoryPublicHref` vs PRIMARY_NAV; `flower-type-landing.tsx` и `/p` всё ещё `bouquetCountLabel`; `/katalog` поправлен `catalogCountLabel` (2026-10-18).

**Проблема.** На страницах про цветы/подарки копирайт врёт. Два хаба индексируются параллельно.

**Риск.** Средний SEO.

**Решение.** Везде `catalogCountLabel(total, listingKind)`. Каноникализация `/cvety` (см. P0).

---

### P1 — админ-навигация не покрывает рабочие экраны

**Где.** Есть страницы `/admin/legal`, `/admin/storefront/instagram`, нет пунктов в `admin-shell-nav.tsx`. Instagram не связан с «Главная и меню». Юридическое — обязательный контур РБ (`docs/belarus-commerce-compliance.md`).

**Проблема.** Менеджер не находит ленту и юр.данные.

**Риск.** Средний (compliance + контент главной).

**Решение.** Настройки → «Юридическая информация» (`LEGAL_READ`). Сайт → Instagram внутри «Главная и меню» (ссылка + `isActive`). Не плодить пункты.

---

### P1 — категории в справочниках описаны как привязка товаров

**Где.** `catalog/dictionaries/page.tsx`: «структура разделов и **привязка товаров**». `CatalogCategory` всё ещё `Product.catalogCategoryId` (backfill хабов в `20261018230000_product_kind_category_hub`).

**Проблема.** Менеджер снова назначает «Розы» товару, хотя PLP хабов игнорирует category.

**Риск.** Средний: грязные данные, путаница с gift subtype.

**Решение.** Копирайт: дерево витрины + подтипы подарков. В редакторе категорию показывать только для GIFT (уже так). Не дропать колонку до подтверждения, что gift leaves и admin filter не нужны.

---

### P2 — `matchCategoryOrProductKind` ✅ удалён (2026-10-19)

Флаг и OR-ветка убраны из `CategoryListingScope`, public catalog и `products.repository`. Category ids + productKinds комбинируются только AND.

---

### P2 — редактор: объём extra-вкладки и «Новый букет»

**Где.** `product-editor.tsx` (~1500 строк) + 3 вкладки. Основное уже правильное (тип, имя, цена, подарок-подтип). `products-manager.tsx`: label «Новый букет».

**Проблема.** Форма рабочая, но список и create-copy всё ещё «букет-центричны». Extra держит редкие поля рядом с ежедневными.

**Риск.** Низкий/средний UX.

**Решение.** Не переписывать editor целиком. Сузить create-flow, переименовать копирайт, прогрессивное раскрытие extra.

---

### P2 — доставка: адрес магазина не на экране fulfillment

**Где.** Адрес / часы — `StorefrontSettings` (`storefront_settings`). Fulfillment — fee, lead time, windows, pickup instructions. Checkout валидирует окна по Europe/Minsk (`business-time.util.ts`).

**Проблема.** Менеджер ищет адрес самовывоза в «Доставка», а он в «Настройки магазина».

**Риск.** Низкий (путаница, не баг валидации).

**Решение.** На экране доставки: ссылка на адрес/часы; редкие поля в `<details>`. Не дублировать адрес в двух таблицах без миграции.

---

### P2 — SEO: два экрана + риск дублей landings

**Где.** `/admin/seo` (health), `/admin/seo/landings` (constructor). Правила покрывают flower / component color / qty / mono / palette / occasion / price (`seo-landings-manager.tsx`). Нет автоматического «создать все комбинации».

**Проблема.** Владелец может вручную завести пересекающиеся `/p` и `/cvety`. Health это ловит частично (`seo-health.service.ts`).

**Риск.** Средний SEO, если плодить страницы.

**Решение.** В конструкторе: предупреждение пересечения правил; не генерировать комбинации пакетом. Каноникализация `/cvety`.

---

### P2 — bulk endpoint декларирует CATALOG_READ

**Где.** `admin-products.controller.ts` `@Post('bulk') @RequirePermissions('CATALOG_READ')`; сервис `assertPermission` требует UPDATE/PUBLISH.

**Проблема.** Аннотация врёт; фактическая защита есть.

**Риск.** Низкий (defense in depth работает).

**Решение.** Сменить на `CATALOG_UPDATE` (publish всё равно проверяется внутри).

---

### P2 — устаревшие поля, не мёртвый код

| Поле | Статус |
| --- | --- |
| `Product.diameterCm` | Deprecated, скрыто из UI, колонка на месте — **не drop** |
| `Product.catalogCategoryId` | Нужен gift subtype + обратная совместимость URL |
| `FlowerItem.stemLengthCm` maps `height_cm` | Путаница имён с `Product.bouquetHeightCm` — документировать, не переименовывать без пользы |
| Dual-write category hub backfill | Миграция только UPDATE NULL category → hub; безопасна |

Не подтверждено мёртвыми: `BudgetRange` (витрина `/bukety`), `ProductFamily` (колонка «Линейка»), `HomepageConfig` tiles.

---

### P1 — PermissionsGuard пропускал admin-роуты без декоратора

**Где.** `apps/api/src/auth/permissions.guard.ts`: пустой `@RequirePermissions` → `return true`. Документ `docs/permissions.md` обещает deny by default. Существующие CRUD уже с декораторами; риск — будущий контроллер.

**Решение (сделано).** Admin path без permissions → 403. `me` / `logout` / `logout-all` помечены `ADMIN_ACCESS`.

**Не делаем без согласования:** outbox на `transition`/`cancel` (сейчас только `ORDER_CREATED`); Playwright в CI; смена `DELIVERY_*` vs `SETTINGS_*`.

---

### P2 — покрытие тестами

Счёт на момент аудита: ~35 spec в API, ~21 test во web (не e2e). Сильные места: `resolveCategoryListingScope`, composition kind, SEO rules, filters repository. Дыры: admin products list + ProductKind; публичная каноникализация `cvety`/`tsvety`; editor gift-only category; E2E создания STEM-товара.

---

## 3. Целевая архитектура (кратко)

```
ProductKind          → что продаём (BOUQUET | COMPOSITION | STEM | GIFT | …)
ProductComponent     → состав (FlowerItem + qty + role + line color)
compositionKind      → кэш PRIMARY (MONO/MIXED), зелень игнорируется
CatalogCategory      → URL/IA: хабы по kind, листья цветов = filter STEM+type,
                       листья подарков = дерево категорий
SeoLandingPage       → индексные посадочные по правилам ≠ дерево категорий
NavigationMenu       → что видит покупатель в шапке
```

Категория **не** выбирается для букета/стебля. Категория **выбирается** только как подтип подарка.

---

## 4. Что не трогать без отдельного разрешения

- Drop колонок/таблиц, reset DB, production migrate destructive.
- Push / deploy / секреты / ERP.
- Онлайн-оплата, склад, новая инфраструктура.
- Массовое переименование файлов.

---

## 5. Этапы реализации

См. `docs/refactoring-plan.md`. Первый безопасный этап: навигация Admin + копирайт (без миграций).

# Аудит: радикальное упрощение редактора товара, каталога и SEO

**Дата:** 2026-11-02  
**Ветка / tip на момент аудита:** `main` @ `a934c43`  
**Режим:** только чтение кода, схемы, миграций и документации. Код / Prisma / данные / deploy / VPS **не изменялись**.

## Согласованные решения владельца (вход)

1. Состав: конкретные `FlowerItem`, без количества, точности, ролей и признака полноты.  
2. Поводы / получатели: только выбор существующих записей; CRUD — в справочниках.  
3. Убрать ручные бейджи, универсальные особенности и ручную цветовую гамму, если нет необходимого бизнес-сценария.  
4. Одно основное описание; подробный текст — только при доказанной нужде.  
5. Alt изображений — автоматически, с ручным исключением.  
6. Убрать из редактора техническое размещение в каталоге.  
7. SEO — ограниченный набор полезных индексируемых страниц, без URL на все комбинации фильтров.  
8. ERP — источник точной рецептуры и склада.

---

## 1. Карта текущей архитектуры

### 1.1. Редактор товара (admin)

Один экран `ProductEditor` (карточки + disclosures, не классические вкладки). Атомарное сохранение: `PUT /admin/catalog/products/:id/editor`.

| UI-блок | Содержание | Файл |
|--------|------------|------|
| Тип | `productKind` (BOUQUET/STEM/…) | `apps/web/src/components/admin/product-editor-main-tab.tsx` (`blocks: kind`) |
| Состав | precision / complete / text / строки FlowerItem + qty/role + inline create | `product-editor-composition-tab.tsx`, `product-editor-inline-flower.tsx` |
| Название и цена | name (auto), `erpSku`, gift subtype, variant price, availability | `product-editor-main-tab.tsx` (`identity`) |
| Опции | группы / значения / surcharge / option ERP SKU | `product-editor-options-tab.tsx` |
| Фото | upload, primary, reorder, `alt` (PATCH сразу) | `product-editor.tsx` |
| Описание + аудитория | short/full, `badgeLabel`, occasions, recipients, `traitKeys`, `colorIds` | `product-editor-main-tab.tsx` (`copy`/`audience`) |
| Связанные | семьи товаров | `product-editor-related.tsx` |
| Размещение | **read-only** диагностика страниц | `product-placement-panel.tsx` |
| SEO | slug, title, description, noIndex | `product-editor.tsx` |
| Удаление | impact + delete | `AdminDeletePanel` |

Shell / state / save: `apps/web/src/components/admin/product-editor.tsx`  
Shared helpers: `product-editor-shared.ts`  
Readiness: `product-readiness-panel.tsx`  
Page: `apps/web/src/app/(admin)/admin/(shell)/catalog/products/[id]/page.tsx`

**Скрыто в UI, но уходит в save:** `heightCm` (`bouquetHeightCm`), `publishAt` / `unpublishAt`.

### 1.2. API / contracts

| Слой | Пути |
|------|------|
| Controller | `apps/api/src/catalog/admin-products.controller.ts` |
| DTO | `apps/api/src/catalog/products.dto.ts` (`SaveProductEditorDto`, …) |
| Service | `apps/api/src/catalog/products.service.ts` (normalize composition, traits, ERP) |
| Repository | `apps/api/src/catalog/products.repository.ts` (filters: compositionKind, qty, colors, traits) |
| Mapper | `apps/api/src/catalog/catalog.mapper.ts` (`toProductAdminDto` / `toProductPublicDto`) |
| Options / ERP | `product-options.util.ts`, `erp-sku-registry.ts` |
| Placement | `catalog-match.service.ts`, `placement-match.util.ts`, `catalog-pages.service.ts` |
| Contracts SoT | `packages/contracts/src/catalog.ts`, `catalog-page-rules.ts` |

Публичный DTO **не** отдаёт: `compositionPrecision`, `compositionPrimaryComplete`, `compositionText`, `traitKeys`, product `erpSku`, component `quantity`.  
Публично отдаёт: `badgeLabel`, `compositionKind`, упрощённые components (role/unit/colorSlug без qty), optionGroups без ERP SKU.

### 1.3. Данные (Prisma)

Источник: `packages/database/prisma/schema.prisma`.

```
Product
  ├─ ProductVariant (+ promotion prices, option overrides)
  ├─ ProductOptionGroup → ProductOptionValue (+ ErpSkuRegistry)
  ├─ ProductComponent → FlowerItem (+ optional Color, role, quantity, unit)
  ├─ ProductOccasion / ProductRecipient / ProductColor
  ├─ ProductTrait → ProductTraitDefinition
  ├─ ProductMedia → MediaAsset
  ├─ catalogCategoryId → CatalogCategory (hub / gift subtype)
  ├─ catalog_page_* pins/excludes
  └─ seo_landing_* pins/excludes (legacy, schema only for reconcile)
```

Ключевые поля Product: `badgeLabel`, `erpSku`, `productKind`, `compositionKind`, `compositionPrecision`, `compositionPrimaryComplete`, `compositionText`, `shortDescription`, `description`, SEO-поля.

### 1.4. Storefront / SEO

| Поверхность | URL | SoT |
|-------------|-----|-----|
| Каталог / PLP | `/catalog`, `/catalog/[slug]` | `CatalogCategory` + rules |
| PDP | `/products/[slug]` | Product |
| Поводы / кому | `/povod`, `/povod/[slug]`, `/komu/[slug]` | Occasion / Recipient |
| Фильтры query | `?flower=&color=&kind=&qty=…` | **noindex** + canonical без query |
| Sitemap | hubs + published categories + PDPs + taxonomies | `public-catalog.service.getSitemap` |

`SeoLandingPage`: таблицы живы; runtime-чтение только в `catalog-seo-reconcile.util.ts`; публичный API / sitemap / admin write **уже сняты**. DROP подготовлен (`deploy/cleanup-plans/task05-seo-landing-drop.v1.json`), не применён.

### 1.5. ERP / заказы

- Сайт хранит `Product.erpSku` / `ProductOptionValue.erpSku` + `ErpSkuRegistry`.  
- Точная рецептура и склад — зона ERP (см. `docs/task05-cleanup-audit.md`).  
- `OrderItem` снапшотит `productErpSku`, `optionsSnapshot`, цены; не зависит от live composition.

---

## 2. Реестр спорных полей и механизмов

| ID | Механизм | Где живёт | Зачем появился | Живое использование | Решение |
|----|----------|-----------|----------------|---------------------|---------|
| C1 | `compositionPrecision` | Product + editor + contracts + service normalize | EXACT/APPROX/DESCRIPTIVE для фильтров и UI | Admin only; влияет на `compositionKind` | **Удалить** |
| C2 | `compositionPrimaryComplete` | Product + editor | Gate MONO/MIXED при APPROXIMATE | Admin save → derive | **Удалить** |
| C3 | `compositionText` | Product + editor | DESCRIPTIVE free-text | Admin only; не в public DTO | **Удалить** |
| C4 | `ComponentRole` / `role` | ProductComponent + filters + derive | PRIMARY vs greenery для kind/palette | Admin + public components + filters + derive | **Удалить** |
| C5 | `ProductComponent.quantity` | DB + admin + `minFlowerTypeQuantity` filter | «Точная» рецептура на сайте | Admin + PLP qty filter; скрыт на PDP | **Удалить** (ERP SoT) |
| C6 | `ComponentUnit` / `unit` | ProductComponent | Единицы qty | Admin + public DTO | **Удалить** вместе с qty |
| C7 | `ProductComponent.colorId` | Component line override | Цвет линии ≠ словарь | Admin + filter OR flower color | **Удалить**; цвет = `FlowerItem.colorId` |
| C8 | `compositionKind` (cached) | Product + PLP filter + JSON-LD | MONO/MIXED из PRIMARY | Live filter | **Упростить**: авто из distinct FlowerType всех строк **или** убрать фильтр (вопрос владельцу) |
| C9 | `deriveCompositionKind` / `normalizeComposition*` | contracts + products.service | Классификация | Ядро текущей модели | **Заменить** упрощённой функцией или удалить |
| B1 | `badgeLabel` | Product + PDP buy card | Мерч-бейдж («Хит») | Live PDP | **Удалить** (нет доказанного must-have; промо уже через Promotion/bestsellers) |
| T1 | `traitKeys` / `ProductTrait*` | ProductTrait + page rules | Невыводимые флаги (AUTHORIAL) | Live thematic «авторский» | **Упростить → заменить**: один явный флаг / pin на THEMATIC; универсальный trait-engine — **удалить** |
| P1 | `ProductColor` / ручные `colorIds` | Junction + editor palette | «Гамма для SEO/фильтров» | Live filters + page rules | **Удалить ручное**; цвет фильтра = из FlowerItem состава |
| P2 | `suggestVisualPaletteColorIds` | contracts | Автозаполнение palette | Admin button | **Удалить** вместе с ProductColor |
| D1 | `shortDescription` | Product + publish gate + PDP lead + SEO default | Лид / meta | Live, required for publish | **Оставить** как **единственное** основное описание |
| D2 | `description` (full RichText) | Product + optional PDP tab | Подробный текст | Optional; не required | **Удалить из редактора**, если владелец не подтвердит нужду; иначе оставить optional offline |
| M1 | Media `alt` ручной | ProductMedia + PATCH | SEO alt | Live gallery; fallback `productImageAlt` | **Заменить**: авто по имени (+ состав?), ручной override = исключение |
| M2 | Alt на карточках каталога | product-card | — | Сейчас = имя товара, не media alt | Согласовать с авто-alt |
| PL1 | `ProductPlacementPanel` | Editor disclosure | Диагностика правил | Read-only | **Убрать из редактора** (п.6); при необходимости — только SEO Health |
| PL2 | Inline create occasion/recipient/color | `taxonomy-quick-pick.tsx` | Быстрый ввод | Live | **Удалить create** из редактора; только select |
| PL3 | Inline create FlowerItem | `product-editor-inline-flower.tsx` | Быстрый словарь | Live | **Оставить select**; create — только в справочнике цветов (вопрос: разрешить ли inline FlowerItem?) |
| SEO1 | `SeoLandingPage*` | DB + reconcile | Старые лендинги | Reconcile-only | **Удалить** после reconcile PASS + cleanup-plan (Task 05) |
| SEO2 | Filter query indexability | catalog `[slug]` page | Shareable filters | noindex при активных фильтрах | **Оставить**; добить page/sort noindex |
| SEO3 | `LEGACY` categories in sitemap | getSitemap | Старое дерево | Возможные дубли | **Упростить**: reclassify / exclude from sitemap |
| SEO4 | Orphan `CategoryFiltersEditor` | `catalog-categories-manager.tsx` не импортируется | Facet pool UI | Мёртвый UI | **Восстановить** в pages manager **или** удалить мёртвый код |
| H1 | `bouquetHeightCm` без UI | Product | Линейка на PDP | Storefront ruler если задан | **Оставить поле**; вернуть простой input **или** удалить линейку (вопрос) |
| V1 | Variants + Options + ERP SKU | Commerce core | Цена / допы / ERP | Live E2E | **Оставить** |
| F1 | Families / related | ProductFamily* | Связки | Live editor | **Оставить** |
| K1 | `productKind` + gift `catalogCategoryId` | Product | Хаб / тип | Live placement + editor | **Оставить** (это не «техническое размещение», а тип товара) |

---

## 3. Точные пути и зависимости

### 3.1. Редактор (web)

- `apps/web/src/components/admin/product-editor.tsx`
- `apps/web/src/components/admin/product-editor-main-tab.tsx`
- `apps/web/src/components/admin/product-editor-composition-tab.tsx`
- `apps/web/src/components/admin/product-editor-options-tab.tsx`
- `apps/web/src/components/admin/product-editor-related.tsx`
- `apps/web/src/components/admin/product-editor-inline-flower.tsx`
- `apps/web/src/components/admin/product-editor-shared.ts`
- `apps/web/src/components/admin/product-placement-panel.tsx`
- `apps/web/src/components/admin/product-readiness-panel.tsx`
- `apps/web/src/components/admin/taxonomy-quick-pick.tsx`
- `apps/web/src/components/admin/products-manager.tsx`
- `apps/web/src/app/(admin)/admin/(shell)/catalog/products/**`

### 3.2. API / catalog

- `apps/api/src/catalog/admin-products.controller.ts`
- `apps/api/src/catalog/products.dto.ts`
- `apps/api/src/catalog/products.service.ts`
- `apps/api/src/catalog/products.repository.ts`
- `apps/api/src/catalog/catalog.mapper.ts`
- `apps/api/src/catalog/catalog.logic.ts`
- `apps/api/src/catalog/product-editor.util.ts` (+ `.spec.ts`)
- `apps/api/src/catalog/product-options.util.ts`
- `apps/api/src/catalog/erp-sku-registry.ts`
- `apps/api/src/catalog/catalog-match.service.ts`
- `apps/api/src/catalog/catalog-listing.util.ts`
- `apps/api/src/catalog/catalog-pages.service.ts`
- `apps/api/src/catalog/catalog-filters.service.ts`
- `apps/api/src/catalog/placement-match.util.ts`
- `apps/api/src/catalog/public-catalog.service.ts`
- `apps/api/src/catalog/catalog-seo-reconcile.util.ts`
- `apps/api/src/catalog/flower-refs.service.ts`
- Filter/placement specs: `products.repository.filter.spec.ts`, `catalog-page-filters.spec.ts`, `placement-catalog-pages.spec.ts`, …

### 3.3. Contracts / schema / migrations

- `packages/contracts/src/catalog.ts` (`deriveCompositionKind`, DTOs, listing filters)
- `packages/contracts/src/catalog-page-rules.ts`
- `packages/contracts/src/catalog-seo-reconcile.ts`
- `packages/contracts/src/public-routes.ts`
- `packages/database/prisma/schema.prisma`
- Миграции: `20261018180000_composition_role_color_seo_landing`, `20261019120000_unify_catalog_pages`, `20261019150000_pdp_settings_badge`, `20261101120000_product_core_precision_options`, `20261101220000_product_erp_sku`, `20261102010000_drop_product_diameter_cm`
- Cleanup: `deploy/cleanup-plans/task05-seo-landing-drop.v1.json` + SQL under `packages/database/prisma/cleanup-plans/…`

### 3.4. Storefront / SEO UI

- `apps/web/src/app/(storefront)/catalog/[slug]/page.tsx` (noindex on filters)
- `apps/web/src/app/(storefront)/products/[slug]/page.tsx`
- `apps/web/src/components/storefront/product-purchase-panel.tsx` (`badgeLabel`)
- `apps/web/src/components/storefront/product-detail-info.tsx` (состав / description)
- `apps/web/src/lib/katalog-search-params.ts`
- `apps/web/src/lib/media.ts` (`productImageAlt`)
- `apps/web/src/app/sitemap.ts`, `robots.ts`, `next.config.ts` redirects

### 3.5. Документация (частично устарела)

- Актуально по смыслу: `docs/task05-cleanup-audit.md`, `docs/seo-legacy-reconcile.md`, `docs/refactor/08-catalog-seo-design.md`
- Устарело / dual-read: `docs/refactor/00-baseline.md`, `02-legacy-inventory.md`, фрагменты `docs/seo.md`, `docs/catalog.md`
- Предыдущий дизайн удерживал precision/AUTHORIAL/traits (`docs/refactor/06-target-architecture.md`, `09-admin-ux-design.md`) — **перекрывается** этим аудитом

---

## 4. Решения по механизмам (сводка leave / simplify / replace / delete)

| Решение | Механизмы |
|---------|-----------|
| **Оставить** | `productKind`, variants, options, ERP SKU registry, occasions/recipients **select**, FlowerItem dictionary, media gallery, families, CatalogCategory THEMATIC/hubs, slug redirects, publish lifecycle, `shortDescription` как основное описание, `erpSku` |
| **Упростить** | Состав → список `flowerItemId` (+ displayName/sortOrder); `compositionKind` → простая авто-деривация **или** отказ от фильтра; taxonomy pick без create; SEO noindex для `page`/`sort` |
| **Заменить** | Media alt → auto + optional override; AUTHORIAL trait-engine → один boolean/`isAuthorial` **или** pins на THEMATIC; цвет фильтра → из `FlowerItem.colorId` состава |
| **Удалить** | precision / primaryComplete / compositionText / role / unit / quantity / component.colorId / badgeLabel / ProductColor ручной / ProductTrait* (после замены AUTHORIAL) / Placement panel в редакторе / inline taxonomy create / SeoLanding tables (после gate) / мёртвый categories-manager **или** восстановить filters UI |

**Не сохранять** только из-за зависимостей фильтров: `minFlowerTypeQuantity`, EXACT-only filters, role-based mono matching — удалить вместе с qty/role и обновить filter pool.

---

## 5. Целевая модель данных (предложение)

### 5.1. Product (после упрощения)

Оставить: identity (`name`, `slug`), `productKind`, `erpSku`, `shortDescription`, optional `description` **только если владелец подтвердит**, `availability`, lifecycle/schedule, `bouquetHeightCm?`, SEO fields, `catalogCategoryId` (gift subtype), relations: variants, options, media, occasions, recipients, components, families, catalog pins.

Убрать колонки: `badge_label`, `composition_precision`, `composition_primary_complete`, `composition_text`.  
`composition_kind`: либо оставить как **кэш** от упрощённой деривации, либо удалить и считать на чтении / отказаться от facet.

### 5.2. ProductComponent (целевой)

```
id, productId, flowerItemId, displayName, sortOrder, timestamps
```

Без: `quantity`, `unit`, `role`, `colorId`.  
Уникальность линии: `(productId, flowerItemId)` рекомендуется (сейчас дубликаты строк допустимы — вопрос владельцу).

### 5.3. Цвет

- SoT цвета стебля: `FlowerItem.colorId`.  
- Удалить `product_colors` и ручной editor palette.  
- PLP filter `color` / `ccolor` → match через `components.some.flowerItem.colorId` (уже частично есть OR-логика).

### 5.4. «Авторский» и прочие флаги

Вариант A (предпочтительный при одном сценарии): `Product.isAuthorial Boolean` + page rule `isAuthorial: true`.  
Вариант B: только pins на THEMATIC page «Авторские».  
Вариант C: оставить `ProductTrait` **только** для AUTHORIAL — **не рекомендуется** (универсальный движок ради одного ключа).

### 5.5. Описания

- `shortDescription` — единственное обязательное коммерческое описание (карточка, meta fallback, publish gate).  
- `description` — удалить из UI/API **или** оставить как редкий optional «подробнее» без publish requirement (решение владельца).

### 5.6. Media alt

- Default: `productImageAlt(name)` (уже есть).  
- Опционально: `altOverride` / пустой `alt` = auto; непустой = ручное исключение.  
- Не строить отдельную SEO-keyword систему.

### 5.7. SEO страницы

Без изменений архитектуры SoT: только curated `CatalogCategory` + taxonomies + PDP.  
Filter combos — никогда не в sitemap.  
Завершить Task 05 DROP `seo_landing_*`.

---

## 6. План миграции данных (без потери коммерчески ценных данных)

Порядок **безопасный**, с backup через существующий deploy/backup; применение на VPS — **отдельным** операторским шагом (не часть этого аудита).

1. **Инвентаризация (read-only SQL на VPS оператором)**  
   - count products with non-null `badge_label`, `composition_text`, precision ≠ UNKNOWN  
   - count components with quantity/role≠PRIMARY/colorId  
   - count `product_colors`, `product_traits`  
   - seo-reconcile status  

2. **Архив перед DROP колонок** (как для diameter):  
   - `_archive_product_composition_meta` ← precision/complete/text/badge  
   - `_archive_product_components_extra` ← quantity/unit/role/colorId  
   - `_archive_product_colors`, `_archive_product_traits`  
   Данные не «теряются» — уходят в archive tables / CSV export.

3. **Backfill перед удалением зависимостей**  
   - Если оставляем `compositionKind`: пересчитать от distinct `FlowerType` по всем строкам (роли игнорировать).  
   - Цвета: убедиться, что `FlowerItem.colorId` заполнен там, где фильтры опирались на `ProductColor` / component.colorId; иначе one-off backfill из archive.  
   - AUTHORIAL: `ProductTrait` where key=AUTHORIAL → `isAuthorial=true` или pins.

4. **Schema migrations (отдельными PR)**  
   - Drop editor-facing columns/enums после снятия кода записи.  
   - Drop `product_colors`, trait tables (если заменены).  
   - Task 05: drop `seo_landing_*` только после reconcile PASS + approval token.

5. **Не трогать:** orders, media assets, erp_sku_registry, variants/options, slug_redirects, catalog_categories rules (кроме удаления `traitKeys`/`colorIds` из JSON после code cutover — с миграцией rules JSON).

---

## 7. SEO-консолидация и защита от дублей

### Уже сделано (сохранить)

- Публичный SoT = `CatalogCategory` на `/catalog/*`.  
- `/p/:slug` → 301 `/catalog/:slug`.  
- Query-фильтры: `noIndex` + canonical без query (`catalog/[slug]/page.tsx`).  
- Sitemap не перечисляет комбинации фильтров.  
- Admin SeoLanding write API снят.

### Добить

| Gap | Действие |
|-----|----------|
| `?page>1`, non-default `sort` могут индексироваться | Расширить `katalogHasActiveFilters` / metadata noindex |
| `LEGACY` pageKind в sitemap | Исключить или reclassify |
| Overlapping THEMATIC | Контент-политика: мало страниц, явные rules; не автогенерация |
| Task 05 tables | reconcile → migrate pins → approved DROP → удалить Prisma models + reconcile-only code |
| Stale docs | Обновить `docs/seo.md`, `docs/catalog.md`, refactor baseline |
| Redirect SoT | CI/test: `next.config.ts` ↔ `public-routes.ts` |
| Filter admin UI orphan | Встроить editor в pages manager или удалить мёртвые файлы |

### Политика индексируемых URL (целевая)

Разрешено: `/`, `/catalog`, hubs, published THEMATIC/gift, `/products/*` (если !noIndex), `/povod/*`, `/komu/*`, static.  
Запрещено индексировать: любые multi-facet query URLs, авто-комбо фильтров, legacy SeoLanding paths (только 301).

---

## 8. Последовательность небольших задач реализации

Каждая задача — отдельный PR, зелёный CI, без VPS из Cursor.

| # | Задача | Результат |
|---|--------|-----------|
| 0 | Owner answers (раздел 10) | Зафиксированные решения |
| 1 | Editor UX: убрать Placement panel; taxonomy create → select-only; скрыть badge/traits/palette/precision UI (feature-flag или сразу) | UI проще; API ещё принимает старые поля |
| 2 | Composition UI: только список FlowerItem; убрать qty/role/precision/text/complete | Сохранение шлёт null/defaults |
| 3 | API stop-write: игнорировать/отклонять precision/role/qty/badge/colorIds/traits; упростить normalize | Новые записи чистые |
| 4 | Public/filters: убрать qty/role-dependent filters; цвет через FlowerItem; compositionKind simplify | Storefront согласован |
| 5 | Data archive + backfill migration | Данные сохранены в archive |
| 6 | Drop schema columns/enums/junctions + contracts cleanup | Нет мёртвых полей |
| 7 | Media alt auto + override; убрать/сузить `description` по решению | SEO alt + copy model |
| 8 | AUTHORIAL replace (boolean или pins) + удалить ProductTrait* | Нет универсальных traits |
| 9 | SEO hardening: page/sort noindex; LEGACY sitemap; docs sync; filters UI orphan | Дубли закрыты |
| 10 | Task 05 SeoLanding DROP (оператор на VPS) + code purge reconcile | Одна SEO-модель в DB |
| 11 | Dead code purge: legacy PUT components routes если не нужны, orphan managers, tests | Критерий «полного удаления» |

Параллельно **не** менять production pipeline / ERP registry / order snapshots.

---

## 9. Тесты и критерии полного удаления старого кода

### Обязательные регрессии

- `packages/contracts` tests: удалить/заменить suites `deriveCompositionKind` precision, `suggestVisualPaletteColorIds`, traitKeys rules.  
- `apps/api`: `products.repository.filter.spec.ts`, `catalog.mapper.display.spec.ts`, `product-editor.util.spec.ts`, `catalog-page-filters.spec.ts`, `placement-catalog-pages.spec.ts`, integration taxonomy/duplicate.  
- Web: editor readiness (без composition precision), PDP без badge, composition list без qty.  
- SEO: metadata noindex when filtered/page/sort; sitemap excludes landings.  
- Deploy tests без изменений поведения staging/production (`deploy/test/*`) — только если cleanup-plan трогаем отдельно.

### Definition of Done — старый код удалён

grep по репо = 0 (кроме archive SQL / audit docs / changelog):

- `compositionPrecision`, `compositionPrimaryComplete`, `compositionText`
- `ComponentRole`, `COMPOSITION_PRECISIONS`, `DESCRIPTIVE`
- `badgeLabel` / `badge_label`
- `traitKeys` / `ProductTrait` / `AUTHORIAL` (после замены)
- `suggestVisualPaletteColorIds`, `ProductColor` write paths
- `minFlowerTypeQuantity` (если qty удалён)
- `SeoLandingPage` models + reconcile (после Task 05)
- UI: `ProductPlacementPanel` в product-editor, create controls в taxonomy-quick-pick (для occasion/recipient)
- Docs refactor, утверждающие precision/dual-read sitemap, обновлены или помечены superseded

Публичный PDP: состав = имена FlowerItem; нет ролей/количеств; одно описание; alt авто.

---

## 10. Риски и вопросы владельцу

### Риски

| Риск | Влияние | Митигация |
|------|---------|-----------|
| Потеря «точной» витринной рецептуры (qty) | Меньше детализации на сайте | ERP SoT; archive columns; PDP и так без qty |
| Слом PLP фильтров qty / mono-by-role | UX подбора | Упростить facets; пересчитать kind |
| Удаление badge / traits без замены | Мерч и «Авторские» | Явная замена до DROP |
| ProductColor удаление при пустых FlowerItem.colorId | Пустые color facets | Backfill + словарь |
| SeoLanding DROP при нескопированных pins | Пропажа закреплённых товаров | seo-reconcile gate |
| Одновременный большой PR | Регрессии | Нарезка §8 |
| Inline FlowerItem create убран слишком рано | Медленнее работа менеджера | Справочник цветов удобный CRUD |

### Вопросы, требующие решения владельца

1. **`compositionKind` (MONO/MIXED) фильтр нужен?** Если да — авто из типов всех строк; если нет — удалить facet и колонку.  
2. **Подробное `description`:** удалить полностью или оставить редким optional?  
3. **«Авторские» букеты:** boolean на Product, pins на странице, или другой сценарий? Есть ли ещё «особенности» кроме AUTHORIAL?  
4. **Бейдж на PDP:** подтвердить удаление без замены (хиты = bestsellers/promo)?  
5. **Inline создание FlowerItem** в редакторе: запретить полностью (строго по п.2 духу справочников) или временно оставить?  
6. **Уникальность** `(productId, flowerItemId)` — одна строка на цветок?  
7. **`bouquetHeightCm`:** вернуть поле в UI или убрать линейку со storefront?  
8. **Цвет в фильтрах:** достаточно цвета из FlowerItem, без отдельной «гаммы»?  
9. **Task 05:** когда запускать reconcile/DROP на VPS относительно упрощения редактора?  
10. **Дубли строк состава** (один FlowerItem дважды) — допустимы ли после отказа от quantity?

---

## Приложение A — обнаруженные проблемы (факты аудита)

1. Редактор перегружен: precision/roles/qty/traits/palette/placement при том, что PDP показывает упрощённый состав без qty.  
2. Дублирование «точности рецепта» с ERP при явной границе SoT в Task 05.  
3. Inline create поводов/получателей/цветов в редакторе противоречит целевому правилу справочников.  
4. `badgeLabel` и универсальные `traitKeys` — тонкая мерч-логика без отдельной продуктовой необходимости сверх AUTHORIAL.  
5. Ручная `ProductColor` гамма дублирует цвет словаря FlowerItem + component.colorId.  
6. `ProductPlacementPanel` в редакторе = техническая диагностика (п.6 — убрать).  
7. `heightCm` / schedule поля в save без UI — скрытый state.  
8. `SeoLandingPage` таблицы и Prisma models ещё живы после code cutover.  
9. Filter admin UI (`CategoryFiltersEditor`) отвязан — мёртвый/недоступный код.  
10. Pagination/sort query URL — дыра в noindex.  
11. LEGACY categories могут попадать в sitemap.  
12. Документация refactor/seo частично описывает dual-read и старую precision-модель.  
13. `minFlowerTypeQuantity` и EXACT filters жёстко завязаны на удаляемые qty/precision.  
14. Два описания (`short` + full) при publish-gate только на short.  
15. Media alt уже с fallback, но UX = ручной ввод по умолчанию, не «auto + exclude».

---

## Приложение B — что сознательно не предлагается

- Новая универсальная система «фич товара» / tag engine.  
- Автогенерация SEO URL под комбинации фильтров.  
- Перенос ERP-рецептуры на сайт.  
- Параллельная модель SeoLanding «на всякий случай».  
- Сохранение precision API «для совместимости» после cutover.

---

**Статус аудита:** завершён 2026-11-02.

---

## Приложение C — Task 01 / FlowerType.compositionClass (обновлено)

**Статус: `PARTIAL` / code cleanup done** — active TS/React legacy (role/qty/precision/inline-flower) removed from runtime. DB validation **BLOCKED** (нет локального PostgreSQL/Docker). Commit/push/deploy/VPS не выполнялись. Contract DROP всё ещё deferred.

### Согласованная модель

`FlowerType.compositionClass: BLOOM | DECORATIVE | null`  
null = не классифицирован → любой товар с таким типом в составе → `compositionKind UNKNOWN`.  
DECORATIVE не участвует в подсчёте. Auto-backfill из `ComponentRole` **запрещён**.

### Миграции

| Порядок | Путь | Содержание |
|---------|------|------------|
| 1 EXPAND | `prisma/migrations/20261102220000_flower_type_composition_class/` | enum + nullable column; `display_name` DROP NOT NULL; **без** backfill/DROP role |
| 2 CONTRACT | `prisma/deferred/20261102230000_simplify_product_composition_contract.sql` | **BLOCKED** — archive/dedupe/DROP legacy composition columns; не в migrate deploy |

Временная совместимость до contract: см. `prisma/deferred/README.md` (лишние колонки в БД + PG defaults; runtime **не** читает role).

### Блокеры contract / COMPLETE

1. Inventory на staging (ops SQL).  
2. Ручная разметка всех используемых FlowerType.  
3. Эквивалентность MONO/MIXED vs старый role-классификатор на выборке.  
4. Прогон expand (+ позже contract) на PostgreSQL.  
5. Owner approval на contract DROP.

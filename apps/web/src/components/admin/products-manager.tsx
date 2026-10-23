'use client';

import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  COMMERCIAL_AVAILABILITIES,
  COMPOSITION_KINDS,
  DEFAULT_NEW_PRODUCT_NAMES,
  PRIMARY_PRODUCT_KINDS,
  PRODUCT_LIFECYCLES,
  type CommercialAvailability,
  type CompositionKind,
  type PaginatedResponse,
  type ProductKind,
  type ProductListItemDto,
} from '@bouquet-one/contracts';
import { adminDelete, adminPatch, adminPost, AdminRequestError, errorMessage } from '@/lib/admin-client';
import { buildProductAvailabilityPatchBody } from '@/lib/admin-catalog-contract';
import { adminEndpoints } from '@/lib/admin-endpoints';
import {
  availabilityLabel,
  compositionKindLabel,
  lifecycleLabel,
  productKindLabel,
} from '@/lib/admin-labels';
import { availabilityChipClass, lifecycleChipClass } from '@/lib/admin-status';
import { toSameOriginMediaUrl } from '@/lib/media';

export type ProductFilters = {
  search: string;
  productKind: string;
  flowerTypeId: string;
  compositionKind: string;
  lifecycle: string;
  availability: string;
  /** Empty or "true" — maps to API promotionalOnly. */
  promotionalOnly: string;
  /** Gift subtype only (when productKind=GIFT). */
  catalogCategoryId: string;
  bestsellerGroupIds: string;
  sort: string;
  page: number;
};

type Props = {
  data: PaginatedResponse<ProductListItemDto>;
  filters: ProductFilters;
  flowerTypes: Array<{ id: string; name: string }>;
  giftSubtypes: Array<{ id: string; name: string }>;
  bestsellerGroups: Array<{ id: string; name: string }>;
  canCreate: boolean;
  canUpdate: boolean;
  canPublish: boolean;
  canDelete?: boolean;
};

type AvailabilityPatchResult = {
  id: string;
  availability: CommercialAvailability;
  version: number;
  updatedAt: string;
};

const SORTS: Array<[string, string]> = [
  ['', 'Сначала изменённые'],
  ['recommended', 'Порядок витрины'],
  ['price_asc', 'Цена: по возрастанию'],
  ['price_desc', 'Цена: по убыванию'],
  ['newest', 'Сначала новые'],
];

const COMPOSITION_FILTER_KINDS = COMPOSITION_KINDS.filter(
  (value): value is Exclude<CompositionKind, 'UNKNOWN'> => value !== 'UNKNOWN',
);

const SEARCH_DEBOUNCE_MS = 320;

function IconSearch({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.75" />
      <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconSliders({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M1 14h6M9 8h6M17 16h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconPlus({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconMore({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="5" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="19" r="1.5" fill="currentColor" />
    </svg>
  );
}

function countExtraFilters(filters: ProductFilters): number {
  let n = 0;
  if (filters.flowerTypeId) n += 1;
  if (filters.compositionKind) n += 1;
  if (filters.promotionalOnly === 'true') n += 1;
  if (filters.catalogCategoryId) n += 1;
  if (filters.bestsellerGroupIds) n += 1;
  if (filters.sort) n += 1;
  return n;
}

function storefrontHref(item: ProductListItemDto): string {
  return `/bukety/${item.slug}`;
}

function ProductThumb({ item }: { item: ProductListItemDto }) {
  if (item.primaryImageUrl) {
    return (
      <img
        src={toSameOriginMediaUrl(item.primaryImageUrl) ?? item.primaryImageUrl}
        alt=""
        className="admin-products-thumb"
      />
    );
  }
  return <div className="admin-products-thumb admin-products-thumb--empty" title="Нет фото" />;
}

function PriceCell({ item }: { item: ProductListItemDto }) {
  if (item.promotion) {
    return (
      <span className="admin-products-price admin-products-price--sale">
        <span className="admin-products-price__sale">{item.promotion.salePrice.label}</span>
        <span className="admin-products-price__old">{item.promotion.originalPrice.label}</span>
      </span>
    );
  }
  return <span className="admin-products-price">{item.price?.label ?? '—'}</span>;
}

type RowActionsProps = {
  item: ProductListItemDto;
  canCreate: boolean;
  canPublish: boolean;
  canDelete: boolean;
  duplicating: boolean;
  onDuplicate: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
};

function ProductRowActions({
  item,
  canCreate,
  canPublish,
  canDelete,
  duplicating,
  onDuplicate,
  onArchive,
  onRestore,
  onDelete,
}: RowActionsProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const viewHref =
    item.lifecycle === 'PUBLISHED' ? storefrontHref(item) : `/admin/catalog/products/${item.id}/preview`;

  return (
    <div className="admin-products-menu" ref={rootRef}>
      <button
        type="button"
        className="admin-products-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Действия: ${item.name}`}
        onClick={() => setOpen((value) => !value)}
      >
        <IconMore />
      </button>
      {open ? (
        <div id={menuId} role="menu" className="admin-products-menu__panel">
          <Link
            role="menuitem"
            href={`/admin/catalog/products/${item.id}`}
            className="admin-products-menu__item"
            onClick={() => setOpen(false)}
          >
            Редактировать
          </Link>
          <Link
            role="menuitem"
            href={viewHref}
            className="admin-products-menu__item"
            target={item.lifecycle === 'PUBLISHED' ? '_blank' : undefined}
            rel={item.lifecycle === 'PUBLISHED' ? 'noreferrer' : undefined}
            onClick={() => setOpen(false)}
          >
            Посмотреть на сайте
          </Link>
          {canCreate ? (
            <button
              type="button"
              role="menuitem"
              className="admin-products-menu__item"
              disabled={duplicating}
              onClick={() => {
                setOpen(false);
                onDuplicate();
              }}
            >
              Дублировать
            </button>
          ) : null}
          {canPublish && item.lifecycle !== 'ARCHIVED' ? (
            <button
              type="button"
              role="menuitem"
              className="admin-products-menu__item"
              onClick={() => {
                setOpen(false);
                onArchive();
              }}
            >
              Архивировать
            </button>
          ) : null}
          {canPublish && item.lifecycle === 'ARCHIVED' ? (
            <button
              type="button"
              role="menuitem"
              className="admin-products-menu__item"
              onClick={() => {
                setOpen(false);
                onRestore();
              }}
            >
              Восстановить
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              role="menuitem"
              className="admin-products-menu__item admin-products-menu__item--danger"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
            >
              Удалить навсегда
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ProductsManager({
  data,
  filters,
  flowerTypes,
  giftSubtypes,
  bestsellerGroups,
  canCreate,
  canUpdate,
  canPublish,
  canDelete = false,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [navigating, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [creating, setCreating] = useState(false);
  const [duplicateTarget, setDuplicateTarget] = useState<ProductListItemDto | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [duplicateSuccessId, setDuplicateSuccessId] = useState<string | null>(null);
  const [rows, setRows] = useState(data.items);
  const [savingAvailabilityId, setSavingAvailabilityId] = useState<string | null>(null);
  const [availabilitySuccessId, setAvailabilitySuccessId] = useState<string | null>(null);
  const [pendingAvailabilityRetry, setPendingAvailabilityRetry] = useState<{
    id: string;
    availability: CommercialAvailability;
  } | null>(null);
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRows(data.items);
  }, [data.items]);

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);

  useEffect(() => {
    if (searchDraft === filters.search) return;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const value = searchDraft.trim();
      if (!value) params.delete('search');
      else params.set('search', value);
      params.delete('page');
      startTransition(() => {
        router.push(`/admin/catalog/products?${params.toString()}`);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchDraft, filters.search, searchParams, router, startTransition]);

  useEffect(() => {
    if (!filtersOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!filtersPanelRef.current?.contains(event.target as Node)) setFiltersOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setFiltersOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [filtersOpen]);

  const showGiftSubtype = filters.productKind === 'GIFT' && giftSubtypes.length > 0;
  const showCompositionKind =
    filters.productKind === 'BOUQUET' ||
    filters.productKind === 'COMPOSITION' ||
    filters.productKind === '';
  const extraFilterCount = countExtraFilters(filters);
  const hasAnyFilter =
    filters.search.length > 0 ||
    filters.productKind.length > 0 ||
    filters.lifecycle.length > 0 ||
    filters.availability.length > 0 ||
    extraFilterCount > 0;

  function pushFilters(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value.length === 0) params.delete(key);
      else params.set(key, value);
    }
    params.delete('page');
    startTransition(() => {
      router.push(`/admin/catalog/products?${params.toString()}`);
    });
  }

  function setFilter(key: string, value: string) {
    if (key === 'productKind') {
      pushFilters({
        productKind: value,
        catalogCategoryId: value === 'GIFT' ? filters.catalogCategoryId : null,
        compositionKind:
          value === 'BOUQUET' || value === 'COMPOSITION' || value === ''
            ? filters.compositionKind
            : null,
      });
      return;
    }
    pushFilters({ [key]: value });
  }

  function pageHref(page: number): string {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    return `/admin/catalog/products?${params.toString()}`;
  }

  async function onCreate() {
    if (!canCreate || creating) return;
    setCreating(true);
    setError(null);
    setRequestId(null);
    try {
      const kind: ProductKind = 'BOUQUET';
      const created = await adminPost<{ id: string }>(adminEndpoints.products, {
        name: DEFAULT_NEW_PRODUCT_NAMES[kind],
        productKind: kind,
      });
      router.push(`/admin/catalog/products/${created.id}?created=1`);
    } catch (err) {
      setError(errorMessage(err, 'Не удалось создать товар'));
      setRequestId(err instanceof AdminRequestError ? err.requestId ?? null : null);
    } finally {
      setCreating(false);
    }
  }

  async function onConfirmDuplicate() {
    if (!canCreate || !duplicateTarget) return;
    setDuplicating(true);
    setError(null);
    setRequestId(null);
    setRetryable(false);
    setDuplicateSuccessId(null);
    try {
      const created = await adminPost<{ id: string }>(
        adminEndpoints.productDuplicate(duplicateTarget.id),
        {},
      );
      setDuplicateTarget(null);
      setDuplicateSuccessId(created.id);
      router.push(`/admin/catalog/products/${created.id}`);
    } catch (err) {
      setError(errorMessage(err, 'Не удалось дублировать товар'));
      setRequestId(err instanceof AdminRequestError ? err.requestId ?? null : null);
      setRetryable(err instanceof AdminRequestError ? err.retryable : false);
    } finally {
      setDuplicating(false);
    }
  }

  async function onAvailabilityChange(item: ProductListItemDto, next: CommercialAvailability) {
    if (!canUpdate || next === item.availability || savingAvailabilityId) return;
    const previous = item;
    setSavingAvailabilityId(item.id);
    setError(null);
    setRequestId(null);
    setRetryable(false);
    setPendingAvailabilityRetry(null);
    setAvailabilitySuccessId(null);
    setDuplicateSuccessId(null);
    setRows((current) =>
      current.map((row) => (row.id === item.id ? { ...row, availability: next } : row)),
    );
    try {
      const updated = await adminPatch<AvailabilityPatchResult>(
        adminEndpoints.product(item.id),
        buildProductAvailabilityPatchBody(item.version, next),
      );
      setRows((current) =>
        current.map((row) =>
          row.id === item.id
            ? {
                ...row,
                availability: updated.availability,
                version: updated.version,
                updatedAt: updated.updatedAt,
              }
            : row,
        ),
      );
      setAvailabilitySuccessId(item.id);
    } catch (err) {
      setRows((current) => current.map((row) => (row.id === item.id ? previous : row)));
      const conflict =
        err instanceof AdminRequestError && err.kind === 'conflict'
          ? 'Товар был изменён в другом окне. Обновите данные.'
          : errorMessage(err, 'Не удалось изменить доступность');
      setError(conflict);
      setRequestId(err instanceof AdminRequestError ? err.requestId ?? null : null);
      setRetryable(err instanceof AdminRequestError ? err.retryable : false);
      setPendingAvailabilityRetry({ id: item.id, availability: next });
    } finally {
      setSavingAvailabilityId(null);
    }
  }

  async function onRetryAvailability() {
    if (!pendingAvailabilityRetry) return;
    const row = rows.find((item) => item.id === pendingAvailabilityRetry.id);
    if (!row) return;
    await onAvailabilityChange(row, pendingAvailabilityRetry.availability);
  }

  function runLifecycle(item: ProductListItemDto, action: 'archive' | 'restore') {
    void adminPost(adminEndpoints.productLifecycle(item.id, action), {
      expectedVersion: item.version,
    })
      .then(() => router.refresh())
      .catch((err) =>
        setError(
          errorMessage(
            err,
            action === 'archive' ? 'Не удалось архивировать товар' : 'Не удалось восстановить товар',
          ),
        ),
      );
  }

  function runDelete(item: ProductListItemDto) {
    const confirmName = window.prompt(
      `Удалить навсегда «${item.name}»? Введите точное название товара для подтверждения.`,
    );
    if (confirmName == null) return;
    void adminDelete(adminEndpoints.product(item.id), {
      expectedVersion: item.version,
      confirmName,
      detach: true,
    })
      .then(() => router.refresh())
      .catch((err) => setError(errorMessage(err, 'Не удалось удалить товар')));
  }

  const pages = Math.max(1, Math.ceil(data.total / Math.max(1, data.pageSize)));

  function renderAvailability(item: ProductListItemDto): ReactNode {
    const savingAvailability = savingAvailabilityId === item.id;
    if (!canUpdate) {
      return (
        <span className={availabilityChipClass(item.availability)}>
          {availabilityLabel(item.availability)}
        </span>
      );
    }
    return (
      <label className="admin-products-availability">
        <span className="sr-only">Наличие: {item.name}</span>
        <select
          className={`admin-select admin-products-availability__select ${
            item.availability === 'AVAILABLE' ? '' : 'admin-products-availability__select--warn'
          }`}
          value={item.availability}
          disabled={savingAvailability || Boolean(savingAvailabilityId)}
          aria-busy={savingAvailability}
          onChange={(event) => {
            void onAvailabilityChange(item, event.target.value as CommercialAvailability);
          }}
        >
          {COMMERCIAL_AVAILABILITIES.map((value) => (
            <option key={value} value={value}>
              {availabilityLabel(value)}
            </option>
          ))}
        </select>
        {savingAvailability ? (
          <span className="admin-products-availability__hint">Сохранение…</span>
        ) : null}
      </label>
    );
  }

  function renderRowActions(item: ProductListItemDto) {
    return (
      <ProductRowActions
        item={item}
        canCreate={canCreate}
        canPublish={canPublish}
        canDelete={canDelete}
        duplicating={duplicating}
        onDuplicate={() => {
          setDuplicateSuccessId(null);
          setDuplicateTarget(item);
        }}
        onArchive={() => runLifecycle(item, 'archive')}
        onRestore={() => runLifecycle(item, 'restore')}
        onDelete={() => runDelete(item)}
      />
    );
  }

  return (
    <div className={`admin-products ${navigating ? 'admin-products--loading' : ''}`}>
      <header className="admin-products-header">
        <div>
          <h1 className="admin-page-title">Товары</h1>
          <p className="admin-page-lead">Управление ассортиментом магазина</p>
        </div>
        {canCreate ? (
          <button
            type="button"
            className="admin-btn admin-products-header__create"
            disabled={creating}
            onClick={() => void onCreate()}
          >
            <IconPlus />
            {creating ? 'Создаём…' : 'Добавить товар'}
          </button>
        ) : null}
      </header>

      {error ? (
        <div role="alert" className="admin-error">
          <p>{error}</p>
          {requestId ? <p className="text-xs text-[var(--admin-muted)]">Код: {requestId}</p> : null}
          {retryable && pendingAvailabilityRetry ? (
            <button type="button" className="admin-link mt-2 block text-sm" onClick={() => void onRetryAvailability()}>
              Повторить
            </button>
          ) : null}
        </div>
      ) : null}

      {availabilitySuccessId ? (
        <p role="status" className="admin-notice admin-notice--success">
          Наличие изменено
        </p>
      ) : null}

      {duplicateSuccessId ? (
        <p role="status" className="admin-notice admin-notice--success">
          Товар создан как черновик.{' '}
          <Link href={`/admin/catalog/products/${duplicateSuccessId}`} className="admin-link font-semibold">
            Открыть товар
          </Link>
        </p>
      ) : null}

      {duplicateTarget ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="duplicate-product-title"
          className="admin-panel space-y-3 border border-[var(--admin-brand)]/30 p-4"
        >
          <h2 id="duplicate-product-title" className="text-base font-semibold text-[var(--admin-ink)]">
            Дублировать товар?
          </h2>
          <p className="text-sm text-[var(--admin-muted)]">
            Будет создан новый черновик на основе «{duplicateTarget.name}». Акции и подборки не
            переносятся.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={duplicating}
              onClick={() => void onConfirmDuplicate()}
              className="admin-btn"
            >
              {duplicating ? 'Дублирование…' : 'Дублировать'}
            </button>
            <button
              type="button"
              className="admin-btn-ghost"
              disabled={duplicating}
              onClick={() => setDuplicateTarget(null)}
            >
              Отмена
            </button>
          </div>
        </div>
      ) : null}

      <div className="admin-products-toolbar">
        <label className="admin-products-search">
          <IconSearch className="admin-products-search__icon" />
          <span className="sr-only">Поиск</span>
          <input
            className="admin-products-search__input"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                pushFilters({ search: searchDraft.trim() || null });
              }
            }}
            placeholder="Поиск по названию или адресу…"
            autoComplete="off"
          />
        </label>

        <label className="admin-products-select">
          <span className="sr-only">Тип</span>
          <select
            className="admin-select"
            value={filters.productKind}
            onChange={(event) => setFilter('productKind', event.target.value)}
          >
            <option value="">Тип</option>
            {PRIMARY_PRODUCT_KINDS.map((value) => (
              <option key={value} value={value}>
                {productKindLabel(value)}
              </option>
            ))}
          </select>
        </label>

        <label className="admin-products-select">
          <span className="sr-only">Статус</span>
          <select
            className="admin-select"
            value={filters.lifecycle}
            onChange={(event) => setFilter('lifecycle', event.target.value)}
          >
            <option value="">Статус</option>
            {PRODUCT_LIFECYCLES.map((value) => (
              <option key={value} value={value}>
                {lifecycleLabel(value)}
              </option>
            ))}
          </select>
        </label>

        <label className="admin-products-select">
          <span className="sr-only">Наличие</span>
          <select
            className="admin-select"
            value={filters.availability}
            onChange={(event) => setFilter('availability', event.target.value)}
          >
            <option value="">Наличие</option>
            {COMMERCIAL_AVAILABILITIES.map((value) => (
              <option key={value} value={value}>
                {availabilityLabel(value)}
              </option>
            ))}
          </select>
        </label>

        <div className="admin-products-filters" ref={filtersPanelRef}>
          <button
            type="button"
            className={`admin-products-filters__btn ${extraFilterCount > 0 ? 'admin-products-filters__btn--active' : ''}`}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((value) => !value)}
          >
            <IconSliders />
            Фильтры
            {extraFilterCount > 0 ? (
              <span className="admin-products-filters__count">{extraFilterCount}</span>
            ) : null}
          </button>
          {filtersOpen ? (
            <div className="admin-products-filters__panel" role="dialog" aria-label="Дополнительные фильтры">
              {flowerTypes.length > 0 ? (
                <label className="admin-field">
                  <span>Вид цветка</span>
                  <select
                    className="admin-select"
                    value={filters.flowerTypeId}
                    onChange={(event) => setFilter('flowerTypeId', event.target.value)}
                  >
                    <option value="">Любой</option>
                    {flowerTypes.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {showCompositionKind ? (
                <label className="admin-field">
                  <span>Тип состава</span>
                  <select
                    className="admin-select"
                    value={filters.compositionKind}
                    onChange={(event) => setFilter('compositionKind', event.target.value)}
                  >
                    <option value="">Любой</option>
                    {COMPOSITION_FILTER_KINDS.map((value) => (
                      <option key={value} value={value}>
                        {compositionKindLabel(value)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {showGiftSubtype ? (
                <label className="admin-field">
                  <span>Подтип подарка</span>
                  <select
                    className="admin-select"
                    value={filters.catalogCategoryId}
                    onChange={(event) => setFilter('catalogCategoryId', event.target.value)}
                  >
                    <option value="">Любой</option>
                    {giftSubtypes.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="admin-field">
                <span>Акция</span>
                <select
                  className="admin-select"
                  value={filters.promotionalOnly}
                  onChange={(event) => setFilter('promotionalOnly', event.target.value)}
                >
                  <option value="">Не важно</option>
                  <option value="true">Идёт сейчас</option>
                </select>
              </label>

              {bestsellerGroups.length > 0 ? (
                <label className="admin-field">
                  <span>Подборки</span>
                  <select
                    className="admin-select"
                    value={filters.bestsellerGroupIds}
                    onChange={(event) => setFilter('bestsellerGroupIds', event.target.value)}
                  >
                    <option value="">Все товары</option>
                    {bestsellerGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="admin-field">
                <span>Сортировка</span>
                <select
                  className="admin-select"
                  value={filters.sort}
                  onChange={(event) => setFilter('sort', event.target.value)}
                >
                  {SORTS.map(([value, label]) => (
                    <option key={value || 'default'} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="admin-products-filters__footer">
                <button type="button" className="admin-btn-ghost" onClick={() => setFiltersOpen(false)}>
                  Готово
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {hasAnyFilter ? (
          <Link href="/admin/catalog/products" className="admin-btn-ghost admin-products-reset">
            Сбросить
          </Link>
        ) : null}
      </div>

      <div className="admin-products-meta">
        <span>
          {navigating
            ? 'Обновляем…'
            : data.total === 0
              ? 'Нет товаров'
              : `Найдено: ${data.total}`}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="admin-products-empty">
          {hasAnyFilter ? (
            <>
              <p>Ничего не найдено</p>
              <p className="text-sm text-[var(--admin-muted)]">
                Измените поиск или сбросьте фильтры.
              </p>
              <Link href="/admin/catalog/products" className="admin-btn-ghost">
                Сбросить фильтры
              </Link>
            </>
          ) : (
            <>
              <p>Товаров пока нет</p>
              <p className="text-sm text-[var(--admin-muted)]">
                Создайте первый товар — откроется карточка для фото, цены и состава.
              </p>
              {canCreate ? (
                <button type="button" className="admin-btn" disabled={creating} onClick={() => void onCreate()}>
                  Добавить товар
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <>
          <div className="admin-products-table-wrap">
            <table className="admin-products-table">
              <thead>
                <tr>
                  <th>Товар</th>
                  <th>Тип</th>
                  <th className="admin-products-table__price">Цена</th>
                  <th>Статус</th>
                  <th>Наличие</th>
                  <th className="admin-products-table__actions">
                    <span className="sr-only">Действия</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => {
                  const kind = item.productKind ?? 'BOUQUET';
                  return (
                    <tr key={item.id}>
                      <td>
                        <div className="admin-products-identity">
                          <ProductThumb item={item} />
                          <div className="min-w-0">
                            <Link
                              href={`/admin/catalog/products/${item.id}`}
                              className="admin-products-identity__name"
                            >
                              {item.name}
                            </Link>
                            <p className="admin-products-identity__slug">/{item.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="admin-products-table__muted">{productKindLabel(kind)}</td>
                      <td className="admin-products-table__price">
                        <PriceCell item={item} />
                      </td>
                      <td>
                        <span className={lifecycleChipClass(item.lifecycle)}>
                          {lifecycleLabel(item.lifecycle)}
                        </span>
                      </td>
                      <td>{renderAvailability(item)}</td>
                      <td className="admin-products-table__actions">{renderRowActions(item)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="admin-products-cards">
            {rows.map((item) => {
              const kind = item.productKind ?? 'BOUQUET';
              return (
                <li key={item.id} className="admin-products-card">
                  <div className="admin-products-card__top">
                    <ProductThumb item={item} />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/admin/catalog/products/${item.id}`}
                        className="admin-products-identity__name"
                      >
                        {item.name}
                      </Link>
                      <p className="admin-products-identity__slug">
                        {productKindLabel(kind)} · /{item.slug}
                      </p>
                    </div>
                    {renderRowActions(item)}
                  </div>
                  <div className="admin-products-card__meta">
                    <PriceCell item={item} />
                    <span className={lifecycleChipClass(item.lifecycle)}>
                      {lifecycleLabel(item.lifecycle)}
                    </span>
                  </div>
                  <div className="admin-products-card__availability">{renderAvailability(item)}</div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {data.total > 0 || pages > 1 ? (
        <div className="admin-products-pagination">
          <span>
            {pages > 1
              ? `Стр. ${data.page} из ${pages}`
              : null}
          </span>
          <div className="flex gap-3">
            {data.page > 1 ? (
              <Link href={pageHref(data.page - 1)} className="admin-link">
                Назад
              </Link>
            ) : null}
            {data.page < pages ? (
              <Link href={pageHref(data.page + 1)} className="admin-link">
                Далее
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

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

const CREATE_KINDS = PRIMARY_PRODUCT_KINDS;

const CREATE_KIND_HINT: Record<(typeof CREATE_KINDS)[number], string> = {
  BOUQUET: 'Состав из цветов, цена за букет',
  COMPOSITION: 'Композиция в упаковке или корзине',
  STEM: 'Продажа по ветке',
  GIFT: 'Открытка, свеча и другие подарки',
};

const SORTS: Array<[string, string]> = [
  ['', 'Сначала изменённые'],
  ['recommended', 'Порядок витрины'],
  ['price_asc', 'Цена ↑'],
  ['price_desc', 'Цена ↓'],
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
  return `/products/${item.slug}`;
}

function ProductThumb({ item }: { item: ProductListItemDto }) {
  if (item.primaryImageUrl) {
    return (
      <img
        src={toSameOriginMediaUrl(item.primaryImageUrl) ?? item.primaryImageUrl}
        alt=""
        className="sf-ap-card__photo"
      />
    );
  }
  return <div className="sf-ap-card__photo sf-ap-card__photo--empty" aria-hidden />;
}

function PriceBlock({ item }: { item: ProductListItemDto }) {
  if (item.promotion) {
    return (
      <span className="sf-ap-card__price sf-ap-card__price--sale">
        <span>{item.promotion.salePrice.label}</span>
        <span className="sf-ap-card__price-old">{item.promotion.originalPrice.label}</span>
      </span>
    );
  }
  return <span className="sf-ap-card__price">{item.price?.label ?? '—'}</span>;
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
    <div className="sf-ap-menu" ref={rootRef}>
      <button
        type="button"
        className="sf-ap-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Действия: ${item.name}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <IconMore />
      </button>
      {open ? (
        <div id={menuId} role="menu" className="sf-ap-menu__panel">
          <Link
            role="menuitem"
            href={`/admin/catalog/products/${item.id}`}
            className="sf-ap-menu__item"
            onClick={() => setOpen(false)}
          >
            Открыть
          </Link>
          <Link
            role="menuitem"
            href={viewHref}
            className="sf-ap-menu__item"
            target={item.lifecycle === 'PUBLISHED' ? '_blank' : undefined}
            rel={item.lifecycle === 'PUBLISHED' ? 'noreferrer' : undefined}
            onClick={() => setOpen(false)}
          >
            На сайте
          </Link>
          {canCreate ? (
            <button
              type="button"
              role="menuitem"
              className="sf-ap-menu__item"
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
              className="sf-ap-menu__item"
              onClick={() => {
                setOpen(false);
                onArchive();
              }}
            >
              В архив
            </button>
          ) : null}
          {canPublish && item.lifecycle === 'ARCHIVED' ? (
            <button
              type="button"
              role="menuitem"
              className="sf-ap-menu__item"
              onClick={() => {
                setOpen(false);
                onRestore();
              }}
            >
              Из архива
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              role="menuitem"
              className="sf-ap-menu__item sf-ap-menu__item--danger"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
            >
              Удалить
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
  const [createOpen, setCreateOpen] = useState(false);
  const [createKind, setCreateKind] = useState<ProductKind>('BOUQUET');
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
  const [moreOpen, setMoreOpen] = useState(false);
  const morePanelRef = useRef<HTMLDivElement>(null);
  const createDialogRef = useRef<HTMLDivElement>(null);

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
    if (!moreOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!morePanelRef.current?.contains(event.target as Node)) setMoreOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMoreOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  useEffect(() => {
    if (!createOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !creating) setCreateOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [createOpen, creating]);

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

  async function onCreate(kind: ProductKind = createKind) {
    if (!canCreate || creating) return;
    setCreating(true);
    setError(null);
    setRequestId(null);
    try {
      const created = await adminPost<{ id: string }>(adminEndpoints.products, {
        name: DEFAULT_NEW_PRODUCT_NAMES[kind],
        productKind: kind,
      });
      setCreateOpen(false);
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
      <div
        className="sf-ap-avail"
        role="group"
        aria-label={`Наличие: ${item.name}`}
        aria-busy={savingAvailability}
        onClick={(event) => event.stopPropagation()}
      >
        {COMMERCIAL_AVAILABILITIES.map((value) => {
          const active = item.availability === value;
          return (
            <button
              key={value}
              type="button"
              className={`sf-ap-avail__chip ${active ? 'sf-ap-avail__chip--active' : ''} ${
                value !== 'AVAILABLE' && active ? 'sf-ap-avail__chip--warn' : ''
              }`}
              disabled={savingAvailability || Boolean(savingAvailabilityId)}
              aria-pressed={active}
              onClick={() => void onAvailabilityChange(item, value)}
            >
              {availabilityLabel(value)}
            </button>
          );
        })}
      </div>
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
    <div className={`sf-ap ${navigating ? 'sf-ap--loading' : ''}`}>
      <header className="sf-ap-header">
        <div>
          <h1 className="admin-page-title">Товары</h1>
          <p className="admin-page-lead">
            {navigating
              ? 'Обновляем…'
              : data.total === 0
                ? 'Пока пусто'
                : `${data.total} в каталоге`}
          </p>
        </div>
        {canCreate ? (
          <button
            type="button"
            className="admin-btn"
            disabled={creating}
            onClick={() => {
              setCreateKind('BOUQUET');
              setCreateOpen(true);
            }}
          >
            <IconPlus />
            Добавить товар
          </button>
        ) : null}
      </header>

      {createOpen ? (
        <div
          className="sf-ap-create"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sf-ap-create-title"
          ref={createDialogRef}
        >
          <div className="sf-ap-create__panel">
            <div className="sf-ap-create__head">
              <h2 id="sf-ap-create-title">Новый товар</h2>
              <p>Выберите тип — откроется черновик.</p>
            </div>
            <div className="sf-ap-create__kinds" role="radiogroup" aria-label="Тип товара">
              {CREATE_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={createKind === kind}
                  className={`sf-ap-create__kind ${createKind === kind ? 'sf-ap-create__kind--active' : ''}`}
                  disabled={creating}
                  onClick={() => setCreateKind(kind)}
                >
                  <strong>{productKindLabel(kind)}</strong>
                  <span>{CREATE_KIND_HINT[kind]}</span>
                </button>
              ))}
            </div>
            <div className="sf-ap-create__actions">
              <button
                type="button"
                className="admin-btn"
                disabled={creating}
                onClick={() => void onCreate(createKind)}
              >
                {creating ? 'Создаём…' : 'Создать черновик'}
              </button>
              <button
                type="button"
                className="admin-btn-ghost"
                disabled={creating}
                onClick={() => setCreateOpen(false)}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="admin-error">
          <p>{error}</p>
          {requestId ? <p className="text-xs text-[var(--admin-muted)]">Код: {requestId}</p> : null}
          {retryable && pendingAvailabilityRetry ? (
            <button
              type="button"
              className="admin-link mt-2 block text-sm"
              onClick={() => void onRetryAvailability()}
            >
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
          <Link
            href={`/admin/catalog/products/${duplicateSuccessId}`}
            className="admin-link font-semibold"
          >
            Открыть товар
          </Link>
        </p>
      ) : null}

      {duplicateTarget ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="duplicate-product-title"
          className="sf-ap-dialog"
        >
          <h2 id="duplicate-product-title">Дублировать товар?</h2>
          <p>
            Новый черновик на основе «{duplicateTarget.name}». Акции и подборки не переносятся.
          </p>
          <div className="sf-ap-dialog__actions">
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

      <div className="sf-ap-toolbar">
        <label className="sf-ap-search">
          <IconSearch className="sf-ap-search__icon" />
          <span className="sr-only">Поиск</span>
          <input
            className="sf-ap-search__input"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                pushFilters({ search: searchDraft.trim() || null });
              }
            }}
            placeholder="Название или адрес…"
            autoComplete="off"
          />
        </label>

        <div className="sf-ap-chips" role="group" aria-label="Тип">
          <button
            type="button"
            className={`sf-ap-chip ${filters.productKind === '' ? 'sf-ap-chip--active' : ''}`}
            onClick={() => setFilter('productKind', '')}
          >
            Все
          </button>
          {CREATE_KINDS.map((value) => (
            <button
              key={value}
              type="button"
              className={`sf-ap-chip ${filters.productKind === value ? 'sf-ap-chip--active' : ''}`}
              onClick={() => setFilter('productKind', value)}
            >
              {productKindLabel(value)}
            </button>
          ))}
        </div>

        <div className="sf-ap-toolbar__row">
          <label className="sf-ap-select">
            <span className="sr-only">Статус</span>
            <select
              className="admin-select"
              value={filters.lifecycle}
              onChange={(event) => setFilter('lifecycle', event.target.value)}
            >
              <option value="">Любой статус</option>
              {PRODUCT_LIFECYCLES.map((value) => (
                <option key={value} value={value}>
                  {lifecycleLabel(value)}
                </option>
              ))}
            </select>
          </label>

          <label className="sf-ap-select">
            <span className="sr-only">Наличие</span>
            <select
              className="admin-select"
              value={filters.availability}
              onChange={(event) => setFilter('availability', event.target.value)}
            >
              <option value="">Любое наличие</option>
              {COMMERCIAL_AVAILABILITIES.map((value) => (
                <option key={value} value={value}>
                  {availabilityLabel(value)}
                </option>
              ))}
            </select>
          </label>

          <div className="sf-ap-more" ref={morePanelRef}>
            <button
              type="button"
              className={`sf-ap-more__btn ${extraFilterCount > 0 ? 'sf-ap-more__btn--active' : ''}`}
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((value) => !value)}
            >
              Ещё
              {extraFilterCount > 0 ? (
                <span className="sf-ap-more__count">{extraFilterCount}</span>
              ) : null}
            </button>
            {moreOpen ? (
              <div className="sf-ap-more__panel" role="dialog" aria-label="Дополнительные фильтры">
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
                    <span>Моно / микс</span>
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
                    <span>Подборка</span>
                    <select
                      className="admin-select"
                      value={filters.bestsellerGroupIds}
                      onChange={(event) => setFilter('bestsellerGroupIds', event.target.value)}
                    >
                      <option value="">Все</option>
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

                <button type="button" className="admin-btn-ghost" onClick={() => setMoreOpen(false)}>
                  Готово
                </button>
              </div>
            ) : null}
          </div>

          {hasAnyFilter ? (
            <Link href="/admin/catalog/products" className="admin-btn-ghost sf-ap-reset">
              Сбросить
            </Link>
          ) : null}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="sf-ap-empty">
          {hasAnyFilter ? (
            <>
              <p>Ничего не найдено</p>
              <Link href="/admin/catalog/products" className="admin-btn-ghost">
                Сбросить фильтры
              </Link>
            </>
          ) : (
            <>
              <p>Товаров пока нет</p>
              <p className="sf-ap-empty__hint">Создайте черновик — дальше фото, цена и состав.</p>
              {canCreate ? (
                <button
                  type="button"
                  className="admin-btn"
                  disabled={creating}
                  onClick={() => {
                    setCreateKind('BOUQUET');
                    setCreateOpen(true);
                  }}
                >
                  Добавить товар
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <ul className="sf-ap-grid">
          {rows.map((item) => {
            const kind = item.productKind ?? 'BOUQUET';
            const summary =
              item.compositionSummary?.trim() ||
              (item.cardSubtitle?.trim() ? item.cardSubtitle : productKindLabel(kind));
            return (
              <li key={item.id} className="sf-ap-card">
                <Link href={`/admin/catalog/products/${item.id}`} className="sf-ap-card__main">
                  <ProductThumb item={item} />
                  <div className="sf-ap-card__body">
                    <div className="sf-ap-card__title-row">
                      <span className="sf-ap-card__name">{item.name}</span>
                      <PriceBlock item={item} />
                    </div>
                    <p className="sf-ap-card__summary">{summary}</p>
                    <div className="sf-ap-card__status">
                      <span className={lifecycleChipClass(item.lifecycle)}>
                        {lifecycleLabel(item.lifecycle)}
                      </span>
                      <span className="sf-ap-card__kind">{productKindLabel(kind)}</span>
                    </div>
                  </div>
                </Link>
                <div className="sf-ap-card__footer">
                  {renderAvailability(item)}
                  {renderRowActions(item)}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {data.total > 0 || pages > 1 ? (
        <div className="sf-ap-pagination">
          <span>{pages > 1 ? `Стр. ${data.page} из ${pages}` : null}</span>
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

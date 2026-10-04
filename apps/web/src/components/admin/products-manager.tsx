'use client';

import { FormEvent, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  BULK_PRODUCTS_MAX_ITEMS,
  COMMERCIAL_AVAILABILITIES,
  PRODUCT_LIFECYCLES,
  type BulkProductOperation,
  type BulkProductOperationResultDto,
  type CommercialAvailability,
  type PaginatedResponse,
  type ProductListItemDto,
} from '@bouquet-one/contracts';
import { Button } from '@bouquet-one/ui';
import { adminPatch, adminPost, AdminRequestError, errorMessage } from '@/lib/admin-client';
import {
  buildProductAvailabilityPatchBody,
  buildProductsBulkBody,
} from '@/lib/admin-catalog-contract';
import { adminEndpoints } from '@/lib/admin-endpoints';
import { availabilityLabel, formatAdminDateTime, lifecycleLabel } from '@/lib/admin-labels';
import { availabilityChipClass, lifecycleChipClass } from '@/lib/admin-status';
import { toSameOriginMediaUrl } from '@/lib/media';

export type ProductFilters = {
  search: string;
  lifecycle: string;
  availability: string;
  /** Empty or "true" — maps to API promotionalOnly. */
  promotionalOnly: string;
  bestsellerGroupIds: string;
  sort: string;
  page: number;
};

type Props = {
  data: PaginatedResponse<ProductListItemDto>;
  filters: ProductFilters;
  bestsellerGroups: Array<{ id: string; name: string }>;
  canCreate: boolean;
  canUpdate: boolean;
  canPublish: boolean;
};

type BulkConfirm =
  | { kind: 'PUBLISH' | 'UNPUBLISH' }
  | { kind: 'SET_AVAILABILITY'; availability: CommercialAvailability };

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

export function ProductsManager({
  data,
  filters,
  bestsellerGroups,
  canCreate,
  canUpdate,
  canPublish,
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkConfirm, setBulkConfirm] = useState<BulkConfirm | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkSummary, setBulkSummary] = useState<string | null>(null);
  const [bulkProblems, setBulkProblems] = useState<Array<{ name: string; message: string }>>(
    [],
  );
  const [showBulkProblems, setShowBulkProblems] = useState(false);

  useEffect(() => {
    setRows(data.items);
    setSelectedIds(new Set());
    setBulkConfirm(null);
  }, [data.items]);

  const canBulk = canPublish || canUpdate;
  const selectedRows = rows.filter((row) => selectedIds.has(row.id));
  const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id));

  const groupNames = new Map(bestsellerGroups.map((group) => [group.id, group.name]));

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value.length === 0) params.delete(key);
    else params.set(key, value);
    params.delete('page');
    startTransition(() => {
      router.push(`/admin/catalog/products?${params.toString()}`);
    });
  }

  function pageHref(page: number): string {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    return `/admin/catalog/products?${params.toString()}`;
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    if (name.length === 0) return;
    setCreating(true);
    setError(null);
    setRequestId(null);
    try {
      const created = await adminPost<{ id: string }>(adminEndpoints.products, { name });
      router.push(`/admin/catalog/products/${created.id}`);
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
      const created = await adminPost<{ id: string; slug: string; lifecycle: string; version: number }>(
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

  async function onAvailabilityChange(
    item: ProductListItemDto,
    next: CommercialAvailability,
  ) {
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
      setRows((current) =>
        current.map((row) => (row.id === item.id ? previous : row)),
      );
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

  function toggleSelectAllVisible() {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(rows.map((row) => row.id)));
  }

  function toggleSelectRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function requestBulk(confirm: BulkConfirm) {
    if (selectedRows.length === 0 || bulkRunning) return;
    if (selectedRows.length > BULK_PRODUCTS_MAX_ITEMS) {
      setError(`Можно выбрать не более ${BULK_PRODUCTS_MAX_ITEMS} товаров.`);
      return;
    }
    setBulkConfirm(confirm);
    setBulkSummary(null);
    setBulkProblems([]);
    setShowBulkProblems(false);
  }

  async function runBulk() {
    if (!bulkConfirm || selectedRows.length === 0 || bulkRunning) return;
    const operation: BulkProductOperation = bulkConfirm.kind;
    if (operation === 'SET_AVAILABILITY' && !canUpdate) return;
    if ((operation === 'PUBLISH' || operation === 'UNPUBLISH') && !canPublish) return;

    setBulkRunning(true);
    setError(null);
    setRequestId(null);
    setRetryable(false);
    setAvailabilitySuccessId(null);
    setDuplicateSuccessId(null);
    try {
      const body = buildProductsBulkBody(
        operation,
        selectedRows.map((row) => ({ productId: row.id, expectedVersion: row.version })),
        bulkConfirm.kind === 'SET_AVAILABILITY' ? bulkConfirm.availability : undefined,
      );
      const result = await adminPost<BulkProductOperationResultDto>(
        adminEndpoints.productsBulk,
        body,
      );
      const byId = new Map(result.results.map((row) => [row.productId, row]));
      setRows((current) =>
        current.map((row) => {
          const item = byId.get(row.id);
          if (!item || item.status !== 'SUCCESS') return row;
          return {
            ...row,
            version: item.version ?? row.version,
            availability: item.availability ?? row.availability,
            lifecycle: item.lifecycle ?? row.lifecycle,
          };
        }),
      );
      const problems = result.results
        .filter((row) => row.status !== 'SUCCESS')
        .map((row) => {
          const product = selectedRows.find((item) => item.id === row.productId);
          return {
            name: product?.name ?? row.productId,
            message: row.message ?? 'Не удалось обновить',
          };
        });
      setBulkProblems(problems);
      if (result.failed === 0) {
        setBulkSummary(`✓ ${result.succeeded} выполнено`);
        setSelectedIds(new Set());
      } else if (result.succeeded === 0) {
        setBulkSummary(`⚠ Не удалось обновить товары (${result.failed})`);
        setShowBulkProblems(true);
      } else {
        setBulkSummary(
          `✓ ${result.succeeded} выполнено · ⚠ ${result.failed} не выполнено`,
        );
        setShowBulkProblems(true);
        setSelectedIds(
          new Set(
            result.results
              .filter((row) => row.status !== 'SUCCESS')
              .map((row) => row.productId),
          ),
        );
      }
      setBulkConfirm(null);
    } catch (err) {
      setError(errorMessage(err, 'Не удалось выполнить массовое действие'));
      setRequestId(err instanceof AdminRequestError ? err.requestId ?? null : null);
      setRetryable(err instanceof AdminRequestError ? err.retryable : false);
    } finally {
      setBulkRunning(false);
    }
  }

  const pages = Math.max(1, Math.ceil(data.total / Math.max(1, data.pageSize)));
  const hasFilters =
    filters.search.length > 0 ||
    filters.lifecycle.length > 0 ||
    filters.availability.length > 0 ||
    filters.promotionalOnly === 'true' ||
    filters.bestsellerGroupIds.length > 0;

  return (
    <div className={`space-y-5 ${navigating ? 'opacity-70' : ''}`}>
      {error ? (
        <div role="alert" className="admin-error">
          <p>{error}</p>
          {requestId ? (
            <details>
              <summary>Технические детали</summary>
              Код запроса: {requestId}
            </details>
          ) : null}
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
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
        >
          Доступность изменена
        </p>
      ) : null}

      {bulkSummary ? (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
        >
          <p>{bulkSummary}</p>
          {bulkProblems.length > 0 ? (
            <div className="mt-2">
              <button
                type="button"
                className="admin-link text-sm"
                onClick={() => setShowBulkProblems((open) => !open)}
              >
                {showBulkProblems ? 'Скрыть проблемы' : 'Посмотреть проблемы'}
              </button>
              {showBulkProblems ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--admin-ink)]">
                  {bulkProblems.map((problem) => (
                    <li key={`${problem.name}-${problem.message}`}>
                      «{problem.name}» — {problem.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {canBulk && selectedIds.size > 0 ? (
        <div className="admin-bulkbar">
          <span className="text-sm font-medium text-[var(--admin-ink)]">
            Выбрано: {selectedIds.size}
            <span className="ml-1 font-normal text-[var(--admin-muted)]">
              (на этой странице)
            </span>
          </span>
          {bulkRunning ? (
            <span className="text-sm text-[var(--admin-muted)]">
              Обновление {selectedIds.size} товаров…
            </span>
          ) : (
            <>
              {canPublish ? (
                <>
                  <Button
                    type="button"
                    className="!rounded-lg !bg-[var(--admin-brand)]"
                    disabled={bulkRunning}
                    onClick={() => requestBulk({ kind: 'PUBLISH' })}
                  >
                    Опубликовать
                  </Button>
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    disabled={bulkRunning}
                    onClick={() => requestBulk({ kind: 'UNPUBLISH' })}
                  >
                    Снять с публикации
                  </button>
                </>
              ) : null}
              {canUpdate ? (
                <label className="admin-field mb-0">
                  <span className="sr-only">Изменить доступность</span>
                  <select
                    className="admin-select text-sm"
                    defaultValue=""
                    disabled={bulkRunning}
                    onChange={(event) => {
                      const value = event.target.value as CommercialAvailability | '';
                      if (!value) return;
                      requestBulk({ kind: 'SET_AVAILABILITY', availability: value });
                      event.currentTarget.value = '';
                    }}
                  >
                    <option value="" disabled>
                      Изменить наличие
                    </option>
                    {COMMERCIAL_AVAILABILITIES.map((value) => (
                      <option key={value} value={value}>
                        {availabilityLabel(value)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button
                type="button"
                className="admin-btn-ghost"
                disabled={bulkRunning}
                onClick={() => setSelectedIds(new Set())}
              >
                Снять выбор
              </button>
            </>
          )}
        </div>
      ) : null}

      {bulkConfirm ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-confirm-title"
          className="admin-panel space-y-3 border border-[var(--admin-brand)]/30 p-4"
        >
          <h2 id="bulk-confirm-title" className="text-base font-semibold text-[var(--admin-ink)]">
            {bulkConfirm.kind === 'PUBLISH'
              ? `Опубликовать ${selectedIds.size} товаров?`
              : bulkConfirm.kind === 'UNPUBLISH'
                ? `Снять с публикации ${selectedIds.size} товаров?`
                : `Изменить доступность у ${selectedIds.size} товаров?`}
          </h2>
          <p className="text-sm text-[var(--admin-muted)]">
            {bulkConfirm.kind === 'PUBLISH'
              ? 'Будут применены текущие правила публикации каждого товара. Товары, которые не проходят проверку, не будут опубликованы.'
              : bulkConfirm.kind === 'UNPUBLISH'
                ? 'Товары вернутся в черновик. Архивация не выполняется.'
                : bulkConfirm.kind === 'SET_AVAILABILITY'
                  ? `Новое наличие: ${availabilityLabel(bulkConfirm.availability)}.`
                  : null}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={bulkRunning}
              onClick={() => void runBulk()}
              className="!rounded-lg !bg-[var(--admin-brand)]"
            >
              {bulkRunning ? 'Обновление…' : 'Подтвердить'}
            </Button>
            <button
              type="button"
              className="admin-btn-ghost"
              disabled={bulkRunning}
              onClick={() => setBulkConfirm(null)}
            >
              Отмена
            </button>
          </div>
        </div>
      ) : null}

      {duplicateSuccessId ? (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Товар создан как черновик.{' '}
          <Link href={`/admin/catalog/products/${duplicateSuccessId}`} className="font-semibold underline">
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
            Будет создан новый черновик на основе «{duplicateTarget.name}». Акции и группы
            бестселлеров не будут перенесены.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={duplicating}
              onClick={() => void onConfirmDuplicate()}
              className="!rounded-lg !bg-[var(--admin-brand)]"
            >
              {duplicating ? 'Дублирование…' : 'Дублировать'}
            </Button>
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

      {canCreate ? (
        <form onSubmit={onCreate} className="admin-toolbar">
          <label className="admin-field">
            <span>Новый букет</span>
            <input
              name="name"
              required
              className="admin-input w-64"
              placeholder="Название, например «Амели»"
            />
          </label>
          <Button
            type="submit"
            disabled={creating}
            className="!rounded-lg !bg-[var(--admin-brand)]"
          >
            {creating ? 'Создаём…' : 'Создать черновик'}
          </Button>
          <p className="admin-toolbar__hint">
            Адрес в ссылке и цену заполните в карточке товара.
          </p>
        </form>
      ) : null}

      <div className="admin-toolbar">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setFilter('search', String(form.get('search') ?? '').trim());
          }}
        >
          <label className="admin-field">
            <span>Поиск</span>
            <input
              name="search"
              defaultValue={filters.search}
              className="admin-input w-56"
              placeholder="Название или адрес"
            />
          </label>
          <button type="submit" className="admin-btn-ghost">
            Найти
          </button>
        </form>

        <label className="admin-field">
          <span>Публикация</span>
          <select
            className="admin-select"
            value={filters.lifecycle}
            onChange={(event) => setFilter('lifecycle', event.target.value)}
          >
            <option value="">Любая</option>
            {PRODUCT_LIFECYCLES.map((value) => (
              <option key={value} value={value}>
                {lifecycleLabel(value)}
              </option>
            ))}
          </select>
        </label>

        <label className="admin-field">
          <span>Наличие</span>
          <select
            className="admin-select"
            value={filters.availability}
            onChange={(event) => setFilter('availability', event.target.value)}
          >
            <option value="">Любое</option>
            {COMMERCIAL_AVAILABILITIES.map((value) => (
              <option key={value} value={value}>
                {availabilityLabel(value)}
              </option>
            ))}
          </select>
        </label>

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
            <span>Бестселлеры</span>
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
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        {hasFilters ? (
          <Link href="/admin/catalog/products" className="admin-btn-ghost">
            Сбросить
          </Link>
        ) : null}
      </div>

      <div className="admin-panel overflow-x-auto">
        <table className="admin-table min-w-[900px]">
          <thead>
            <tr>
              {canBulk ? (
                <th className="w-10">
                  <label className="inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      disabled={rows.length === 0 || bulkRunning}
                      onChange={toggleSelectAllVisible}
                      aria-label="Выбрать все на этой странице"
                    />
                    <span className="sr-only">Все на странице</span>
                  </label>
                </th>
              ) : null}
              <th className="w-16">Фото</th>
              <th>Товар</th>
              <th className="w-36">Цена</th>
              <th className="w-32">Публикация</th>
              <th className="w-44">Наличие</th>
              <th className="w-36">Акция</th>
              <th className="w-40">Бестселлеры</th>
              <th className="w-40">Изменён</th>
              {canCreate ? <th className="w-28">Действия</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={(canCreate ? 9 : 8) + (canBulk ? 1 : 0)}>
                  {hasFilters ? (
                    <div className="admin-empty admin-empty--action">
                      <p>Ничего не найдено по текущим фильтрам.</p>
                      <p className="text-sm text-[var(--admin-muted)]">
                        Измените поиск или сбросьте фильтры, чтобы увидеть все товары.
                      </p>
                      <Link href="/admin/catalog/products" className="admin-btn-ghost">
                        Сбросить фильтры
                      </Link>
                    </div>
                  ) : (
                    <div className="admin-empty admin-empty--action">
                      <p>Товаров пока нет.</p>
                      <p className="text-sm text-[var(--admin-muted)]">
                        Создайте первый товар, чтобы он появился в каталоге.
                      </p>
                      {canCreate ? (
                        <p className="text-sm text-[var(--admin-muted)]">
                          Введите название в поле «Новый букет» выше и нажмите «Создать черновик».
                        </p>
                      ) : null}
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              rows.map((item) => {
                const groups = (item.bestsellerGroupIds ?? [])
                  .map((id) => groupNames.get(id) ?? null)
                  .filter((name): name is string => Boolean(name));
                const savingAvailability = savingAvailabilityId === item.id;
                return (
                  <tr key={item.id}>
                    {canBulk ? (
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          disabled={bulkRunning}
                          onChange={() => toggleSelectRow(item.id)}
                          aria-label={`Выбрать ${item.name}`}
                        />
                      </td>
                    ) : null}
                    <td>
                      {item.primaryImageUrl ? (
                        <img
                          src={toSameOriginMediaUrl(item.primaryImageUrl) ?? item.primaryImageUrl}
                          alt=""
                          className="h-12 w-12 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="admin-thumb-empty" title="Нет фото" />
                      )}
                    </td>
                    <td>
                      <Link
                        href={`/admin/catalog/products/${item.id}`}
                        className="font-semibold text-[var(--admin-ink)] underline-offset-2 hover:text-[var(--admin-brand)] hover:underline"
                      >
                        {item.name}
                      </Link>
                      <p className="text-xs text-[var(--admin-muted)]">
                        /{item.slug}
                        {item.bouquetSize ? ` · ${item.bouquetSize.name}` : ''}
                      </p>
                    </td>
                    <td className="tabular-nums">
                      {item.promotion ? (
                        <span className="admin-price-stack">
                          <span className="admin-price-sale">{item.promotion.salePrice.label}</span>
                          <span className="admin-price-old">
                            {item.promotion.originalPrice.label}
                          </span>
                        </span>
                      ) : (
                        (item.price?.label ?? '—')
                      )}
                    </td>
                    <td>
                      <span className={lifecycleChipClass(item.lifecycle)}>
                        {lifecycleLabel(item.lifecycle)}
                      </span>
                    </td>
                    <td>
                      {canUpdate ? (
                        <label className="block min-w-[9.5rem]">
                          <span className="sr-only">Наличие: {item.name}</span>
                          <select
                            className={`admin-select w-full max-w-[11rem] text-sm ${
                              item.availability === 'AVAILABLE' ? '' : 'border-amber-300'
                            }`}
                            value={item.availability}
                            disabled={
                              savingAvailability ||
                              Boolean(savingAvailabilityId) ||
                              bulkRunning
                            }
                            aria-busy={savingAvailability}
                            onChange={(event) => {
                              void onAvailabilityChange(
                                item,
                                event.target.value as CommercialAvailability,
                              );
                            }}
                          >
                            {COMMERCIAL_AVAILABILITIES.map((value) => (
                              <option key={value} value={value}>
                                {availabilityLabel(value)}
                              </option>
                            ))}
                          </select>
                          {savingAvailability ? (
                            <span className="mt-1 block text-xs text-[var(--admin-muted)]">
                              Сохранение…
                            </span>
                          ) : null}
                        </label>
                      ) : (
                        <span className={availabilityChipClass(item.availability)}>
                          {availabilityLabel(item.availability)}
                        </span>
                      )}
                    </td>
                    <td>
                      {item.promotion ? (
                        <span className="admin-chip admin-chip--sale">
                          {item.promotion.percentOff ? `−${item.promotion.percentOff}%` : 'Акция'}
                        </span>
                      ) : (
                        <span className="text-[var(--admin-muted)]">—</span>
                      )}
                    </td>
                    <td>
                      {groups.length > 0 ? (
                        <span className="text-sm text-[var(--admin-ink)]">
                          {groups.join(', ')}
                        </span>
                      ) : (item.bestsellerGroupIds?.length ?? 0) > 0 ? (
                        <span className="admin-chip admin-chip--muted">В подборках</span>
                      ) : (
                        <span className="text-[var(--admin-muted)]">—</span>
                      )}
                    </td>
                    <td className="text-[var(--admin-muted)]">
                      {formatAdminDateTime(item.updatedAt)}
                    </td>
                    {canCreate ? (
                      <td>
                        <button
                          type="button"
                          className="admin-link text-sm"
                          disabled={duplicating}
                          onClick={() => {
                            setDuplicateSuccessId(null);
                            setDuplicateTarget(item);
                          }}
                        >
                          Дублировать
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {data.total > 0 || pages > 1 ? (
        <div className="flex items-center gap-3 text-sm text-[var(--admin-muted)]">
          <span>
            {pages > 1
              ? `Стр. ${data.page} из ${pages} · всего ${data.total}`
              : `Всего ${data.total}`}
          </span>
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
      ) : null}
    </div>
  );
}

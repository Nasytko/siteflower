'use client';

import { FormEvent, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  COMMERCIAL_AVAILABILITIES,
  PRODUCT_LIFECYCLES,
  type PaginatedResponse,
  type ProductListItemDto,
} from '@bouquet-one/contracts';
import { Button } from '@bouquet-one/ui';
import { adminPost, AdminRequestError, errorMessage } from '@/lib/admin-client';
import { adminEndpoints } from '@/lib/admin-endpoints';
import { availabilityLabel, formatAdminDateTime, lifecycleLabel } from '@/lib/admin-labels';
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
};

const SORTS: Array<[string, string]> = [
  ['', 'Сначала изменённые'],
  ['recommended', 'Порядок витрины'],
  ['price_asc', 'Цена: по возрастанию'],
  ['price_desc', 'Цена: по убыванию'],
  ['newest', 'Сначала новые'],
];

export function ProductsManager({ data, filters, bestsellerGroups, canCreate }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [navigating, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [duplicateTarget, setDuplicateTarget] = useState<ProductListItemDto | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [duplicateSuccessId, setDuplicateSuccessId] = useState<string | null>(null);

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
    } finally {
      setDuplicating(false);
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
        <p role="alert" className="admin-error">
          {error}
          {requestId ? (
            <span className="mt-1 block text-xs opacity-80">Код запроса: {requestId}</span>
          ) : null}
        </p>
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
              <th className="w-16">Фото</th>
              <th>Товар</th>
              <th className="w-36">Цена</th>
              <th className="w-32">Публикация</th>
              <th className="w-32">Наличие</th>
              <th className="w-36">Акция</th>
              <th className="w-40">Бестселлеры</th>
              <th className="w-40">Изменён</th>
              {canCreate ? <th className="w-28">Действия</th> : null}
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 ? (
              <tr>
                <td colSpan={canCreate ? 9 : 8}>
                  <p className="admin-empty">
                    {hasFilters ? 'Ничего не найдено — измените фильтры' : 'Товаров пока нет'}
                  </p>
                </td>
              </tr>
            ) : (
              data.items.map((item) => {
                const groups = (item.bestsellerGroupIds ?? [])
                  .map((id) => groupNames.get(id) ?? null)
                  .filter((name): name is string => Boolean(name));
                return (
                  <tr key={item.id}>
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
                      <span
                        className={`admin-chip ${
                          item.lifecycle === 'PUBLISHED' ? '' : 'admin-chip--muted'
                        }`}
                      >
                        {lifecycleLabel(item.lifecycle)}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`admin-chip ${
                          item.availability === 'AVAILABLE' ? '' : 'admin-chip--warn'
                        }`}
                      >
                        {availabilityLabel(item.availability)}
                      </span>
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

      {pages > 1 ? (
        <div className="flex items-center gap-3 text-sm text-[var(--admin-muted)]">
          <span>
            Стр. {data.page} из {pages} · всего {data.total}
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

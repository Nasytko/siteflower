'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type {
  AdminPromotionListItemDto,
  PaginatedResponse,
  ProductAdminDto,
  ProductListItemDto,
} from '@bouquet-one/contracts';
import { adminDelete, adminGet, adminPut, errorMessage } from '@/lib/admin-client';
import { buildProductPromotionBody } from '@/lib/admin-catalog-contract';
import { adminEndpoints, withQuery } from '@/lib/admin-endpoints';
import { unwrapAdminList } from '@/lib/admin-list';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '@/lib/admin-labels';
import { majorInputToMinor, minorToMajorInput } from '@/lib/admin-money';
import { toSameOriginMediaUrl } from '@/lib/media';
import {
  promotionDiscountLabel,
  promotionPeriodLabel,
  promotionRegularPriceLabel,
  promotionSalePriceLabel,
  promotionStatusView,
  promotionTypeForRow,
} from '@/lib/admin-promotions';

type VariantSaleDraft = {
  variantId: string;
  name: string;
  regularMinor: string;
  saleMajor: string;
};

type Draft = {
  productId: string;
  productName: string;
  expectedVersion: number;
  enabled: boolean;
  type: 'PERCENT' | 'FIXED';
  percentOff: string;
  startsAt: string;
  endsAt: string;
  variants: VariantSaleDraft[];
};

type Props = {
  initial: AdminPromotionListItemDto[];
  canUpdate: boolean;
};

function draftFromRow(row: AdminPromotionListItemDto, variants: VariantSaleDraft[] = []): Draft {
  const saleById = new Map(
    (row.promotionAdmin.variantSalePrices ?? []).map((item) => [item.variantId, item.salePriceMinor]),
  );
  return {
    productId: row.id,
    productName: row.name,
    expectedVersion: row.version,
    enabled: row.promotionAdmin.enabled,
    type: row.promotionAdmin.type === 'FIXED' ? 'FIXED' : 'PERCENT',
    percentOff: row.promotionAdmin.percentOff != null ? String(row.promotionAdmin.percentOff) : '',
    startsAt: toDateTimeLocalValue(row.promotionAdmin.startsAt),
    endsAt: toDateTimeLocalValue(row.promotionAdmin.endsAt),
    variants: variants.map((item) => ({
      ...item,
      saleMajor: saleById.has(item.variantId)
        ? minorToMajorInput(saleById.get(item.variantId))
        : item.saleMajor,
    })),
  };
}

async function loadActiveVariants(productId: string): Promise<VariantSaleDraft[]> {
  const product = await adminGet<ProductAdminDto>(adminEndpoints.product(productId));
  return product.variants
    .filter((variant) => variant.status === 'ACTIVE')
    .map((variant) => ({
      variantId: variant.id,
      name: variant.name,
      regularMinor: variant.priceMinor,
      saleMajor: '',
    }));
}

export function PromotionsManager({ initial, canUpdate }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<ProductListItemDto[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const existingIds = useMemo(() => new Set(rows.map((row) => row.id)), [rows]);

  async function reload() {
    const payload = await adminGet<
      PaginatedResponse<AdminPromotionListItemDto> | AdminPromotionListItemDto[]
    >(withQuery(adminEndpoints.promotions, { page: 1, pageSize: 100 }));
    setRows(unwrapAdminList(payload));
  }

  async function run(action: () => Promise<void>, success: string) {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      await reload();
      setNotice(success);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось сохранить акцию'));
    } finally {
      setPending(false);
    }
  }

  async function findProducts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = search.trim();
    if (q.length < 2) {
      setCandidates([]);
      return;
    }
    setError(null);
    try {
      const data = await adminGet<PaginatedResponse<ProductListItemDto>>(
        withQuery(adminEndpoints.products, { search: q, page: 1, pageSize: 8 }),
      );
      setCandidates(data.items ?? []);
    } catch (err) {
      setError(errorMessage(err, 'Не удалось найти товары'));
      setCandidates([]);
    }
  }

  async function startCreate(product: ProductListItemDto) {
    setError(null);
    try {
      const variants = await loadActiveVariants(product.id);
      setDraft({
        productId: product.id,
        productName: product.name,
        expectedVersion: product.version,
        enabled: true,
        type: 'PERCENT',
        percentOff: '10',
        startsAt: '',
        endsAt: '',
        variants,
      });
      setCandidates(null);
      setSearch('');
    } catch (err) {
      setError(errorMessage(err, 'Не удалось открыть товар для акции'));
    }
  }

  async function startEdit(row: AdminPromotionListItemDto) {
    setError(null);
    try {
      const variants = await loadActiveVariants(row.id);
      setDraft(draftFromRow(row, variants));
    } catch (err) {
      setError(errorMessage(err, 'Не удалось открыть акцию'));
    }
  }

  async function saveDraft() {
    if (!draft) return;
    const percent = Number(draft.percentOff);
    if (draft.type === 'PERCENT' && (!Number.isInteger(percent) || percent < 1 || percent > 99)) {
      setError('Скидка должна быть целым числом от 1 до 99');
      return;
    }
    const variantSalePrices =
      draft.type === 'FIXED'
        ? draft.variants.flatMap((item) => {
            const salePriceMinor = majorInputToMinor(item.saleMajor);
            return salePriceMinor ? [{ variantId: item.variantId, salePriceMinor }] : [];
          })
        : undefined;
    if (draft.type === 'FIXED' && draft.enabled && (!variantSalePrices || variantSalePrices.length === 0)) {
      setError('Укажите акционную цену хотя бы для одного размера');
      return;
    }
    await run(async () => {
      await adminPut(
        adminEndpoints.productPromotion(draft.productId),
        buildProductPromotionBody({
          expectedVersion: draft.expectedVersion,
          enabled: draft.enabled,
          type: draft.type,
          percentOff: draft.type === 'PERCENT' ? percent : null,
          startsAt: fromDateTimeLocalValue(draft.startsAt),
          endsAt: fromDateTimeLocalValue(draft.endsAt),
          variantSalePrices,
        }),
      );
      setDraft(null);
    }, `Акция для «${draft.productName}» сохранена`);
  }

  async function removePromotion(row: AdminPromotionListItemDto) {
    if (!window.confirm(`Убрать акцию с «${row.name}»? Цена товара не изменится.`)) return;
    await run(async () => {
      await adminDelete(adminEndpoints.productPromotion(row.id), {
        expectedVersion: row.version,
      });
      if (draft?.productId === row.id) setDraft(null);
    }, `Акция снята с «${row.name}»`);
  }

  return (
    <div className="space-y-5">
      {error ? (
        <p role="alert" className="admin-error">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="admin-notice admin-notice--success">
          {notice}
        </p>
      ) : null}

      {canUpdate ? (
        <div className="admin-panel space-y-3 p-4">
          <h2 className="admin-subsection__title">Новая акция</h2>
          <p className="text-sm text-[var(--admin-muted)]">
            Выберите товар из каталога. Сохранение карточки товара для этого не нужно.
          </p>
          <form onSubmit={findProducts} className="flex flex-wrap items-end gap-2">
            <label className="admin-field">
              <span>Найти товар</span>
              <input
                className="admin-input w-64"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Название"
              />
            </label>
            <button type="submit" className="admin-btn-ghost">
              Найти
            </button>
          </form>
          {candidates === null ? null : candidates.length === 0 ? (
            <p className="admin-empty">Товары не найдены</p>
          ) : (
            <ul className="admin-list">
              {candidates.map((item) => (
                <li key={item.id} className="admin-list__item">
                  <div>
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-xs text-[var(--admin-muted)]">
                      {item.price?.label ?? 'без цены'}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    disabled={pending}
                    onClick={() => void startCreate(item)}
                  >
                    {existingIds.has(item.id) ? 'Изменить акцию' : 'Добавить скидку'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {draft ? (
        <div className="admin-panel space-y-3 p-4">
          <h2 className="text-base font-semibold">
            {existingIds.has(draft.productId) ? 'Изменить акцию' : 'Условия акции'}
          </h2>
          <p className="text-sm text-[var(--admin-muted)]">{draft.productName}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="admin-field">
              <span>Тип скидки</span>
              <select
                className="admin-select"
                value={draft.type}
                disabled={!canUpdate || pending}
                onChange={(event) =>
                  setDraft((prev) =>
                    prev
                      ? { ...prev, type: event.target.value === 'FIXED' ? 'FIXED' : 'PERCENT' }
                      : prev,
                  )
                }
              >
                <option value="PERCENT">Процент</option>
                <option value="FIXED">Фиксированная цена</option>
              </select>
            </label>
            {draft.type === 'PERCENT' ? (
              <label className="admin-field">
                <span>Скидка, %</span>
                <input
                  className="admin-input tabular-nums"
                  inputMode="numeric"
                  value={draft.percentOff}
                  disabled={!canUpdate || pending}
                  onChange={(event) =>
                    setDraft((prev) => (prev ? { ...prev, percentOff: event.target.value } : prev))
                  }
                />
              </label>
            ) : null}
            <label className="admin-field">
              <span>Начало</span>
              <input
                type="datetime-local"
                className="admin-input"
                value={draft.startsAt}
                disabled={!canUpdate || pending}
                onChange={(event) =>
                  setDraft((prev) => (prev ? { ...prev, startsAt: event.target.value } : prev))
                }
              />
            </label>
            <label className="admin-field">
              <span>Окончание</span>
              <input
                type="datetime-local"
                className="admin-input"
                value={draft.endsAt}
                disabled={!canUpdate || pending}
                onChange={(event) =>
                  setDraft((prev) => (prev ? { ...prev, endsAt: event.target.value } : prev))
                }
              />
            </label>
            <label className="admin-check mt-6">
              <input
                type="checkbox"
                checked={draft.enabled}
                disabled={!canUpdate || pending}
                onChange={(event) =>
                  setDraft((prev) => (prev ? { ...prev, enabled: event.target.checked } : prev))
                }
              />
              Акция включена
            </label>
          </div>
          {draft.type === 'FIXED' ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Акционная цена, BYN</p>
              {draft.variants.length === 0 ? (
                <p className="admin-help">У товара нет активного размера с ценой.</p>
              ) : (
                draft.variants.map((variant) => (
                  <label key={variant.variantId} className="admin-field max-w-xs">
                    <span>
                      {variant.name} · обычная {minorToMajorInput(variant.regularMinor)}
                    </span>
                    <input
                      className="admin-input tabular-nums"
                      inputMode="decimal"
                      value={variant.saleMajor}
                      disabled={!canUpdate || pending}
                      placeholder="ниже обычной"
                      onChange={(event) => {
                        const value = event.target.value;
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                variants: prev.variants.map((item) =>
                                  item.variantId === variant.variantId
                                    ? { ...item, saleMajor: value }
                                    : item,
                                ),
                              }
                            : prev,
                        );
                      }}
                    />
                  </label>
                ))
              )}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="admin-btn"
              disabled={!canUpdate || pending}
              onClick={() => void saveDraft()}
            >
              {pending ? 'Сохранение…' : 'Сохранить акцию'}
            </button>
            <button
              type="button"
              className="admin-btn-ghost"
              disabled={pending}
              onClick={() => setDraft(null)}
            >
              Отмена
            </button>
          </div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="admin-panel">
          <div className="admin-empty admin-empty--action items-center text-center">
            <p>Акций пока нет.</p>
            <p className="text-sm text-[var(--admin-muted)]">
              Найдите товар выше и задайте скидку со сроками.
            </p>
          </div>
        </div>
      ) : (
        <div className="admin-panel admin-table-wrap admin-table-wrap--cards">
          <table className="admin-table admin-table--compact">
            <thead>
              <tr>
                <th className="w-16">Фото</th>
                <th>Товар</th>
                <th className="w-36">Обычная цена</th>
                <th className="w-36">Цена по акции</th>
                <th className="w-28">Скидка</th>
                <th className="w-64">Период</th>
                <th className="w-36">Состояние</th>
                {canUpdate ? <th className="w-40">Действия</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const status = promotionStatusView(row);
                const discount = promotionDiscountLabel(row);
                return (
                  <tr key={row.id}>
                    <td data-hide-mobile>
                      {row.primaryImageUrl ? (
                        <img
                          src={toSameOriginMediaUrl(row.primaryImageUrl) ?? row.primaryImageUrl}
                          alt=""
                          className="h-12 w-12 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="admin-thumb-empty" />
                      )}
                    </td>
                    <td data-primary>
                      <Link
                        href={`/admin/catalog/products/${row.id}`}
                        className="font-semibold text-[var(--admin-ink)] underline-offset-2 hover:text-[var(--admin-brand)] hover:underline"
                      >
                        {row.name}
                      </Link>
                      <p className="text-xs text-[var(--admin-muted)]">{promotionTypeForRow(row)}</p>
                    </td>
                    <td data-label="Обычная" className="tabular-nums admin-price-old">
                      {promotionRegularPriceLabel(row)}
                    </td>
                    <td data-label="По акции" className="tabular-nums">
                      <span className="admin-price-sale">{promotionSalePriceLabel(row)}</span>
                    </td>
                    <td data-label="Скидка">
                      {discount ? (
                        <span className="admin-chip admin-chip--sale">{discount}</span>
                      ) : (
                        <span className="text-[var(--admin-muted)]">—</span>
                      )}
                    </td>
                    <td data-label="Период" className="text-[var(--admin-muted)]">
                      {promotionPeriodLabel(row)}
                    </td>
                    <td data-label="Статус">
                      <span
                        className={`admin-chip ${
                          status.tone === 'active'
                            ? 'admin-chip--sale'
                            : status.tone === 'off'
                              ? 'admin-chip--muted'
                              : ''
                        }`}
                      >
                        {status.label}
                      </span>
                    </td>
                    {canUpdate ? (
                      <td data-label="Действия">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="admin-link text-sm"
                            disabled={pending}
                            onClick={() => void startEdit(row)}
                          >
                            Изменить
                          </button>
                          <button
                            type="button"
                            className="admin-link text-sm"
                            disabled={pending}
                            onClick={() => void removePromotion(row)}
                          >
                            Снять
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

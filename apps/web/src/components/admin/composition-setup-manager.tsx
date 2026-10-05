'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FlowerItemAdminDto, PaginatedResponse, ProductListItemDto } from '@bouquet-one/contracts';
import {
  adminPost,
  AdminRequestError,
  errorMessage,
} from '@/lib/admin-client';
import { adminEndpoints } from '@/lib/admin-endpoints';
import { FormSaveStatus, phaseFromAdminError, type FormSavePhase } from '@/components/admin/form-status';

type RowState = {
  flowerItemId: string;
  quantity: string;
  clearLegacy: boolean;
};

type Props = {
  initial: PaginatedResponse<ProductListItemDto>;
  flowerItems: FlowerItemAdminDto[];
  canUpdate: boolean;
};

function legacyLabel(product: ProductListItemDto): string {
  const parts = [
    product.flowerType?.name,
    product.flowerVariety?.name,
    product.flowerOrigin?.name,
    product.heightCm != null ? `${product.heightCm} см` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : '—';
}

export function CompositionSetupManager({ initial, flowerItems, canUpdate }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initial.items);
  const [drafts, setDrafts] = useState<Record<string, RowState>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [phase, setPhase] = useState<FormSavePhase>('idle');
  const [notice, setNotice] = useState<string | null>(null);

  const visibleItems = flowerItems.filter((item) => item.visibility === 'VISIBLE');

  function draftFor(product: ProductListItemDto): RowState {
    return (
      drafts[product.id] ?? {
        flowerItemId: '',
        quantity: '1',
        clearLegacy: true,
      }
    );
  }

  function setDraft(productId: string, patch: Partial<RowState>) {
    setDrafts((prev) => {
      const base = prev[productId] ?? { flowerItemId: '', quantity: '1', clearLegacy: true };
      return { ...prev, [productId]: { ...base, ...patch } };
    });
  }

  async function save(product: ProductListItemDto) {
    if (!canUpdate) return;
    const draft = draftFor(product);
    if (!draft.flowerItemId) {
      setError('Выберите цветок из справочника');
      setPhase('server');
      return;
    }
    const quantity = Number(draft.quantity);
    if (!Number.isFinite(quantity) || quantity < 1) {
      setError('Укажите количество');
      setPhase('server');
      return;
    }

    setPendingId(product.id);
    setError(null);
    setRequestId(null);
    setNotice(null);
    setPhase('saving');
    try {
      await adminPost(adminEndpoints.productCompositionSetup(product.id), {
        expectedVersion: product.version,
        flowerItemId: draft.flowerItemId,
        quantity,
        unit: 'STEM',
        clearLegacyFlowerAttrs: draft.clearLegacy,
      });
      setItems((prev) => prev.filter((row) => row.id !== product.id));
      setNotice(`Состав для «${product.name}» сохранён`);
      setPhase('saved');
      router.refresh();
    } catch (err) {
      setPhase(err instanceof AdminRequestError ? phaseFromAdminError(err) : 'server');
      setRequestId(err instanceof AdminRequestError ? err.requestId ?? null : null);
      setError(errorMessage(err));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <FormSaveStatus
        phase={phase}
        savedLabel={notice}
        errorMessage={error}
        requestId={requestId}
        onDismiss={() => {
          setError(null);
          setPhase(notice ? 'saved' : 'idle');
        }}
      />

      <p className="text-sm text-[var(--admin-muted)]">
        Товары со старыми полями цветка на карточке, у которых ещё нет состава. Высоту и происхождение
        не угадываем — выберите готовую позицию из «Цветы».
      </p>

      {items.length === 0 ? (
        <div className="admin-panel space-y-2 p-4">
          <p className="font-medium">Все товары настроены</p>
          <p className="text-sm text-[var(--admin-muted)]">
            Очередь миграции пуста. Можно продолжать работу в «Товары» и «Цветы».
          </p>
        </div>
      ) : (
        <div className="admin-panel overflow-x-auto">
          <table className="admin-table min-w-[880px]">
            <thead>
              <tr>
                <th>Товар</th>
                <th>Сейчас (legacy)</th>
                <th>Новый состав</th>
                <th className="w-40">Статус</th>
              </tr>
            </thead>
            <tbody>
              {items.map((product) => {
                const draft = draftFor(product);
                return (
                  <tr key={product.id}>
                    <td>
                      <Link
                        href={`/admin/catalog/products/${product.id}`}
                        className="font-medium text-[var(--admin-brand)] underline-offset-2 hover:underline"
                      >
                        {product.name}
                      </Link>
                      <div className="text-xs text-[var(--admin-muted)]">/{product.slug}</div>
                    </td>
                    <td className="text-sm">{legacyLabel(product)}</td>
                    <td>
                      {canUpdate ? (
                        <div className="flex flex-col gap-2">
                          <select
                            className="admin-select"
                            value={draft.flowerItemId}
                            onChange={(event) =>
                              setDraft(product.id, { flowerItemId: event.target.value })
                            }
                          >
                            <option value="">Выбрать цветок</option>
                            {visibleItems.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              className="admin-input w-20 tabular-nums"
                              type="number"
                              min={1}
                              value={draft.quantity}
                              onChange={(event) =>
                                setDraft(product.id, { quantity: event.target.value })
                              }
                            />
                            <span className="text-sm text-[var(--admin-muted)]">веток</span>
                            <label className="flex items-center gap-1 text-xs text-[var(--admin-muted)]">
                              <input
                                type="checkbox"
                                checked={draft.clearLegacy}
                                onChange={(event) =>
                                  setDraft(product.id, { clearLegacy: event.target.checked })
                                }
                              />
                              Очистить legacy вид/сорт/происхождение
                            </label>
                          </div>
                          <button
                            type="button"
                            className="admin-btn self-start"
                            disabled={pendingId === product.id}
                            onClick={() => void save(product)}
                          >
                            Сохранить состав
                          </button>
                        </div>
                      ) : (
                        <span className="text-sm text-[var(--admin-muted)]">Нет права на изменение</span>
                      )}
                    </td>
                    <td>
                      <span className="admin-chip">Требует настройки</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {initial.total > items.length && items.length > 0 ? (
        <p className="text-xs text-[var(--admin-muted)]">
          Показано {items.length} из {initial.total}. Обновите страницу после сохранения, чтобы
          подгрузить следующую порцию.
        </p>
      ) : null}
    </div>
  );
}

'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FlowerItemAdminDto, PaginatedResponse, ProductListItemDto } from '@bouquet-one/contracts';
import {
  adminGet,
  adminPost,
  AdminRequestError,
  errorMessage,
} from '@/lib/admin-client';
import { adminEndpoints, withQuery } from '@/lib/admin-endpoints';
import { FormSaveStatus, phaseFromAdminError, type FormSavePhase } from '@/components/admin/form-status';

type RowState = {
  flowerItemId: string;
  flowerItemName: string;
  quantity: string;
  clearLegacy: boolean;
  search: string;
  hits: FlowerItemAdminDto[];
  searching: boolean;
};

type Props = {
  initial: PaginatedResponse<ProductListItemDto>;
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

function suggestedSearch(product: ProductListItemDto): string {
  return [product.flowerVariety?.name, product.flowerType?.name, product.flowerOrigin?.name]
    .filter(Boolean)
    .join(' ')
    .trim();
}

function emptyDraft(product: ProductListItemDto): RowState {
  return {
    flowerItemId: '',
    flowerItemName: '',
    quantity: '1',
    clearLegacy: true,
    search: suggestedSearch(product),
    hits: [],
    searching: false,
  };
}

export function CompositionSetupManager({ initial, canUpdate }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initial.items);
  const [drafts, setDrafts] = useState<Record<string, RowState>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [phase, setPhase] = useState<FormSavePhase>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const searchTimers = useRef<Record<string, number>>({});

  function draftFor(product: ProductListItemDto): RowState {
    return drafts[product.id] ?? emptyDraft(product);
  }

  function setDraft(productId: string, patch: Partial<RowState>) {
    setDrafts((prev) => {
      const product = items.find((row) => row.id === productId);
      const base = prev[productId] ?? (product ? emptyDraft(product) : emptyDraft({
        id: productId,
        flowerType: null,
        flowerVariety: null,
        flowerOrigin: null,
        heightCm: null,
      } as ProductListItemDto));
      return { ...prev, [productId]: { ...base, ...patch } };
    });
  }

  const runSearch = useCallback((productId: string, q: string) => {
    const existing = searchTimers.current[productId];
    if (existing) window.clearTimeout(existing);
    searchTimers.current[productId] = window.setTimeout(() => {
      setDraft(productId, { searching: true });
      void adminGet<PaginatedResponse<FlowerItemAdminDto>>(
        withQuery(adminEndpoints.flowerItems, {
          q: q.trim() || undefined,
          page: 1,
          pageSize: 20,
        }),
      )
        .then((page) => {
          setDraft(productId, {
            hits: page.items.filter((item) => item.visibility === 'VISIBLE'),
            searching: false,
          });
        })
        .catch(() => setDraft(productId, { hits: [], searching: false }));
    }, 280);
  }, [items]);

  function ensureSearch(product: ProductListItemDto) {
    const draft = draftFor(product);
    if (draft.hits.length > 0 || draft.searching || draft.flowerItemId) return;
    runSearch(product.id, draft.search);
  }

  async function save(product: ProductListItemDto) {
    if (!canUpdate) return;
    const draft = draftFor(product);
    if (!draft.flowerItemId) {
      setError('Выберите цветок из справочника (поиск server-side)');
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
        Статус очереди: <strong>LEGACY</strong> — есть старые поля / flowerId, нет FlowerItem в
        составе. Поиск цветка — server-side pagination (без скрытого лимита 100). Состав не
        угадывается автоматически.
      </p>

      {items.length === 0 ? (
        <div className="admin-panel space-y-2 p-4">
          <p className="font-medium">Все товары настроены (READY)</p>
          <p className="text-sm text-[var(--admin-muted)]">
            Очередь миграции пуста. Можно продолжать работу в «Товары» и «Цветы».
          </p>
        </div>
      ) : (
        <div className="admin-panel overflow-x-auto">
          <table className="admin-table min-w-[960px]">
            <thead>
              <tr>
                <th>Товар</th>
                <th>Сейчас (legacy)</th>
                <th>Новый состав</th>
                <th className="w-36">Статус</th>
              </tr>
            </thead>
            <tbody>
              {items.map((product) => {
                const draft = draftFor(product);
                return (
                  <tr
                    key={product.id}
                    onFocusCapture={() => ensureSearch(product)}
                    onMouseEnter={() => ensureSearch(product)}
                  >
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
                          {draft.flowerItemId ? (
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              <strong>{draft.flowerItemName}</strong>
                              <button
                                type="button"
                                className="admin-btn-ghost text-xs"
                                onClick={() =>
                                  setDraft(product.id, {
                                    flowerItemId: '',
                                    flowerItemName: '',
                                  })
                                }
                              >
                                Сменить
                              </button>
                            </div>
                          ) : (
                            <>
                              <input
                                className="admin-input"
                                value={draft.search}
                                placeholder="Поиск: вид, сорт, происхождение, высота…"
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setDraft(product.id, { search: value });
                                  runSearch(product.id, value);
                                }}
                                onFocus={() => ensureSearch(product)}
                              />
                              <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
                                {draft.searching ? (
                                  <li className="text-[var(--admin-muted)]">Поиск…</li>
                                ) : draft.hits.length === 0 ? (
                                  <li className="text-[var(--admin-muted)]">
                                    Ничего не найдено.{' '}
                                    <a
                                      href="/admin/catalog/flower-structure"
                                      className="underline underline-offset-2"
                                    >
                                      Создать цветок
                                    </a>
                                  </li>
                                ) : (
                                  draft.hits.map((item) => (
                                    <li key={item.id}>
                                      <button
                                        type="button"
                                        className="w-full rounded px-2 py-1 text-left hover:bg-[var(--admin-surface-muted,rgba(0,0,0,0.04))]"
                                        onClick={() =>
                                          setDraft(product.id, {
                                            flowerItemId: item.id,
                                            flowerItemName: item.name,
                                          })
                                        }
                                      >
                                        {item.name}
                                      </button>
                                    </li>
                                  ))
                                )}
                              </ul>
                              {draft.hits.length === 1 ? (
                                <p className="text-xs text-[var(--admin-muted)]">
                                  Найден 1 кандидат — выберите явно (автовыбор отключён).
                                </p>
                              ) : draft.hits.length > 1 ? (
                                <p className="text-xs text-[var(--admin-muted)]">
                                  Несколько кандидатов — выберите нужный.
                                </p>
                              ) : null}
                            </>
                          )}
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
                            disabled={pendingId === product.id || !draft.flowerItemId}
                            onClick={() => void save(product)}
                          >
                            Сохранить состав
                          </button>
                        </div>
                      ) : (
                        <span className="text-sm text-[var(--admin-muted)]">
                          Нет права на изменение
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="admin-chip">LEGACY</span>
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
          Показано {items.length} из {initial.total} в очереди (первая страница). Обновите страницу
          после сохранения, чтобы подтянуть следующие.
        </p>
      ) : null}
    </div>
  );
}

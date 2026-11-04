'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, useTransition } from 'react';
import {
  erpSyncStatusLabel,
  paymentMethodLabel,
  paymentStatusLabel,
  telegramNotifyStatusLabel,
  type AdminOrdersSummaryDto,
  type OrderAdminDetailDto,
  type OrderAdminListItemDto,
} from '@bouquet-one/contracts';
import { adminGet, adminPost, errorMessage } from '@/lib/admin-client';
import { adminEndpoints } from '@/lib/admin-endpoints';
import { formatPriceFromMinor } from '@/lib/media';

type Props = {
  items: OrderAdminListItemDto[];
  total: number;
  page: number;
  pageSize: number;
  summary: AdminOrdersSummaryDto;
  canUpdate: boolean;
  filters: {
    date: string;
    status?: string;
    fulfillmentType?: string;
    paymentStatus?: string;
    erpSyncStatus?: string;
    telegramNotifyStatus?: string;
    q?: string;
  };
};

function chipClass(tone: 'ok' | 'warn' | 'err' | 'muted'): string {
  switch (tone) {
    case 'ok':
      return 'admin-chip admin-chip--ok';
    case 'warn':
      return 'admin-chip admin-chip--warn';
    case 'err':
      return 'admin-chip admin-chip--err';
    default:
      return 'admin-chip admin-chip--muted';
  }
}

function erpTone(s: string): 'ok' | 'warn' | 'err' | 'muted' {
  if (s === 'SYNCED') return 'ok';
  if (s === 'FAILED') return 'err';
  if (s === 'RETRYING' || s === 'PENDING') return 'warn';
  return 'muted';
}

function tgTone(s: string): 'ok' | 'warn' | 'err' | 'muted' {
  if (s === 'SENT') return 'ok';
  if (s === 'FAILED') return 'err';
  if (s === 'RETRYING' || s === 'PENDING') return 'warn';
  return 'muted';
}

function payTone(s: string): 'ok' | 'warn' | 'err' | 'muted' {
  if (s === 'PAID' || s === 'NOT_REQUIRED') return 'ok';
  if (s === 'FAILED') return 'err';
  if (s === 'AWAITING_PAYMENT') return 'warn';
  return 'muted';
}

export function OrdersManager({
  items,
  total,
  page,
  pageSize,
  summary,
  canUpdate,
  filters,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(
    typeof searchParams.get('id') === 'string' ? searchParams.get('id') : null,
  );
  const [detail, setDetail] = useState<OrderAdminDetailDto | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [techOpen, setTechOpen] = useState(false);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const data = await adminGet<OrderAdminDetailDto>(adminEndpoints.order(id));
      setDetail(data);
    } catch (err) {
      setDetail(null);
      setDetailError(errorMessage(err, 'Не удалось загрузить заказ'));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  function navigateWith(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    startTransition(() => {
      router.push(`/admin/orders?${params.toString()}`);
    });
  }

  function setFilter(key: string, value: string) {
    navigateWith((params) => {
      if (!value || value === 'all' || value === '') {
        if (key === 'date') params.set('date', 'all');
        else params.delete(key);
      } else {
        params.set(key, value);
      }
      if (key !== 'page') params.delete('page');
    });
  }

  function clearStatusFilters() {
    navigateWith((params) => {
      params.delete('erpSyncStatus');
      params.delete('paymentStatus');
      params.delete('telegramNotifyStatus');
      params.delete('page');
    });
  }

  function selectOrder(id: string) {
    setSelectedId(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set('id', id);
    router.replace(`/admin/orders?${params.toString()}`, { scroll: false });
  }

  async function retryErp() {
    if (!detail || !canUpdate) return;
    setActionPending(true);
    setActionError(null);
    try {
      const next = await adminPost<OrderAdminDetailDto>(
        adminEndpoints.orderRetryErp(detail.id),
        {},
      );
      setDetail(next);
      router.refresh();
    } catch (err) {
      setActionError(errorMessage(err, 'Не удалось повторить ERP'));
    } finally {
      setActionPending(false);
    }
  }

  async function retryTelegram() {
    if (!detail || !canUpdate) return;
    setActionPending(true);
    setActionError(null);
    try {
      const next = await adminPost<OrderAdminDetailDto>(
        adminEndpoints.orderRetryTelegram(detail.id),
        {},
      );
      setDetail(next);
      router.refresh();
    } catch (err) {
      setActionError(errorMessage(err, 'Не удалось повторить Telegram'));
    } finally {
      setActionPending(false);
    }
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const emptyMessage = 'Заказов по выбранным фильтрам нет.';
  const activeErp = filters.erpSyncStatus;
  const activePay = filters.paymentStatus;
  const activeTg = filters.telegramNotifyStatus;

  return (
    <div className={`space-y-5 ${pending ? 'opacity-70' : ''}`}>
      <div className="admin-kpi-grid admin-kpi-grid--orders">
        {(
          [
            {
              label: 'Все',
              value: summary.total,
              active: !activeErp && !activePay && !activeTg,
              onClick: clearStatusFilters,
            },
            {
              label: 'Ожидают ERP',
              value: summary.awaitingErp,
              active: activeErp === 'PENDING',
              onClick: () => setFilter('erpSyncStatus', 'PENDING'),
              emphasize: summary.awaitingErp > 0,
            },
            {
              label: 'Ошибки ERP',
              value: summary.erpErrors,
              active: activeErp === 'FAILED',
              onClick: () => setFilter('erpSyncStatus', 'FAILED'),
              emphasize: summary.erpErrors > 0,
            },
            {
              label: 'Ошибки Telegram',
              value: summary.telegramErrors,
              active: activeTg === 'FAILED',
              onClick: () => setFilter('telegramNotifyStatus', 'FAILED'),
              emphasize: summary.telegramErrors > 0,
            },
            {
              label: 'Ожидают оплаты',
              value: summary.awaitingPayment,
              active: activePay === 'AWAITING_PAYMENT',
              onClick: () => setFilter('paymentStatus', 'AWAITING_PAYMENT'),
              emphasize: summary.awaitingPayment > 0,
            },
          ] as const
        ).map((card) => (
          <button
            key={card.label}
            type="button"
            className={`admin-card admin-card--kpi text-left${
              'emphasize' in card && card.emphasize ? ' admin-card--urgent' : ''
            }${card.active ? ' ring-1 ring-[var(--admin-ink)]' : ''}`}
            onClick={card.onClick}
            aria-pressed={card.active}
          >
            <p className="admin-card__label">{card.label}</p>
            <p className="admin-metric">{card.value}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="admin-seg">
          {(
            [
              ['today', 'Сегодня'],
              ['tomorrow', 'Завтра'],
              ['all', 'Все даты'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`admin-seg__btn ${
                (filters.date || 'today') === value ? 'admin-seg__btn--active' : ''
              }`}
              onClick={() => setFilter('date', value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="admin-toolbar flex flex-wrap gap-3">
        <label className="admin-field">
          <span>Оплата</span>
          <select
            className="admin-select"
            value={filters.paymentStatus ?? ''}
            onChange={(e) => setFilter('paymentStatus', e.target.value)}
          >
            <option value="">Все</option>
            <option value="NOT_REQUIRED">При получении</option>
            <option value="AWAITING_PAYMENT">Ожидает</option>
            <option value="PAID">Оплачен</option>
            <option value="FAILED">Не прошла</option>
          </select>
        </label>
        <label className="admin-field">
          <span>ERP</span>
          <select
            className="admin-select"
            value={filters.erpSyncStatus ?? ''}
            onChange={(e) => setFilter('erpSyncStatus', e.target.value)}
          >
            <option value="">Все</option>
            <option value="PENDING">Ожидает</option>
            <option value="RETRYING">Повтор</option>
            <option value="SYNCED">OK</option>
            <option value="FAILED">Ошибка</option>
            <option value="DISABLED">Отключён</option>
          </select>
        </label>
        <label className="admin-field">
          <span>Telegram</span>
          <select
            className="admin-select"
            value={filters.telegramNotifyStatus ?? ''}
            onChange={(e) => setFilter('telegramNotifyStatus', e.target.value)}
          >
            <option value="">Все</option>
            <option value="PENDING">Ожидает</option>
            <option value="RETRYING">Повтор</option>
            <option value="SENT">Отправлен</option>
            <option value="FAILED">Ошибка</option>
            <option value="SKIPPED">Пропущен</option>
            <option value="DISABLED">Отключён</option>
          </select>
        </label>
        <label className="admin-field min-w-[12rem] flex-1">
          <span>Поиск</span>
          <input
            className="admin-input"
            defaultValue={filters.q ?? ''}
            placeholder="№, имя, телефон"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setFilter('q', (e.target as HTMLInputElement).value);
              }
            }}
          />
        </label>
      </div>

      <div className="admin-orders-layout">
        <div className="admin-panel admin-table-wrap">
          {items.length === 0 ? (
            <p className="admin-empty">{emptyMessage}</p>
          ) : (
            <table className="admin-table admin-table--compact w-full text-sm">
              <thead>
                <tr>
                  <th>Заказ</th>
                  <th>Оплата</th>
                  <th>ERP</th>
                  <th>Telegram</th>
                  <th>Сумма</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr
                    key={row.id}
                    className={`cursor-pointer ${
                      selectedId === row.id ? 'bg-[var(--admin-brand-soft)]' : ''
                    }`}
                    onClick={() => selectOrder(row.id)}
                  >
                    <td>
                      <div className="font-semibold">{row.orderNumber}</div>
                      <div className="text-xs text-[var(--admin-muted)]">
                        {row.purchaserName} · {row.fulfillmentDate}
                      </div>
                    </td>
                    <td>
                      <span className={chipClass(payTone(row.paymentStatus))}>
                        {paymentStatusLabel(row.paymentStatus)}
                      </span>
                    </td>
                    <td>
                      <span className={chipClass(erpTone(row.erpSyncStatus))}>
                        {erpSyncStatusLabel(row.erpSyncStatus)}
                      </span>
                    </td>
                    <td>
                      <span className={chipClass(tgTone(row.telegramNotifyStatus))}>
                        {telegramNotifyStatusLabel(row.telegramNotifyStatus)}
                      </span>
                    </td>
                    <td className="tabular-nums font-medium">
                      {formatPriceFromMinor(row.totalMinor, row.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {pages > 1 ? (
            <div className="flex items-center justify-between gap-2 border-t border-[var(--admin-border)] p-3 text-sm">
              <span className="text-[var(--admin-muted)]">
                Стр. {page} / {pages} · {total}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="admin-btn-ghost"
                  disabled={page <= 1}
                  onClick={() => setFilter('page', String(page - 1))}
                >
                  Назад
                </button>
                <button
                  type="button"
                  className="admin-btn-ghost"
                  disabled={page >= pages}
                  onClick={() => setFilter('page', String(page + 1))}
                >
                  Вперёд
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="admin-card admin-orders-detail">
          {!selectedId ? (
            <p className="admin-empty admin-empty--compact">Выберите заказ в таблице</p>
          ) : detailLoading ? (
            <p className="admin-empty admin-empty--compact">Загрузка…</p>
          ) : detailError ? (
            <p className="admin-error">{detailError}</p>
          ) : detail ? (
            <>
              <header className="space-y-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="admin-orders-detail__title">{detail.orderNumber}</h2>
                  <Link href={`/admin/orders/${detail.id}`} className="admin-link text-sm">
                    Открыть полностью →
                  </Link>
                </div>
                <p className="text-sm text-[var(--admin-muted)]">
                  Создан {new Date(detail.createdAt).toLocaleString('ru-BY')}
                </p>
              </header>

              <div className="admin-orders-detail__meta">
                <span className={chipClass(payTone(detail.paymentStatus))}>
                  {paymentMethodLabel(detail.paymentMethod)} ·{' '}
                  {paymentStatusLabel(detail.paymentStatus)}
                </span>
                <span className={chipClass(erpTone(detail.erpSyncStatus))}>
                  ERP · {erpSyncStatusLabel(detail.erpSyncStatus)}
                </span>
                <span className={chipClass(tgTone(detail.telegramNotifyStatus))}>
                  TG · {telegramNotifyStatusLabel(detail.telegramNotifyStatus)}
                </span>
              </div>

              <div className="admin-orders-detail__block">
                <p>
                  <strong>{detail.purchaserName}</strong>
                </p>
                <p className="text-[var(--admin-muted)]">{detail.purchaserPhoneE164}</p>
                <p>
                  {detail.fulfillmentType === 'DELIVERY' ? 'Доставка' : 'Самовывоз'}:{' '}
                  {detail.fulfillmentDate}, {detail.timeWindowLabel}
                </p>
                {detail.deliveryAddress ? <p>{detail.deliveryAddress}</p> : null}
                <p className="font-semibold tabular-nums">
                  Итого {formatPriceFromMinor(detail.totalMinor, detail.currency)}
                </p>
              </div>

              <div className="admin-orders-detail__block">
                <p className="admin-card__label">Позиции</p>
                <ul className="space-y-1">
                  {detail.items.map((item) => (
                    <li key={item.id}>
                      {item.productName} ({item.variantName}) × {item.quantity}
                      {item.optionsSnapshot && item.optionsSnapshot.length > 0
                        ? ` · ${item.optionsSnapshot.map((o) => o.valueName).join(', ')}`
                        : ''}{' '}
                      — {formatPriceFromMinor(item.lineTotalMinor, item.currency)}
                    </li>
                  ))}
                </ul>
              </div>

              {canUpdate ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    disabled={actionPending || !detail.canRetryErp}
                    onClick={() => void retryErp()}
                  >
                    Повторить ERP
                  </button>
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    disabled={actionPending || !detail.canRetryTelegram}
                    onClick={() => void retryTelegram()}
                  >
                    Повторить Telegram
                  </button>
                </div>
              ) : null}
              {actionError ? <p className="admin-error">{actionError}</p> : null}

              <div className="admin-orders-detail__block">
                <p className="admin-card__label">Хронология</p>
                <ol className="admin-orders-timeline">
                  {detail.events.map((e) => (
                    <li key={e.id} className="admin-orders-timeline__item">
                      <div className="text-[var(--admin-muted)]">
                        {new Date(e.createdAt).toLocaleString('ru-BY')}
                      </div>
                      <div>
                        {e.type}
                        {e.message ? ` — ${e.message}` : ''}
                      </div>
                    </li>
                  ))}
                  {detail.deliveryAttempts.map((a) => (
                    <li
                      key={a.id}
                      className="admin-orders-timeline__item admin-orders-timeline__item--attempt"
                    >
                      <div className="text-[var(--admin-muted)]">
                        {new Date(a.createdAt).toLocaleString('ru-BY')} · {a.channel} #
                        {a.attemptNumber}
                      </div>
                      <div>
                        {a.outcome}
                        {a.remoteReference ? ` · ${a.remoteReference}` : ''}
                        {a.errorCode ? ` · ${a.errorCode}` : ''}
                      </div>
                      {a.errorSanitized ? (
                        <div className="text-[var(--color-danger)]">{a.errorSanitized}</div>
                      ) : null}
                      {a.nextAttemptAt ? (
                        <div className="text-[var(--admin-muted)]">
                          След. попытка: {new Date(a.nextAttemptAt).toLocaleString('ru-BY')}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </div>

              <details
                open={techOpen}
                onToggle={(e) => setTechOpen((e.target as HTMLDetailsElement).open)}
              >
                <summary className="cursor-pointer text-sm font-medium">
                  Технические детали
                </summary>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-[var(--admin-bg)] p-2 text-[11px]">
                  {JSON.stringify(
                    {
                      id: detail.id,
                      erpRemoteReference: detail.erpRemoteReference,
                      paymentProvider: detail.paymentProvider,
                      paymentExternalId: detail.paymentExternalId,
                      attempts: detail.deliveryAttempts.length,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

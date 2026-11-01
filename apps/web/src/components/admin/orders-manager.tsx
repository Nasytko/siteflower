'use client';

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
      return 'rounded px-1.5 py-0.5 text-xs bg-emerald-50 text-emerald-900';
    case 'warn':
      return 'rounded px-1.5 py-0.5 text-xs bg-amber-50 text-amber-900';
    case 'err':
      return 'rounded px-1.5 py-0.5 text-xs bg-red-50 text-red-800';
    default:
      return 'rounded px-1.5 py-0.5 text-xs bg-[var(--admin-bg)] text-[var(--admin-muted)]';
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

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === 'all' || value === '') {
      if (key === 'date') params.set('date', 'all');
      else params.delete(key);
    } else {
      params.set(key, value);
    }
    params.delete('page');
    startTransition(() => {
      router.push(`/admin/orders?${params.toString()}`);
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

  return (
    <div className={`space-y-5 ${pending ? 'opacity-70' : ''}`}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {(
          [
            ['Все', summary.total, null],
            ['Ожидают ERP', summary.awaitingErp, () => setFilter('erpSyncStatus', 'PENDING')],
            ['Ошибки ERP', summary.erpErrors, () => setFilter('erpSyncStatus', 'FAILED')],
            ['Ошибки Telegram', summary.telegramErrors, () => setFilter('telegramNotifyStatus', 'FAILED')],
            ['Ожидают оплаты', summary.awaitingPayment, () => setFilter('paymentStatus', 'AWAITING_PAYMENT')],
          ] as const
        ).map(([label, value, onClick]) => (
          <button
            key={label}
            type="button"
            className="admin-card p-3 text-left"
            onClick={onClick ?? undefined}
          >
            <p className="text-xs text-[var(--admin-muted)]">{label}</p>
            <p className="text-xl font-semibold tabular-nums">{value}</p>
          </button>
        ))}
      </div>

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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="admin-card overflow-x-auto">
          {items.length === 0 ? (
            <p className="admin-empty p-4">{emptyMessage}</p>
          ) : (
            <table className="admin-table w-full text-sm">
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
                    className={`cursor-pointer ${selectedId === row.id ? 'bg-[var(--admin-brand-soft)]' : ''}`}
                    onClick={() => selectOrder(row.id)}
                  >
                    <td>
                      <div className="font-medium">{row.orderNumber}</div>
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
                    <td className="tabular-nums">
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

        <aside className="admin-card space-y-4 p-4">
          {!selectedId ? (
            <p className="admin-empty">Выберите заказ в таблице</p>
          ) : detailLoading ? (
            <p className="admin-empty">Загрузка…</p>
          ) : detailError ? (
            <p className="text-sm text-red-700">{detailError}</p>
          ) : detail ? (
            <>
              <header>
                <h2 className="text-lg font-semibold">{detail.orderNumber}</h2>
                <p className="text-sm text-[var(--admin-muted)]">
                  Создан {new Date(detail.createdAt).toLocaleString('ru-BY')}
                </p>
              </header>

              <div className="flex flex-wrap gap-2">
                <span className={chipClass(payTone(detail.paymentStatus))}>
                  {paymentMethodLabel(detail.paymentMethod)} ·{' '}
                  {paymentStatusLabel(detail.paymentStatus)}
                </span>
                <span className={chipClass(erpTone(detail.erpSyncStatus))}>
                  {erpSyncStatusLabel(detail.erpSyncStatus)}
                </span>
                <span className={chipClass(tgTone(detail.telegramNotifyStatus))}>
                  {telegramNotifyStatusLabel(detail.telegramNotifyStatus)}
                </span>
              </div>

              <section className="space-y-1 text-sm">
                <p>
                  <strong>{detail.purchaserName}</strong> · {detail.purchaserPhoneE164}
                </p>
                <p>
                  {detail.fulfillmentType === 'DELIVERY' ? 'Доставка' : 'Самовывоз'}:{' '}
                  {detail.fulfillmentDate}, {detail.timeWindowLabel}
                </p>
                {detail.deliveryAddress ? <p>{detail.deliveryAddress}</p> : null}
                <p className="font-semibold tabular-nums">
                  Итого {formatPriceFromMinor(detail.totalMinor, detail.currency)}
                </p>
              </section>

              <ul className="space-y-1 text-sm">
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
              {actionError ? <p className="text-sm text-red-700">{actionError}</p> : null}

              <section>
                <h3 className="mb-2 text-sm font-semibold">Хронология и попытки</h3>
                <ol className="space-y-2 text-xs">
                  {detail.events.map((e) => (
                    <li key={e.id} className="border-l-2 border-[var(--admin-border)] pl-2">
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
                    <li key={a.id} className="border-l-2 border-[var(--admin-brand)] pl-2">
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
                        <div className="text-red-700">{a.errorSanitized}</div>
                      ) : null}
                      {a.nextAttemptAt ? (
                        <div className="text-[var(--admin-muted)]">
                          След. попытка: {new Date(a.nextAttemptAt).toLocaleString('ru-BY')}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </section>

              <details open={techOpen} onToggle={(e) => setTechOpen((e.target as HTMLDetailsElement).open)}>
                <summary className="cursor-pointer text-sm font-medium">Технические детали</summary>
                <pre className="mt-2 overflow-x-auto rounded bg-[var(--admin-bg)] p-2 text-[11px]">
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

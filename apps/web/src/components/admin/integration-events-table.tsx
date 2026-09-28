'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  outboxStatusLabel,
  type OutboxDeliveryStatus,
  type OutboxEventAdminListItem,
} from '@bouquet-one/contracts';
import { Button } from '@bouquet-one/ui';
import { errorMessage } from '@/lib/admin-client';
import { integrationClientApi } from '@/lib/admin-integration-client';

type Props = {
  items: OutboxEventAdminListItem[];
  total: number;
  canOperate: boolean;
  /** Hide order number column when already scoped to one order */
  hideOrderColumn?: boolean;
  emptyMessage?: string;
};

function statusTone(status: OutboxDeliveryStatus): string {
  switch (status) {
    case 'DELIVERED':
      return 'text-[var(--admin-brand)]';
    case 'FAILED':
      return 'text-red-700';
    case 'RETRY':
      return 'text-amber-800';
    case 'PROCESSING':
      return 'text-sky-800';
    default:
      return 'text-[var(--admin-ink)]';
  }
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-BY');
}

function canRetry(status: OutboxDeliveryStatus): boolean {
  return status === 'FAILED' || status === 'RETRY' || status === 'PENDING';
}

export function IntegrationEventsTable({
  items,
  total,
  canOperate,
  hideOrderColumn = false,
  emptyMessage = 'Событий пока нет',
}: Props) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onRetry(id: string) {
    if (!canOperate || pendingId) return;
    setPendingId(id);
    setError(null);
    try {
      await integrationClientApi.retryEvent(id);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось повторить отправку'));
    } finally {
      setPendingId(null);
    }
  }

  if (items.length === 0) {
    return <p className="text-sm text-[var(--admin-muted)]">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <p className="text-sm text-[var(--admin-muted)]">
        Показано {items.length}
        {total > items.length ? ` из ${total}` : ''}
      </p>
      <div className="overflow-x-auto">
        <table className="admin-table min-w-[720px]">
          <thead>
            <tr>
              {!hideOrderColumn ? <th>Заказ</th> : null}
              <th>Тип</th>
              <th>Статус</th>
              <th>Попытки</th>
              <th>Создано</th>
              <th>Последняя попытка</th>
              <th>Ошибка</th>
              {canOperate ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                {!hideOrderColumn ? (
                  <td className="font-medium tabular-nums">
                    {item.orderNumber ?? item.aggregateId.slice(0, 8)}
                  </td>
                ) : null}
                <td>{item.eventType}</td>
                <td>
                  <span className={`font-medium ${statusTone(item.status)}`}>
                    {outboxStatusLabel(item.status)}
                  </span>
                </td>
                <td className="tabular-nums">{item.attemptCount}</td>
                <td className="tabular-nums text-sm">{formatWhen(item.createdAt)}</td>
                <td className="tabular-nums text-sm">{formatWhen(item.lastAttemptAt)}</td>
                <td className="max-w-[14rem] truncate text-sm text-[var(--admin-muted)]">
                  {item.lastErrorSanitized ?? item.failureCategory ?? '—'}
                </td>
                {canOperate ? (
                  <td>
                    {canRetry(item.status) ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pendingId === item.id}
                        onClick={() => void onRetry(item.id)}
                      >
                        {pendingId === item.id ? '…' : 'Повторить'}
                      </Button>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

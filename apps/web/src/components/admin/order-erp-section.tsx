'use client';

import Link from 'next/link';
import {
  outboxStatusLabel,
  type OutboxEventAdminListItem,
} from '@bouquet-one/contracts';
import { IntegrationEventsTable } from '@/components/admin/integration-events-table';

type Props = {
  events: OutboxEventAdminListItem[];
  total: number;
  canOperate: boolean;
};

export function OrderErpSection({ events, total, canOperate }: Props) {
  const latest = events[0] ?? null;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">ERP</h2>
        <Link
          href="/admin/integrations/erp"
          className="text-sm text-stone-500 underline-offset-2 hover:underline"
        >
          Все интеграции →
        </Link>
      </div>

      {latest ? (
        <p className="text-sm text-stone-600">
          Последний статус:{' '}
          <span className="font-medium text-stone-900">
            {outboxStatusLabel(latest.status)}
          </span>
          {latest.remoteReference ? (
            <span className="text-stone-500"> · ref {latest.remoteReference}</span>
          ) : null}
        </p>
      ) : (
        <p className="text-sm text-stone-500">Событий outbox для этого заказа нет.</p>
      )}

      {events.length > 0 ? (
        <IntegrationEventsTable
          items={events}
          total={total}
          canOperate={canOperate}
          hideOrderColumn
          emptyMessage="Событий outbox для этого заказа нет."
        />
      ) : null}
    </section>
  );
}

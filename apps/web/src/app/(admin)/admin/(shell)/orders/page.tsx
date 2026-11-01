import { Suspense } from 'react';
import { roleHasPermission } from '@bouquet-one/contracts';
import type {
  AdminOrdersSummaryDto,
  OrderAdminListItemDto,
} from '@bouquet-one/contracts';
import { adminFetch, fetchAdminMe } from '@/lib/admin-api';
import { OrdersManager } from '@/components/admin/orders-manager';
import { redirect } from 'next/navigation';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const me = await fetchAdminMe();
  if (!me || !roleHasPermission(me.user.role, 'ORDERS_READ')) {
    redirect('/admin');
  }

  const sp = await searchParams;
  const date = typeof sp.date === 'string' ? sp.date : 'today';
  const status = typeof sp.status === 'string' ? sp.status : undefined;
  const fulfillmentType =
    typeof sp.fulfillmentType === 'string' ? sp.fulfillmentType : undefined;
  const paymentStatus =
    typeof sp.paymentStatus === 'string' ? sp.paymentStatus : undefined;
  const erpSyncStatus =
    typeof sp.erpSyncStatus === 'string' ? sp.erpSyncStatus : undefined;
  const telegramNotifyStatus =
    typeof sp.telegramNotifyStatus === 'string' ? sp.telegramNotifyStatus : undefined;
  const q = typeof sp.q === 'string' ? sp.q : undefined;
  const page = typeof sp.page === 'string' ? sp.page : '1';

  const params = new URLSearchParams();
  params.set('date', date);
  params.set('page', page);
  params.set('pageSize', '20');
  if (status) params.set('status', status);
  if (fulfillmentType) params.set('fulfillmentType', fulfillmentType);
  if (paymentStatus) params.set('paymentStatus', paymentStatus);
  if (erpSyncStatus) params.set('erpSyncStatus', erpSyncStatus);
  if (telegramNotifyStatus) params.set('telegramNotifyStatus', telegramNotifyStatus);
  if (q) params.set('q', q);

  const summaryParams = new URLSearchParams();
  summaryParams.set('date', date);

  const [data, summary] = await Promise.all([
    adminFetch<{
      items: OrderAdminListItemDto[];
      total: number;
      page: number;
      pageSize: number;
    }>(`/api/v1/admin/orders?${params.toString()}`),
    adminFetch<AdminOrdersSummaryDto>(
      `/api/v1/admin/orders/summary?${summaryParams.toString()}`,
    ).catch(
      (): AdminOrdersSummaryDto => ({
        total: 0,
        awaitingErp: 0,
        erpErrors: 0,
        telegramErrors: 0,
        awaitingPayment: 0,
      }),
    ),
  ]);

  return (
    <main id="main-content" className="space-y-6">
      <header className="admin-page-header">
        <div className="admin-page-header__text">
          <h1 className="admin-page-title">Заказы</h1>
          <p className="admin-page-lead">
            Мониторинг оплаты, ERP и Telegram. Операционная обработка — в ERP.
          </p>
        </div>
      </header>
      <Suspense fallback={<p className="admin-empty">Загрузка заказов…</p>}>
        <OrdersManager
          items={data.items}
          total={data.total}
          page={data.page}
          pageSize={data.pageSize}
          summary={summary}
          canUpdate={roleHasPermission(me.user.role, 'ORDERS_UPDATE')}
          filters={{
            date,
            status,
            fulfillmentType,
            paymentStatus,
            erpSyncStatus,
            telegramNotifyStatus,
            q,
          }}
        />
      </Suspense>
    </main>
  );
}

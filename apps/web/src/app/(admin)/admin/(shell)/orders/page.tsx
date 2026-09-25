import { Suspense } from 'react';
import { roleHasPermission } from '@bouquet-one/contracts';
import type { OrderAdminListItemDto } from '@bouquet-one/contracts';
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
  const q = typeof sp.q === 'string' ? sp.q : undefined;
  const page = typeof sp.page === 'string' ? sp.page : '1';

  const params = new URLSearchParams();
  params.set('date', date);
  params.set('page', page);
  params.set('pageSize', '20');
  if (status) params.set('status', status);
  if (fulfillmentType) params.set('fulfillmentType', fulfillmentType);
  if (q) params.set('q', q);

  const data = await adminFetch<{
    items: OrderAdminListItemDto[];
    total: number;
    page: number;
    pageSize: number;
  }>(`/api/v1/admin/orders?${params.toString()}`);

  return (
    <main id="main-content" className="space-y-6">
      <header>
        <h1 className="admin-page-title">Заказы</h1>
        <p className="admin-page-lead">Операционный список на дату выполнения</p>
      </header>
      <Suspense fallback={<p className="text-stone-500">Загрузка…</p>}>
        <OrdersManager
          items={data.items}
          total={data.total}
          page={data.page}
          pageSize={data.pageSize}
          filters={{ date, status, fulfillmentType, q }}
        />
      </Suspense>
    </main>
  );
}

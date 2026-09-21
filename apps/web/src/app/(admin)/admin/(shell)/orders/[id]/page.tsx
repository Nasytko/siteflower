import { roleHasPermission, type OrderAdminDetailDto } from '@bouquet-one/contracts';
import { notFound, redirect } from 'next/navigation';
import { AdminApiError, adminFetch, fetchAdminMe } from '@/lib/admin-api';
import { OrderDetailPanel } from '@/components/admin/order-detail-panel';

type Props = { params: Promise<{ id: string }> };

export default async function AdminOrderDetailPage({ params }: Props) {
  const me = await fetchAdminMe();
  if (!me || !roleHasPermission(me.user.role, 'ORDERS_READ')) {
    redirect('/admin');
  }

  const { id } = await params;
  let order: OrderAdminDetailDto;
  try {
    order = await adminFetch<OrderAdminDetailDto>(`/api/v1/admin/orders/${id}`);
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <main id="main-content">
      <OrderDetailPanel
        initial={order}
        canUpdate={roleHasPermission(me.user.role, 'ORDERS_UPDATE')}
      />
    </main>
  );
}

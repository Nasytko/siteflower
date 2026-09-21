import { roleHasPermission, type CollectionAdminDto } from '@bouquet-one/contracts';
import { adminFetch, fetchAdminMe } from '@/lib/admin-api';
import { CollectionsManager } from '@/components/admin/collections-manager';

export default async function CollectionsPage() {
  const me = await fetchAdminMe();
  const initial = await adminFetch<CollectionAdminDto[]>('/api/v1/admin/catalog/collections');

  return (
    <CollectionsManager
      initial={initial}
      canCreate={Boolean(me && roleHasPermission(me.user.role, 'CATALOG_CREATE'))}
      canUpdate={Boolean(me && roleHasPermission(me.user.role, 'CATALOG_UPDATE'))}
    />
  );
}

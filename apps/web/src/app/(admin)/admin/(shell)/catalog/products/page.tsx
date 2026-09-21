import { roleHasPermission } from '@bouquet-one/contracts';
import type { PaginatedResponse, ProductListItemDto } from '@bouquet-one/contracts';
import { adminFetch, fetchAdminMe } from '@/lib/admin-api';
import { ProductsManager } from '@/components/admin/products-manager';

export default async function AdminProductsPage() {
  const me = await fetchAdminMe();
  const initial = await adminFetch<PaginatedResponse<ProductListItemDto>>(
    '/api/v1/admin/catalog/products?page=1&pageSize=50',
  );

  return (
    <main id="main-content" className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold text-stone-900">Товары</h1>
        <p className="text-stone-600">Каталог букетов и коммерческих предложений</p>
      </header>
      <ProductsManager
        initial={initial}
        canCreate={Boolean(me && roleHasPermission(me.user.role, 'CATALOG_CREATE'))}
      />
    </main>
  );
}

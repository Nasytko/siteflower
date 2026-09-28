import { Suspense } from 'react';
import { roleHasPermission } from '@bouquet-one/contracts';
import { fetchBestsellerGroups, fetchProductsPage } from '@/lib/admin-catalog-api';
import { requireAdminPermission } from '@/lib/admin-page-auth';
import { ProductsManager, type ProductFilters } from '@/components/admin/products-manager';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
  fallback = '',
): string {
  const value = params[key];
  return typeof value === 'string' ? value : fallback;
}

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const me = await requireAdminPermission('CATALOG_READ');
  const sp = await searchParams;

  const filters: ProductFilters = {
    q: readParam(sp, 'q'),
    lifecycle: readParam(sp, 'lifecycle'),
    availability: readParam(sp, 'availability'),
    promotion: readParam(sp, 'promotion'),
    bestsellerGroupId: readParam(sp, 'bestsellerGroupId'),
    sort: readParam(sp, 'sort'),
    page: Math.max(1, Number(readParam(sp, 'page', '1')) || 1),
  };

  const [data, bestsellerGroups] = await Promise.all([
    fetchProductsPage({
      q: filters.q || undefined,
      lifecycle: filters.lifecycle || undefined,
      availability: filters.availability || undefined,
      promotion: filters.promotion || undefined,
      bestsellerGroupId: filters.bestsellerGroupId || undefined,
      sort: filters.sort || undefined,
      page: filters.page,
      pageSize: 25,
    }),
    fetchBestsellerGroups(),
  ]);

  return (
    <main id="main-content" className="space-y-6">
      <header>
        <h1 className="admin-page-title">Товары</h1>
        <p className="admin-page-lead">Букеты магазина: цены, фото, подбор и продвижение</p>
      </header>
      <Suspense fallback={<p className="admin-empty">Загрузка…</p>}>
        <ProductsManager
          data={data}
          filters={filters}
          bestsellerGroups={bestsellerGroups.map((group) => ({ id: group.id, name: group.name }))}
          canCreate={roleHasPermission(me.user.role, 'CATALOG_CREATE')}
        />
      </Suspense>
    </main>
  );
}

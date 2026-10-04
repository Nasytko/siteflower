import { Suspense } from 'react';
import { roleHasPermission } from '@bouquet-one/contracts';
import { fetchBestsellerGroups, fetchProductsPage } from '@/lib/admin-catalog-api';
import { requireAdminPermission } from '@/lib/admin-page-auth';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
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

  // Accept legacy URL aliases once so bookmarks keep working, then map to canonical API keys.
  const search = readParam(sp, 'search') || readParam(sp, 'q');
  const promotionalOnlyRaw =
    readParam(sp, 'promotionalOnly') ||
    (readParam(sp, 'promotion') === 'active' ? 'true' : '');
  const bestsellerGroupIds =
    readParam(sp, 'bestsellerGroupIds') || readParam(sp, 'bestsellerGroupId');

  const filters: ProductFilters = {
    search,
    lifecycle: readParam(sp, 'lifecycle'),
    availability: readParam(sp, 'availability'),
    promotionalOnly: promotionalOnlyRaw === 'true' ? 'true' : '',
    bestsellerGroupIds,
    sort: readParam(sp, 'sort'),
    page: Math.max(1, Number(readParam(sp, 'page', '1')) || 1),
  };

  const [data, bestsellerGroups] = await Promise.all([
    fetchProductsPage({
      search: filters.search || undefined,
      lifecycle: filters.lifecycle || undefined,
      availability: filters.availability || undefined,
      promotionalOnly: filters.promotionalOnly === 'true' ? true : undefined,
      bestsellerGroupIds: filters.bestsellerGroupIds || undefined,
      sort: filters.sort || undefined,
      page: filters.page,
      pageSize: 25,
    }),
    fetchBestsellerGroups(),
  ]);

  const canCreate = roleHasPermission(me.user.role, 'CATALOG_CREATE');

  return (
    <main id="main-content" className="space-y-6">
      <AdminPageHeader
        title="Товары"
        lead="Найдите товар, измените наличие или откройте карточку для фото, цены и публикации."
        actions={
          canCreate ? (
            <a href="#create-product" className="admin-btn">
              Новый товар
            </a>
          ) : undefined
        }
      />
      <Suspense fallback={<p className="admin-empty">Загрузка списка товаров…</p>}>
        <ProductsManager
          data={data}
          filters={filters}
          bestsellerGroups={bestsellerGroups.map((group) => ({ id: group.id, name: group.name }))}
          canCreate={canCreate}
          canUpdate={roleHasPermission(me.user.role, 'CATALOG_UPDATE')}
          canPublish={roleHasPermission(me.user.role, 'CATALOG_PUBLISH')}
        />
      </Suspense>
    </main>
  );
}

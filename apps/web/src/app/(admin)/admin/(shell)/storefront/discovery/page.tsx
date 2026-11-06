import {
  roleHasPermission,
  type CatalogPageDto,
  type HomepageConfigAdminDto,
  type TaxonomyAdminDto,
} from '@bouquet-one/contracts';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import {
  buildDiscoveryLinkOptions,
  DiscoveryTilesManager,
} from '@/components/admin/discovery-tiles-manager';
import { adminFetch } from '@/lib/admin-api';
import { adminEndpoints, withQuery } from '@/lib/admin-endpoints';
import { requireAdminPermission } from '@/lib/admin-page-auth';

export const dynamic = 'force-dynamic';

type ListResponse<T> = { items: T[] } | T[];

function asItems<T>(payload: ListResponse<T> | null | undefined): T[] {
  if (!payload) return [];
  return Array.isArray(payload) ? payload : (payload.items ?? []);
}

export default async function AdminDiscoveryTilesPage() {
  const me = await requireAdminPermission('CONTENT_READ');

  const [homepage, catalogPagesRaw, occasionsRaw, recipientsRaw] = await Promise.all([
    adminFetch<HomepageConfigAdminDto>(adminEndpoints.homepage),
    adminFetch<ListResponse<CatalogPageDto>>(
      withQuery(adminEndpoints.catalogPages, { page: 1, pageSize: 200 }),
    ).catch(() => null),
    adminFetch<ListResponse<TaxonomyAdminDto>>(
      withQuery(adminEndpoints.taxonomy('occasions'), { page: 1, pageSize: 200 }),
    ).catch(() => null),
    adminFetch<ListResponse<TaxonomyAdminDto>>(
      withQuery(adminEndpoints.taxonomy('recipients'), { page: 1, pageSize: 200 }),
    ).catch(() => null),
  ]);

  const linkOptions = buildDiscoveryLinkOptions({
    catalogPages: asItems(catalogPagesRaw),
    occasions: asItems(occasionsRaw),
    recipients: asItems(recipientsRaw),
  });

  return (
    <main id="main-content" className="space-y-6">
      <AdminPageHeader
        title="Плитки на главной"
        lead="Блок с картинками под баннером: Цветы поштучно, букеты из роз и другие. Фото загружаются в хранилище, ссылку можно выбрать из страниц или вписать вручную."
      />
      <DiscoveryTilesManager
        initial={homepage}
        linkOptions={linkOptions}
        canUpdate={roleHasPermission(me.user.role, 'CONTENT_UPDATE')}
      />
    </main>
  );
}

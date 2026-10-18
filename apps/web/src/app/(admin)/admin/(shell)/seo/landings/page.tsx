import { roleHasPermission } from '@bouquet-one/contracts';
import { SeoLandingsManager } from '@/components/admin/seo-landings-manager';
import { adminFetch } from '@/lib/admin-api';
import { fetchTaxonomy } from '@/lib/admin-catalog-api';
import { adminEndpoints } from '@/lib/admin-endpoints';
import { requireAdminPermission } from '@/lib/admin-page-auth';
import type { FlowerTypeAdminDto, SeoLandingPageDto } from '@bouquet-one/contracts';

export const dynamic = 'force-dynamic';

export default async function AdminSeoLandingsPage() {
  const me = await requireAdminPermission('SEO_READ');
  const [landings, flowerTypes, colors, occasions, recipients] = await Promise.all([
    adminFetch<SeoLandingPageDto[]>(adminEndpoints.seoLandings),
    adminFetch<FlowerTypeAdminDto[]>(adminEndpoints.flowerTypes),
    fetchTaxonomy('colors'),
    fetchTaxonomy('occasions'),
    fetchTaxonomy('recipients'),
  ]);

  return (
    <main id="main-content" className="space-y-6">
      <header>
        <h1 className="admin-page-title">SEO-подборки</h1>
        <p className="admin-page-lead">
          Посадочные /p/… под поисковые запросы. Товары подбираются по составу автоматически —
          менеджер не отмечает каждую подборку вручную.
        </p>
      </header>
      <SeoLandingsManager
        initial={landings}
        flowerTypes={flowerTypes}
        colors={colors}
        occasions={occasions}
        recipients={recipients}
        canUpdate={roleHasPermission(me.user.role, 'SEO_UPDATE')}
      />
    </main>
  );
}

import { roleHasPermission } from '@bouquet-one/contracts';
import { MediaHealthPanel } from '@/components/admin/media-health-panel';
import { adminFetch } from '@/lib/admin-api';
import { adminEndpoints } from '@/lib/admin-endpoints';
import { requireAdminPermission } from '@/lib/admin-page-auth';

export const dynamic = 'force-dynamic';

type HealthStatus = {
  checkedAt: string;
  driver: 'local' | 's3';
  assetCount: number;
  referencedAssets: number;
  orphanCandidates: number;
  orphanWithinGrace: number;
  missingMasters: unknown[];
  missingDerivatives: unknown[];
  productsMissingPrimary: unknown[];
  productsMultiplePrimary: unknown[];
};

export default async function AdminMediaHealthPage() {
  const me = await requireAdminPermission('SITE_HEALTH_READ');
  const initial = await adminFetch<HealthStatus>(adminEndpoints.mediaHealth);

  return (
    <main id="main-content" className="space-y-8">
      <header>
        <h1 className="admin-page-title">Состояние сайта · Медиа</h1>
        <p className="admin-page-lead">
          Диагностика хранилища фотографий и согласованности БД. Не создаёт тестовые товары.
        </p>
      </header>
      <MediaHealthPanel
        initial={initial}
        canProbe={roleHasPermission(me.user.role, 'SITE_HEALTH_READ')}
      />
    </main>
  );
}

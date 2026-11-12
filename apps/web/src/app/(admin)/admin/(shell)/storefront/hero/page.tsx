import { roleHasPermission, type HomepageConfigAdminDto } from '@bouquet-one/contracts';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { HeroSlidesManager } from '@/components/admin/hero-slides-manager';
import { adminFetch } from '@/lib/admin-api';
import { adminEndpoints } from '@/lib/admin-endpoints';
import { requireAdminPermission } from '@/lib/admin-page-auth';

export const dynamic = 'force-dynamic';

export default async function AdminHeroSlidesPage() {
  const me = await requireAdminPermission('CONTENT_READ');
  const homepage = await adminFetch<HomepageConfigAdminDto>(adminEndpoints.homepage);

  return (
    <main id="main-content" className="space-y-6">
      <AdminPageHeader
        title="Баннер на главной"
        lead="Большое фото под меню. Можно поставить два или три кадра: своё фото, надпись вроде «Скидка» и кнопку."
      />
      <HeroSlidesManager
        initial={homepage}
        canUpdate={roleHasPermission(me.user.role, 'CONTENT_UPDATE')}
      />
    </main>
  );
}

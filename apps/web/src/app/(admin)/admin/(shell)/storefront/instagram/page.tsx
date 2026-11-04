import { roleHasPermission, type InstagramPostDto } from '@bouquet-one/contracts';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { InstagramManager } from '@/components/admin/instagram-manager';
import { adminFetch } from '@/lib/admin-api';
import { adminEndpoints } from '@/lib/admin-endpoints';
import { requireAdminPermission } from '@/lib/admin-page-auth';
import { getFixedStorefrontSettings } from '@/lib/storefront-content';

export default async function AdminInstagramPage() {
  const me = await requireAdminPermission('CONTENT_READ');
  const posts = await adminFetch<InstagramPostDto[]>(adminEndpoints.instagramPosts);
  const settings = getFixedStorefrontSettings();

  return (
    <main id="main-content" className="space-y-6">
      <AdminPageHeader
        title="Лента Instagram"
        lead="Кадры для блока на главной. Добавляются вручную — без автоподтягивания из профиля."
      />
      <InstagramManager
        initial={posts}
        profileUrl={settings.instagramUrl}
        canUpdate={roleHasPermission(me.user.role, 'CONTENT_UPDATE')}
      />
    </main>
  );
}

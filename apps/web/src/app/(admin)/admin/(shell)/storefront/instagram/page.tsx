import { roleHasPermission, type InstagramPostDto, type StorefrontSettingsAdminDto } from '@bouquet-one/contracts';
import { InstagramManager } from '@/components/admin/instagram-manager';
import { adminFetch } from '@/lib/admin-api';
import { adminEndpoints } from '@/lib/admin-endpoints';
import { requireAdminPermission } from '@/lib/admin-page-auth';

export default async function AdminInstagramPage() {
  const me = await requireAdminPermission('CONTENT_READ');
  const [posts, settings] = await Promise.all([
    adminFetch<InstagramPostDto[]>(adminEndpoints.instagramPosts),
    adminFetch<StorefrontSettingsAdminDto>(adminEndpoints.storefrontSettings),
  ]);

  return (
    <main id="main-content" className="space-y-6">
      <header>
        <h1 className="admin-page-title">Instagram</h1>
        <p className="admin-page-lead">
          Кураторская лента для главной: добавляйте лучшие кадры вручную — без автоподтягивания.
        </p>
      </header>
      <InstagramManager
        initial={posts}
        profileUrl={settings.instagramUrl}
        canUpdate={roleHasPermission(me.user.role, 'CONTENT_UPDATE')}
      />
    </main>
  );
}

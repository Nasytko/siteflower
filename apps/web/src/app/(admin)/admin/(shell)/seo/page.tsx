import type { SeoHealthReportDto } from '@bouquet-one/contracts';
import { SeoHealthPanel } from '@/components/admin/seo-health-panel';
import { adminFetch } from '@/lib/admin-api';
import { adminEndpoints, withQuery } from '@/lib/admin-endpoints';
import { requireAdminPermission } from '@/lib/admin-page-auth';

export const dynamic = 'force-dynamic';

export default async function AdminSeoPage() {
  await requireAdminPermission('SEO_READ');
  const initial = await adminFetch<SeoHealthReportDto>(
    withQuery(adminEndpoints.seoHealth, { page: 1, pageSize: 50 }),
  );

  return (
    <main id="main-content" className="space-y-8">
      <header>
        <h1 className="admin-page-title">SEO сайта</h1>
        <p className="admin-page-lead">
          Проверка страниц магазина и рекомендации по улучшению. Система сама собирает заголовки и
          описания — вручную настраивать SEO нужно только если хотите изменить автоматический текст.
        </p>
      </header>
      <SeoHealthPanel initial={initial} />
    </main>
  );
}

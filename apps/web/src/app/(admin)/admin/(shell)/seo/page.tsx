import Link from 'next/link';
import type { SeoHealthReportDto } from '@bouquet-one/contracts';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
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
      <AdminPageHeader
        title="SEO сайта"
        lead={
          <>
            Проверка названий, описаний и фото для поиска. Технические детали (sitemap, canonical)
            скрыты ниже списка страниц.{' '}
            <Link href="/admin/catalog/pages" className="admin-link">
              Страницы каталога
            </Link>
          </>
        }
      />
      <SeoHealthPanel initial={initial} />
    </main>
  );
}

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
        title="Диагностика SEO"
        lead={
          <>
            Проверка названий, описаний и фото для поиска. Исправляйте в карточке товара или на{' '}
            <Link href="/admin/catalog/pages" className="admin-link">
              странице каталога
            </Link>
            — по ссылке из таблицы.
          </>
        }
      />
      <SeoHealthPanel initial={initial} />
    </main>
  );
}

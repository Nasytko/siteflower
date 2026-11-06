import Link from 'next/link';
import type { HomepageConfigAdminDto, SeoHealthReportDto } from '@bouquet-one/contracts';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { HomepageSeoEditor } from '@/components/admin/homepage-seo-editor';
import { SeoHealthPanel } from '@/components/admin/seo-health-panel';
import { adminFetch } from '@/lib/admin-api';
import { adminEndpoints, withQuery } from '@/lib/admin-endpoints';
import { requireAdminPermission } from '@/lib/admin-page-auth';

export const dynamic = 'force-dynamic';

export default async function AdminSeoPage() {
  await requireAdminPermission('SEO_READ');
  const [initial, homepage] = await Promise.all([
    adminFetch<SeoHealthReportDto>(withQuery(adminEndpoints.seoHealth, { page: 1, pageSize: 50 })),
    adminFetch<HomepageConfigAdminDto>(adminEndpoints.homepage).catch(() => null),
  ]);

  return (
    <main id="main-content" className="space-y-8">
      <AdminPageHeader
        title="Диагностика SEO"
        lead={
          <>
            Проверка URL, итоговых метаданных, canonical, индексации и sitemap. Это диагностика
            сайта — не факт попадания в индекс Google или Яндекса. Правки товаров и{' '}
            <Link href="/admin/catalog/pages" className="admin-link">
              страниц каталога
            </Link>
            — по ссылкам из таблицы.
          </>
        }
      />
      {homepage ? <HomepageSeoEditor initial={homepage} /> : null}
      <SeoHealthPanel initial={initial} />
    </main>
  );
}

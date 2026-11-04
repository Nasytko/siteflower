import Link from 'next/link';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { TaxonomyKindTabs } from '@/components/admin/taxonomy-kind-tabs';
import { requireAdminPermission } from '@/lib/admin-page-auth';
import { TAXONOMY_KIND_META, TAXONOMY_KINDS } from '@/lib/admin-endpoints';

const HUB_LINKS = [
  {
    href: '/admin/catalog/flower-structure',
    title: 'Цветы',
    lead: 'Позиции для состава: вид, форма, сорт, происхождение, высота стебля.',
  },
  ...TAXONOMY_KINDS.map((kind) => ({
    href: `/admin/catalog/${kind}`,
    title: TAXONOMY_KIND_META[kind].title,
    lead: TAXONOMY_KIND_META[kind].lead,
  })),
  {
    href: '/admin/catalog/pages',
    title: 'Страницы каталога',
    lead: 'Основные разделы и тематические подборки. Товары попадают по типу и правилам состава автоматически.',
  },
] as const;

export default async function AdminCatalogDictionariesPage() {
  await requireAdminPermission('CATALOG_READ');

  return (
    <main id="main-content" className="space-y-6">
      <AdminPageHeader
        title="Справочники"
        lead="Цветы для состава, цвета, поводы и получатели. Страницы каталога — отдельно в своём разделе."
      />

      <p className="admin-notice">
        Сначала заведите позиции цветов, затем используйте их во вкладке «Состав» у товара.
      </p>

      <TaxonomyKindTabs />

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {HUB_LINKS.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="admin-quick-link h-full">
              <span>
                <span className="block font-semibold">{item.title}</span>
                <span className="mt-0.5 block text-sm text-[var(--admin-muted)]">{item.lead}</span>
              </span>
              <span aria-hidden>→</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

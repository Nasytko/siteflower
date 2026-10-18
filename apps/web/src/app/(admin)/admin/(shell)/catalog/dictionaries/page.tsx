import Link from 'next/link';
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
    href: '/admin/catalog/categories',
    title: 'Категории',
    lead: 'Дерево каталога на витрине: структура разделов и привязка товаров.',
  },
] as const;

export default async function AdminCatalogDictionariesPage() {
  await requireAdminPermission('CATALOG_READ');

  return (
    <main id="main-content" className="space-y-6">
      <header>
        <h1 className="admin-page-title">Справочники</h1>
        <p className="admin-page-lead">
          Цветы, цвета, поводы, получатели и категории — всё, чем наполняется каталог.
        </p>
      </header>

      <TaxonomyKindTabs />

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {HUB_LINKS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="block rounded-lg border border-[var(--admin-border)] p-4 transition-colors hover:border-[var(--admin-brand)]"
            >
              <h2 className="font-semibold text-[var(--admin-ink)]">{item.title}</h2>
              <p className="mt-1 text-sm text-[var(--admin-muted)]">{item.lead}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

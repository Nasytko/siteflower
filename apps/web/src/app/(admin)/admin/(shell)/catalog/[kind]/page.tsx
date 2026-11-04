import { notFound } from 'next/navigation';
import { roleHasPermission } from '@bouquet-one/contracts';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { TaxonomyCrud } from '@/components/admin/taxonomy-crud';
import { TaxonomyKindTabs } from '@/components/admin/taxonomy-kind-tabs';
import { fetchTaxonomy } from '@/lib/admin-catalog-api';
import { isTaxonomyKind, TAXONOMY_KIND_META } from '@/lib/admin-endpoints';
import { requireAdminPermission } from '@/lib/admin-page-auth';

type Props = { params: Promise<{ kind: string }> };

export default async function CatalogDictionaryPage({ params }: Props) {
  const { kind } = await params;
  if (!isTaxonomyKind(kind)) {
    notFound();
  }

  const me = await requireAdminPermission('CATALOG_READ');
  const items = await fetchTaxonomy(kind);
  const meta = TAXONOMY_KIND_META[kind];

  return (
    <main id="main-content" className="space-y-6">
      <AdminPageHeader title={meta.title} lead={meta.lead} />

      <p className="admin-notice">
        {kind === 'colors'
          ? 'Цвета привязываются к позициям в «Цветах и сортах» и к аудитории товара. Правила «с розами / из роз» настраиваются на страницах каталога.'
          : 'Эти метки не создают отдельные разделы сайта — только помогают отфильтровать товары.'}
      </p>

      <TaxonomyKindTabs />

      <TaxonomyCrud
        meta={meta}
        initial={items}
        canCreate={roleHasPermission(me.user.role, 'CATALOG_CREATE')}
        canUpdate={roleHasPermission(me.user.role, 'CATALOG_UPDATE')}
      />
    </main>
  );
}

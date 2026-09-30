import { notFound } from 'next/navigation';
import { roleHasPermission } from '@bouquet-one/contracts';
import { fetchTaxonomy } from '@/lib/admin-catalog-api';
import { isTaxonomyKind, TAXONOMY_KIND_META } from '@/lib/admin-endpoints';
import { requireAdminPermission } from '@/lib/admin-page-auth';
import { TaxonomyCrud } from '@/components/admin/taxonomy-crud';
import { TaxonomyKindTabs } from '@/components/admin/taxonomy-kind-tabs';

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
      <header>
        <h1 className="admin-page-title">Справочники</h1>
        <p className="admin-page-lead">{meta.lead}</p>
      </header>

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

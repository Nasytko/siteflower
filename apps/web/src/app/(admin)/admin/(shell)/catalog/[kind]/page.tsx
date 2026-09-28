import { notFound } from 'next/navigation';
import { roleHasPermission } from '@bouquet-one/contracts';
import { fetchTaxonomy } from '@/lib/admin-catalog-api';
import { isTaxonomyKind, TAXONOMY_KIND_META } from '@/lib/admin-endpoints';
import { requireAdminPermission } from '@/lib/admin-page-auth';
import { TaxonomyCrud } from '@/components/admin/taxonomy-crud';

type Props = { params: Promise<{ kind: string }> };

export default async function CatalogDictionaryPage({ params }: Props) {
  const { kind } = await params;
  if (!isTaxonomyKind(kind)) {
    notFound();
  }

  const me = await requireAdminPermission('CATALOG_READ');
  const items = await fetchTaxonomy(kind);

  return (
    <TaxonomyCrud
      meta={TAXONOMY_KIND_META[kind]}
      initial={items}
      canCreate={roleHasPermission(me.user.role, 'CATALOG_CREATE')}
      canUpdate={roleHasPermission(me.user.role, 'CATALOG_UPDATE')}
    />
  );
}

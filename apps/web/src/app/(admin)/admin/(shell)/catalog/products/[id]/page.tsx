import { notFound } from 'next/navigation';
import { roleHasPermission, type ProductAdminDto } from '@bouquet-one/contracts';
import { AdminApiError } from '@/lib/admin-api';
import {
  fetchBestsellerGroups,
  fetchProduct,
  fetchProductEditorPickers,
  fetchProductTaxonomies,
} from '@/lib/admin-catalog-api';
import { categoryPickerOptions } from '@/lib/admin-catalog-picker-labels';
import { requireAdminPermission } from '@/lib/admin-page-auth';
import { ProductEditor } from '@/components/admin/product-editor';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminProductEditPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const justCreated = sp.created === '1' || sp.created === 'true';
  const me = await requireAdminPermission('CATALOG_READ');

  let product: ProductAdminDto;
  try {
    product = await fetchProduct(id);
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 404) notFound();
    throw error;
  }

  const [taxonomies, bestsellerGroups, structure] = await Promise.all([
    fetchProductTaxonomies(),
    fetchBestsellerGroups(),
    fetchProductEditorPickers(),
  ]);

  return (
    <main id="main-content" className="space-y-6">
      <header className="space-y-1">
        <h1 className="admin-page-title">{product.name}</h1>
        <p className="admin-page-lead text-sm text-[var(--admin-muted)]">
          /bukety/{product.slug}
        </p>
      </header>
      <ProductEditor
        product={product}
        justCreated={justCreated}
        options={{
          occasions: taxonomies.occasions.map((item) => ({ id: item.id, name: item.name })),
          recipients: taxonomies.recipients.map((item) => ({ id: item.id, name: item.name })),
          colors: taxonomies.colors.map((item) => ({
            id: item.id,
            name: item.name,
            swatch: item.swatch,
          })),
          bouquetSizes: taxonomies.bouquetSizes.map((item) => ({ id: item.id, name: item.name })),
          productLines: taxonomies.productLines.map((item) => ({ id: item.id, name: item.name })),
          categories: categoryPickerOptions(structure.categories),
          families: structure.families.map((item) => ({ id: item.id, name: item.name })),
        }}
        bestsellerGroups={bestsellerGroups
          .filter((group) => group.active)
          .map((group) => ({ id: group.id, name: group.name }))}
        canUpdate={roleHasPermission(me.user.role, 'CATALOG_UPDATE')}
        canPublish={roleHasPermission(me.user.role, 'CATALOG_PUBLISH')}
      />
    </main>
  );
}

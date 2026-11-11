import { notFound } from 'next/navigation';
import { roleHasPermission, type ProductAdminDto } from '@bouquet-one/contracts';
import { AdminApiError } from '@/lib/admin-api';
import {
  fetchPackagingAddons,
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

  const [taxonomies, structure, packagingAddons] = await Promise.all([
    fetchProductTaxonomies(),
    fetchProductEditorPickers(),
    fetchPackagingAddons(true),
  ]);

  return (
    <main id="main-content" className="space-y-6">
      <ProductEditor
        product={product}
        justCreated={justCreated}
        options={{
          occasions: taxonomies.occasions.map((item) => ({ id: item.id, name: item.name })),
          holidays: taxonomies.holidays.map((item) => ({ id: item.id, name: item.name })),
          recipients: taxonomies.recipients.map((item) => ({ id: item.id, name: item.name })),
          colors: taxonomies.colors.map((item) => ({
            id: item.id,
            name: item.name,
            swatch: item.swatch,
          })),
          categories: categoryPickerOptions(structure.categories),
          packagingAddons,
        }}
        canUpdate={roleHasPermission(me.user.role, 'CATALOG_UPDATE')}
        canCreate={roleHasPermission(me.user.role, 'CATALOG_CREATE')}
        canPublish={roleHasPermission(me.user.role, 'CATALOG_PUBLISH')}
        canDelete={roleHasPermission(me.user.role, 'CATALOG_DELETE')}
      />
    </main>
  );
}

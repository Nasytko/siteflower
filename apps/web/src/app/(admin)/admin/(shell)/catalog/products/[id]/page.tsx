import { notFound } from 'next/navigation';
import { roleHasPermission, type ProductAdminDto, type TaxonomyAdminDto } from '@bouquet-one/contracts';
import { AdminApiError, adminFetch, fetchAdminMe } from '@/lib/admin-api';
import { ProductEditor } from '@/components/admin/product-editor';

type Props = { params: Promise<{ id: string }> };

export default async function AdminProductEditPage({ params }: Props) {
  const { id } = await params;
  const me = await fetchAdminMe();
  let product: ProductAdminDto;
  try {
    product = await adminFetch<ProductAdminDto>(`/api/v1/admin/catalog/products/${id}`);
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 404) notFound();
    throw error;
  }

  const [categories, occasions, recipients, styles, colors, flowers] = await Promise.all([
    adminFetch<TaxonomyAdminDto[]>('/api/v1/admin/catalog/categories'),
    adminFetch<TaxonomyAdminDto[]>('/api/v1/admin/catalog/occasions'),
    adminFetch<TaxonomyAdminDto[]>('/api/v1/admin/catalog/recipients'),
    adminFetch<TaxonomyAdminDto[]>('/api/v1/admin/catalog/styles'),
    adminFetch<TaxonomyAdminDto[]>('/api/v1/admin/catalog/colors'),
    adminFetch<TaxonomyAdminDto[]>('/api/v1/admin/catalog/flowers'),
  ]);

  return (
    <main id="main-content" className="space-y-6">
      <header>
        <h1 className="admin-page-title">{product.name}</h1>
        <p className="admin-page-lead">
          {product.lifecycle} · {product.slug}
        </p>
      </header>
      <ProductEditor
        product={product}
        taxonomies={{ categories, occasions, recipients, styles, colors, flowers }}
        canUpdate={Boolean(me && roleHasPermission(me.user.role, 'CATALOG_UPDATE'))}
        canPublish={Boolean(me && roleHasPermission(me.user.role, 'CATALOG_PUBLISH'))}
      />
    </main>
  );
}

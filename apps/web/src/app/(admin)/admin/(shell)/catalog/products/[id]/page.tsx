import Link from 'next/link';
import { notFound } from 'next/navigation';
import { roleHasPermission, type ProductAdminDto } from '@bouquet-one/contracts';
import { AdminApiError } from '@/lib/admin-api';
import {
  fetchBestsellerGroups,
  fetchProduct,
  fetchProductTaxonomies,
} from '@/lib/admin-catalog-api';
import { availabilityLabel, lifecycleLabel } from '@/lib/admin-labels';
import { availabilityChipClass, lifecycleChipClass } from '@/lib/admin-status';
import { requireAdminPermission } from '@/lib/admin-page-auth';
import { ProductEditor } from '@/components/admin/product-editor';

type Props = { params: Promise<{ id: string }> };

export default async function AdminProductEditPage({ params }: Props) {
  const { id } = await params;
  const me = await requireAdminPermission('CATALOG_READ');

  let product: ProductAdminDto;
  try {
    product = await fetchProduct(id);
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 404) notFound();
    throw error;
  }

  const [taxonomies, bestsellerGroups] = await Promise.all([
    fetchProductTaxonomies(),
    fetchBestsellerGroups(),
  ]);

  return (
    <main id="main-content" className="space-y-6">
      <header className="space-y-2">
        <Link href="/admin/catalog/products" className="admin-link text-sm">
          ← Все товары
        </Link>
        <h1 className="admin-page-title">{product.name}</h1>
        <div className="admin-status-row">
          <span className={lifecycleChipClass(product.lifecycle)}>
            {lifecycleLabel(product.lifecycle)}
          </span>
          <span className={availabilityChipClass(product.availability)}>
            {availabilityLabel(product.availability)}
          </span>
          <span className="text-sm text-[var(--admin-muted)]">/bukety/{product.slug}</span>
        </div>
      </header>
      <ProductEditor
        product={product}
        options={{
          occasions: taxonomies.occasions.map((item) => ({ id: item.id, name: item.name })),
          recipients: taxonomies.recipients.map((item) => ({ id: item.id, name: item.name })),
          colors: taxonomies.colors.map((item) => ({
            id: item.id,
            name: item.name,
            swatch: item.swatch,
          })),
          flowers: taxonomies.flowers.map((item) => ({ id: item.id, name: item.name })),
          bouquetSizes: taxonomies.bouquetSizes.map((item) => ({ id: item.id, name: item.name })),
          productLines: taxonomies.productLines.map((item) => ({ id: item.id, name: item.name })),
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

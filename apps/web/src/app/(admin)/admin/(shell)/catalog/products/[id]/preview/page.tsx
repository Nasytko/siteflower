import { notFound } from 'next/navigation';
import type { ProductAdminDto } from '@bouquet-one/contracts';
import { AdminApiError, adminFetch } from '@/lib/admin-api';
import { requireAdminPermission } from '@/lib/admin-page-auth';
import { toSameOriginMediaUrl } from '@/lib/media';

type Props = { params: Promise<{ id: string }> };

export default async function ProductPreviewPage({ params }: Props) {
  await requireAdminPermission('CATALOG_READ');
  const { id } = await params;
  let product: ProductAdminDto;
  try {
    product = await adminFetch<ProductAdminDto>(`/api/v1/admin/catalog/products/${id}/preview`);
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 404) notFound();
    throw error;
  }

  const primary = product.media.find((m) => m.isPrimary) ?? product.media[0];
  const primarySrc = primary ? toSameOriginMediaUrl(primary.url) ?? primary.url : null;

  return (
    <main id="main-content" className="mx-auto max-w-3xl space-y-6">
      <p className="text-xs uppercase tracking-wide text-amber-700">Admin preview · {product.lifecycle}</p>
      {primarySrc ? (
        <img src={primarySrc} alt={primary?.alt ?? product.name} className="w-full rounded-lg object-cover" />
      ) : null}
      <h1 className="text-4xl font-semibold text-stone-900">{product.name}</h1>
      <p className="text-xl text-stone-700">{product.price?.label ?? 'Цена не задана'}</p>
      <p className="text-stone-600">{product.shortDescription}</p>
      <div className="prose prose-stone max-w-none whitespace-pre-wrap text-stone-800">
        {product.description}
      </div>
      {product.components.length ? (
        <section>
          <h2 className="text-lg font-medium">Состав</h2>
          <ul className="mt-2 list-disc pl-5 text-stone-700">
            {product.components.map((c) => (
              <li key={c.id}>
                {c.displayName}
                {c.quantity != null ? ` — ${c.quantity}` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

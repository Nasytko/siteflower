import Link from 'next/link';
import { notFound } from 'next/navigation';
import { resolveProductDescription, type ProductAdminDto } from '@bouquet-one/contracts';
import { AdminApiError, adminFetch } from '@/lib/admin-api';
import { adminEndpoints } from '@/lib/admin-endpoints';
import { lifecycleLabel } from '@/lib/admin-labels';
import { requireAdminPermission } from '@/lib/admin-page-auth';
import { toSameOriginMediaUrl } from '@/lib/media';

type Props = { params: Promise<{ id: string }> };

export default async function ProductPreviewPage({ params }: Props) {
  await requireAdminPermission('CATALOG_READ');
  const { id } = await params;
  let product: ProductAdminDto;
  try {
    product = await adminFetch<ProductAdminDto>(adminEndpoints.productPreview(id));
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 404) notFound();
    throw error;
  }

  const primary = product.media.find((m) => m.isPrimary) ?? product.media[0];
  const primarySrc = primary ? toSameOriginMediaUrl(primary.url) ?? primary.url : null;
  const body = resolveProductDescription({
    shortDescription: product.shortDescription,
    description: product.description,
  });

  return (
    <main id="main-content" className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/admin/catalog/products/${id}`} className="admin-link text-sm">
          ← К товару
        </Link>
        <p className="admin-chip admin-chip--warn">
          Упрощённый предпросмотр · {lifecycleLabel(product.lifecycle)}
        </p>
      </div>

      {primarySrc ? (
        <img
          src={primarySrc}
          alt={primary?.alt ?? product.name}
          className="w-full rounded-[var(--admin-radius)] object-cover"
        />
      ) : null}

      <header className="space-y-2">
        <h1 className="admin-page-title">{product.name}</h1>
        <p className="text-xl font-semibold text-[var(--admin-ink)]">
          {product.price?.label ?? 'Цена не задана'}
        </p>
      </header>

      {body ? (
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--admin-muted)]">
          {body}
        </div>
      ) : null}

      {product.components.length ? (
        <section className="admin-card space-y-2">
          <h2 className="admin-section__title">Состав</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--admin-ink)]">
            {product.components.map((c) => (
              <li key={c.id}>{c.displayName}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

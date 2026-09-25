'use client';

import { useEffect, useState } from 'react';
import type { ProductListItemDto } from '@bouquet-one/contracts';
import { EmptyState } from '@/components/storefront/empty-state';
import { ProductGrid } from '@/components/storefront/product-grid';
import { useFavorites } from '@/components/storefront/favorites-provider';
import { PublicApiError } from '@/lib/public-api';

async function fetchProductBySlug(slug: string): Promise<ProductListItemDto | null> {
  try {
    const response = await fetch(`/api/v1/catalog/products/${encodeURIComponent(slug)}`, {
      headers: { Accept: 'application/json' },
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new PublicApiError('Favorites fetch failed', response.status);
    const data = (await response.json()) as {
      product: {
        id: string;
        slug: string;
        name: string;
        availability: ProductListItemDto['availability'];
        featured: boolean;
        heightCm: number | null;
        price: ProductListItemDto['price'];
        variants: Array<{ id: string; name: string; priceMinor: string; sortOrder: number }>;
        media: Array<{ url: string; isPrimary: boolean }>;
        categories: ProductListItemDto['categories'];
      };
      canonicalSlug: string;
    };
    const product = data.product;
    const primary = product.media.find((m) => m.isPrimary) ?? product.media[0];
    const cheapest = [...product.variants].sort((a, b) => {
      const byOrder = a.sortOrder - b.sortOrder;
      if (byOrder !== 0) return byOrder;
      return Number(a.priceMinor) - Number(b.priceMinor);
    })[0];
    return {
      id: product.id,
      slug: data.canonicalSlug || product.slug,
      name: product.name,
      lifecycle: 'PUBLISHED',
      availability: product.availability,
      featured: product.featured,
      heightCm: product.heightCm ?? null,
      price: product.price,
      defaultVariant: cheapest
        ? { id: cheapest.id, name: cheapest.name, priceMinor: cheapest.priceMinor }
        : null,
      primaryImageUrl: primary?.url ?? null,
      categories: product.categories,
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function FavoritesView() {
  const { state, ready } = useFavorites();
  const [products, setProducts] = useState<ProductListItemDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      if (state.items.length === 0) {
        if (!cancelled) {
          setProducts([]);
          setLoading(false);
        }
        return;
      }

      const results = await Promise.all(state.items.map((item) => fetchProductBySlug(item.slug)));
      if (cancelled) return;

      const byId = new Map(
        results.filter((p): p is ProductListItemDto => Boolean(p)).map((p) => [p.id, p]),
      );
      const ordered = state.items
        .map((item) => byId.get(item.productId))
        .filter((p): p is ProductListItemDto => Boolean(p));
      setProducts(ordered);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [ready, state.items]);

  if (!ready || loading) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4" aria-busy="true">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="sf-skeleton aspect-[4/5] rounded-[var(--radius-md)]" />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <EmptyState
        title="Здесь пока пусто"
        description="Сохраняйте букеты сердечком — они появятся на этой странице."
        actionHref="/bukety"
        actionLabel="Открыть каталог"
      />
    );
  }

  return <ProductGrid products={products} priorityCount={0} />;
}

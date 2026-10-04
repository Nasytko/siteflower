'use client';

import { useEffect, useState } from 'react';
import type { ProductListItemDto, ProductResolveDto } from '@bouquet-one/contracts';
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
    const data = (await response.json()) as ProductResolveDto;
    const product = data.product;
    const primary = product.media.find((m) => m.isPrimary) ?? product.media[0];
    // Cheapest active variant, priced at its effective (post-promotion) amount.
    const cheapest = [...product.variants].sort((a, b) => {
      const byOrder = a.sortOrder - b.sortOrder;
      if (byOrder !== 0) return byOrder;
      return Number(a.effectivePriceMinor) - Number(b.effectivePriceMinor);
    })[0];
    return {
      id: product.id,
      slug: data.canonicalSlug || product.slug,
      name: product.name,
      lifecycle: 'PUBLISHED',
      availability: product.availability,
      version: 0,
      heightCm: product.heightCm ?? null,
      bouquetSize: product.bouquetSize,
      catalogCategory: product.catalogCategory,
      flowerType: product.flowerType,
      flowerVariety: product.flowerVariety,
      flowerOrigin: product.flowerOrigin,
      family: product.family
        ? { id: product.family.id, name: product.family.name }
        : null,
      cardSubtitle: product.cardSubtitle,
      price: product.price,
      promotion: product.promotion,
      defaultVariant: cheapest
        ? { id: cheapest.id, name: cheapest.name, priceMinor: cheapest.effectivePriceMinor }
        : null,
      primaryImageUrl: primary?.url ?? null,
      flowers: product.flowers,
      colors: product.colors,
      productLines: product.productLines,
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
          <div key={index} className="sf-skeleton aspect-[4/5] rounded-[var(--radius-lg)]" />
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

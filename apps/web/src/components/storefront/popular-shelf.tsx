'use client';

import { useMemo, useState } from 'react';
import type { ProductListItemDto } from '@bouquet-one/contracts';
import { HomeSectionHead } from './home-section-head';
import { ProductRow } from './product-row';

type TabId = 'all' | 'new' | 'authorial' | 'budget';

type Props = {
  title: string;
  viewAllHref: string;
  products: ProductListItemDto[];
  authorialProducts?: ProductListItemDto[];
  limit?: number;
};

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'new', label: 'Новинки' },
  { id: 'authorial', label: 'Авторские' },
  { id: 'budget', label: 'До 100 BYN' },
];

function priceMinor(product: ProductListItemDto): number {
  const raw =
    product.promotion?.salePrice?.minMinor ??
    product.price?.minMinor ??
    product.defaultVariant?.priceMinor ??
    null;
  if (raw == null) return Number.POSITIVE_INFINITY;
  const n = Number(raw);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

export function PopularShelf({
  title,
  viewAllHref,
  products,
  authorialProducts = [],
  limit = 10,
}: Props) {
  const [tab, setTab] = useState<TabId>('all');

  const byTab = useMemo<Record<TabId, ProductListItemDto[]>>(
    () => ({
      all: products.slice(0, limit),
      new: [...products].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit),
      authorial: authorialProducts.slice(0, limit),
      budget: products.filter((item) => priceMinor(item) <= 10_000).slice(0, limit),
    }),
    [products, authorialProducts, limit],
  );
  const tabs = TABS.filter((item) => item.id === 'all' || byTab[item.id].length > 0);
  const visible = byTab[tab];

  if (products.length === 0) return null;

  return (
    <section className="sf-home-shelf">
      <div className="sf-container-wide">
        <HomeSectionHead title={title} href={viewAllHref}>
          <div className="sf-popular-tabs" role="tablist" aria-label="Фильтр букетов">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={`sf-popular-tab ${tab === item.id ? 'sf-popular-tab--active' : ''}`}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </HomeSectionHead>
        {visible.length > 0 ? (
          <ProductRow products={visible} scrollOnMobile={false} />
        ) : (
          <p className="sf-body mt-4 text-muted">В этой выборке пока нет товаров.</p>
        )}
      </div>
    </section>
  );
}

'use client';

import { useMemo, useState } from 'react';
import type { ProductListItemDto } from '@bouquet-one/contracts';
import { ProductRow } from './product-row';
import { SectionRail } from './section-rail';

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

  const visible = useMemo(() => {
    if (tab === 'authorial') {
      const source = authorialProducts.length > 0 ? authorialProducts : products;
      return source.slice(0, limit);
    }
    if (tab === 'new') {
      return [...products]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, limit);
    }
    if (tab === 'budget') {
      return products.filter((item) => priceMinor(item) <= 10_000).slice(0, limit);
    }
    return products.slice(0, limit);
  }, [tab, products, authorialProducts, limit]);

  if (products.length === 0 && authorialProducts.length === 0) return null;

  return (
    <section className="py-10 md:py-14">
      <div className="sf-container-wide">
        <div className="sf-popular-head">
          <SectionRail title={title} href={viewAllHref} linkLabel="Смотреть все" />
          <div className="sf-popular-tabs" role="tablist" aria-label="Фильтр букетов">
            {TABS.map((item) => (
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
        </div>
        {visible.length > 0 ? (
          <ProductRow products={visible} scrollOnMobile={false} />
        ) : (
          <p className="sf-body mt-4 text-muted">В этой выборке пока нет товаров.</p>
        )}
      </div>
    </section>
  );
}

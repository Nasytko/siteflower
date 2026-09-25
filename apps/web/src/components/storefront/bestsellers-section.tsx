'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ProductListItemDto } from '@bouquet-one/contracts';
import { ProductGrid } from './product-grid';

type Tab = {
  id: string;
  label: string;
  /** Match against category name/slug substrings (lowercase). */
  match?: string[];
};

const TABS: Tab[] = [
  { id: 'all', label: 'Букеты' },
  { id: 'rozy', label: 'Моно букеты Роза', match: ['роз', 'rozy'] },
  { id: 'box', label: 'Композиции в коробке', match: ['короб', 'box', 'композ'] },
  { id: 'piony', label: 'Моно букеты Пион', match: ['пион', 'piony'] },
  { id: 'eustoma', label: 'Моно букеты Эустома', match: ['эустом', 'eustom'] },
];

type Props = {
  products: ProductListItemDto[];
};

export function BestsellersSection({ products }: Props) {
  const [tabId, setTabId] = useState('all');

  const filtered = useMemo(() => {
    const tab = TABS.find((t) => t.id === tabId) ?? TABS[0];
    if (!tab?.match?.length) return products;
    const needles = tab.match;
    return products.filter((product) =>
      product.categories.some((cat) => {
        const hay = `${cat.name} ${cat.slug}`.toLowerCase();
        return needles.some((n) => hay.includes(n));
      }),
    );
  }, [products, tabId]);

  const shown = filtered.length > 0 ? filtered : products;

  return (
    <section className="sf-container-wide py-12 md:py-16">
      <div className="sf-section-title">
        <h2 className="sf-h2">Наши бестселлеры</h2>
      </div>

      <div
        className="mb-8 flex gap-1 overflow-x-auto pb-1"
        role="tablist"
        aria-label="Тип букета"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className="sf-tab"
            aria-selected={tabId === tab.id}
            data-active={tabId === tab.id}
            onClick={() => setTabId(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <ProductGrid products={shown.slice(0, 8)} />

      <div className="mt-10 text-center">
        <Link href="/bukety" className="sf-cta-ghost">
          Смотреть все букеты
        </Link>
      </div>
    </section>
  );
}

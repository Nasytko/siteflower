'use client';

import { useEffect, useState } from 'react';
import type { ProductPlacementDto, ProductPlacementStatus } from '@bouquet-one/contracts';
import { adminGet } from '@/lib/admin-client';
import { adminEndpoints } from '@/lib/admin-endpoints';

type Props = {
  productId: string;
  /** Bump after save/publish to refresh placements. */
  refreshKey?: string | number;
};

function statusLabel(status: ProductPlacementStatus): string {
  switch (status) {
    case 'LIVE':
      return 'На витрине';
    case 'DRAFT_LANDING':
      return 'Подборка не опубликована';
    case 'DRAFT_PRODUCT':
      return 'Товар не опубликован';
    case 'HIDDEN':
      return 'Скрыто';
    case 'EXCLUDED':
      return 'Исключён';
    default:
      return status;
  }
}

function statusClass(status: ProductPlacementStatus): string {
  switch (status) {
    case 'LIVE':
      return 'text-emerald-700';
    case 'DRAFT_LANDING':
    case 'DRAFT_PRODUCT':
      return 'text-amber-700';
    case 'HIDDEN':
    case 'EXCLUDED':
      return 'text-[var(--admin-muted)]';
    default:
      return 'text-[var(--admin-muted)]';
  }
}

function kindLabel(kind: ProductPlacementDto['entries'][number]['kind']): string {
  switch (kind) {
    case 'HUB':
      return 'Раздел каталога';
    case 'GIFT_SUBTYPE':
      return 'Подтип подарка';
    case 'SEO_LANDING':
      return 'SEO-подборка';
    default:
      return kind;
  }
}

/**
 * Read-only «Где отображается товар» — only factual pages (hub, gift leaf, SEO landings
 * that already include this product). Never invents potential matches.
 */
export function ProductPlacementPanel({ productId, refreshKey }: Props) {
  const [data, setData] = useState<ProductPlacementDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void adminGet<ProductPlacementDto>(adminEndpoints.productPlacement(productId))
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setError('Не удалось загрузить размещения');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, refreshKey]);

  return (
    <div className="admin-subsection max-w-2xl space-y-3" data-section="placement">
      <h3 className="admin-subsection__title">Где отображается товар</h3>
      <p className="text-sm text-[var(--admin-muted)]">
        Автоматически: раздел по типу товара, подтип подарка и SEO-подборки, в которые товар уже
        входит. Потенциальные совпадения не показываются.
      </p>

      {loading ? (
        <p className="text-sm text-[var(--admin-muted)]">Загрузка…</p>
      ) : error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : !data || data.entries.length === 0 ? (
        <p className="text-sm text-[var(--admin-muted)]">Пока нет подтверждённых страниц.</p>
      ) : (
        <ul className="space-y-2">
          {data.entries.map((entry) => (
            <li
              key={`${entry.kind}:${entry.path}`}
              className="flex flex-wrap items-baseline justify-between gap-2 rounded border border-[var(--admin-border)] px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium text-[var(--admin-ink)]">{entry.title}</p>
                <p className="text-xs text-[var(--admin-muted)]">
                  {kindLabel(entry.kind)} ·{' '}
                  <a href={entry.path} className="admin-link" target="_blank" rel="noreferrer">
                    {entry.path}
                  </a>
                </p>
                {entry.note ? (
                  <p className="mt-0.5 text-xs text-[var(--admin-muted)]">{entry.note}</p>
                ) : null}
              </div>
              <span className={`shrink-0 text-xs font-semibold ${statusClass(entry.status)}`}>
                {statusLabel(entry.status)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

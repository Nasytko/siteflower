'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  ProductPlacementDto,
  ProductPlacementEntryDto,
  ProductPlacementSection,
  ProductPlacementStatus,
} from '@bouquet-one/contracts';
import { adminGet } from '@/lib/admin-client';
import { adminEndpoints } from '@/lib/admin-endpoints';

type Props = {
  productId: string;
  /** Bump after save/publish to refresh placements. */
  refreshKey?: string | number;
};

const SECTION_ORDER: ProductPlacementSection[] = [
  'main',
  'published',
  'draft',
  'recommended',
];

function sectionTitle(section: ProductPlacementSection): string {
  switch (section) {
    case 'main':
      return 'Основной раздел';
    case 'published':
      return 'Опубликованные SEO-подборки';
    case 'draft':
      return 'Подходящие черновики и исключения';
    case 'recommended':
      return 'Рекомендуемые страницы';
    default:
      return section;
  }
}

function statusLabel(status: ProductPlacementStatus): string {
  switch (status) {
    case 'LIVE':
      return 'На сайте';
    case 'DRAFT_LANDING':
      return 'Не опубликовано';
    case 'DRAFT_PRODUCT':
      return 'Товар не опубликован';
    case 'HIDDEN':
      return 'Скрыто';
    case 'EXCLUDED':
      return 'Исключён';
    case 'MISSING':
      return 'Страница не создана';
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
    case 'MISSING':
      return 'text-amber-800';
    case 'HIDDEN':
    case 'EXCLUDED':
      return 'text-[var(--admin-muted)]';
    default:
      return 'text-[var(--admin-muted)]';
  }
}

function PlacementRow({ entry }: { entry: ProductPlacementEntryDto }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="font-medium text-[var(--admin-ink)]">{entry.title}</p>
        {entry.path ? (
          <p className="text-xs text-[var(--admin-muted)]">
            <a href={entry.path} className="admin-link" target="_blank" rel="noreferrer">
              {entry.path}
            </a>
            {entry.landingId ? (
              <>
                {' · '}
                <a href="/admin/seo/landings" className="admin-link">
                  Открыть SEO-подборки
                </a>
              </>
            ) : null}
          </p>
        ) : (
          <p className="text-xs text-[var(--admin-muted)]">
            {entry.note ?? 'Страница ещё не создана — товар на ней не размещён'}
          </p>
        )}
        {entry.matchReason ? (
          <p className="text-xs text-[var(--admin-muted)]">{entry.matchReason}</p>
        ) : null}
      </div>
      <span className={`shrink-0 text-xs font-semibold ${statusClass(entry.status)}`}>
        {statusLabel(entry.status)}
      </span>
    </li>
  );
}

/**
 * «Где отображается товар» — hub, matching SEO landings, draft matches,
 * and reliable missing-page recommendations only.
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

  const grouped = useMemo(() => {
    const map = new Map<ProductPlacementSection, ProductPlacementEntryDto[]>();
    for (const section of SECTION_ORDER) map.set(section, []);
    for (const entry of data?.entries ?? []) {
      const list = map.get(entry.section) ?? [];
      list.push(entry);
      map.set(entry.section, list);
    }
    return SECTION_ORDER.map((section) => ({
      section,
      entries: map.get(section) ?? [],
    })).filter((group) => group.entries.length > 0);
  }, [data]);

  return (
    <div className="admin-subsection max-w-2xl space-y-4" data-section="placement">
      <div>
        <h3 className="admin-subsection__title">Где отображается товар</h3>
        <p className="text-sm text-[var(--admin-muted)]">
          Основной раздел — по типу товара. SEO-подборки — по правилам состава. Рекомендации не
          означают, что товар уже размещён.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--admin-muted)]">Загрузка…</p>
      ) : error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : grouped.length === 0 ? (
        <p className="text-sm text-[var(--admin-muted)]">Пока нет подтверждённых страниц.</p>
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => (
            <div key={group.section}>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--admin-muted)]">
                {sectionTitle(group.section)}
              </p>
              <ul className="divide-y divide-[var(--admin-border)]">
                {group.entries.map((entry) => (
                  <PlacementRow
                    key={`${entry.kind}:${entry.path ?? entry.title}:${entry.status}`}
                    entry={entry}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

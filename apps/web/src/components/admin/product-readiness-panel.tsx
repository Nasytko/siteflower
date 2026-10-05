'use client';

import type { ProductEditorReadinessItem } from '@bouquet-one/contracts';

type Props = {
  items: ProductEditorReadinessItem[];
  readyToPublish: boolean;
  blockingLabels: string[];
  compact?: boolean;
};

export function ProductReadinessPanel({
  items,
  readyToPublish,
  blockingLabels,
  compact = false,
}: Props) {
  return (
    <div
      className={`rounded-lg border border-[var(--admin-border)] ${
        compact ? 'px-3 py-2' : 'p-3'
      }`}
    >
      <p className="text-sm font-semibold">
        {readyToPublish ? 'Готово к публикации' : 'Готовность товара'}
      </p>
      {!readyToPublish && blockingLabels.length > 0 ? (
        <p className="mt-1 text-xs text-[var(--admin-muted)]">
          До публикации осталось: {blockingLabels.length} —{' '}
          {blockingLabels.map((label) => label).join(', ')}
        </p>
      ) : null}
      <ul className={`mt-2 flex flex-wrap gap-x-3 gap-y-1 ${compact ? 'text-xs' : 'text-sm'}`}>
        {items.map((item) => (
          <li key={item.id} className={item.ok ? 'text-[var(--admin-ink)]' : 'text-amber-800'}>
            {item.ok ? '✓' : '○'} {item.label}
            {!item.requiredForPublish && !item.ok ? (
              <span className="text-[var(--admin-muted)]"> (желательно)</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

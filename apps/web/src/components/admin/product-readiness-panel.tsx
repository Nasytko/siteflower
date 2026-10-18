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
      className={`admin-card ${readyToPublish ? 'admin-verdict--ok' : ''} ${
        compact ? '!px-3 !py-2' : ''
      }`}
    >
      <p className="text-sm font-semibold text-[var(--admin-ink)]">
        {readyToPublish ? 'Готово к публикации' : 'Готовность товара'}
        <span
          className="admin-tip"
          tabIndex={0}
          data-tip="Галочки показывают, чего не хватает для публикации на витрине. Желательные поля можно оставить пустыми."
          aria-label="Подсказка о готовности"
        >
          ?
        </span>
      </p>
      {!readyToPublish && blockingLabels.length > 0 ? (
        <p className="mt-1 text-xs text-[var(--admin-muted)]">
          До публикации осталось: {blockingLabels.length} —{' '}
          {blockingLabels.map((label) => label).join(', ')}
        </p>
      ) : null}
      <ul className={`mt-2 flex flex-wrap gap-x-3 gap-y-1 ${compact ? 'text-xs' : 'text-sm'}`}>
        {items.map((item) => (
          <li
            key={item.id}
            className={item.ok ? 'text-[var(--admin-ink)]' : 'font-medium text-amber-900'}
          >
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

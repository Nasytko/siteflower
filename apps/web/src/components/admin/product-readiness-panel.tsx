'use client';

type ReadinessIssue = { id: string; label: string };

type Props = {
  readyToPublish: boolean;
  /** Blocking issues (required for publish). */
  issues: ReadinessIssue[];
  /** Non-blocking recommendations (optional). */
  recommendations?: ReadinessIssue[];
  onJump?: (issueId: string) => void;
  /** Compact chips for the editor header. */
  compact?: boolean;
};

export function ProductReadinessPanel({
  readyToPublish,
  issues,
  recommendations = [],
  onJump,
  compact = false,
}: Props) {
  if (compact) {
    const missing = issues.length;
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {readyToPublish ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800">
            Готов к публикации
          </span>
        ) : (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-900">
            Не хватает: {missing}
          </span>
        )}
        {issues.slice(0, 3).map((issue) => (
          <button
            key={issue.id}
            type="button"
            className="admin-link"
            onClick={() => onJump?.(issue.id)}
          >
            {issue.label}
          </button>
        ))}
        {issues.length > 3 ? (
          <span className="text-[var(--admin-muted)]">+{issues.length - 3}</span>
        ) : null}
        {recommendations.length > 0 ? (
          <span className="text-[var(--admin-muted)]" title={recommendations.map((r) => r.label).join(', ')}>
            · рекомендации: {recommendations.length}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      {readyToPublish ? (
        <p className="font-medium text-emerald-800">Обязательные поля заполнены</p>
      ) : (
        <p className="font-medium text-amber-900">Для публикации нужно:</p>
      )}
      {issues.length > 0 ? (
        <ul className="space-y-1">
          {issues.map((issue) => (
            <li key={issue.id} className="text-amber-900">
              ○ {issue.label}
              {onJump ? (
                <>
                  {' '}
                  <button
                    type="button"
                    className="admin-link text-xs font-normal"
                    onClick={() => onJump(issue.id)}
                  >
                    перейти
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {recommendations.length > 0 ? (
        <div className="pt-1">
          <p className="text-xs font-medium text-[var(--admin-muted)]">Рекомендации (не блокируют)</p>
          <ul className="mt-1 space-y-1 text-[var(--admin-muted)]">
            {recommendations.map((item) => (
              <li key={item.id}>○ {item.label}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

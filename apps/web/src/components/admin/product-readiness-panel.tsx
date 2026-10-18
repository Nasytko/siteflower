'use client';

type ReadinessIssue = { id: string; label: string };

type Props = {
  readyToPublish: boolean;
  issues: ReadinessIssue[];
  onJump?: (issueId: string) => void;
};

export function ProductReadinessPanel({ readyToPublish, issues, onJump }: Props) {
  if (readyToPublish) {
    return (
      <div className="admin-card admin-verdict--ok !px-3 !py-2">
        <p className="text-sm font-semibold text-[var(--admin-ink)]">Готово к публикации</p>
      </div>
    );
  }

  return (
    <div className="admin-card !px-3 !py-2">
      <p className="text-sm font-semibold text-[var(--admin-ink)]">Готовность товара</p>
      {issues.length > 0 ? (
        <ul className="mt-2 space-y-1 text-sm">
          {issues.map((issue) => (
            <li key={issue.id} className="font-medium text-amber-900">
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
      ) : (
        <p className="mt-1 text-xs text-[var(--admin-muted)]">Проверьте обязательные поля.</p>
      )}
    </div>
  );
}

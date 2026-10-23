type Relation = {
  code: string;
  message: string;
};

type Props = {
  title: string;
  lead?: string;
  blockers: Relation[];
  detachable?: Relation[];
  canDelete: boolean;
  confirmName: string;
  expectedName: string;
  onConfirmNameChange: (value: string) => void;
  onConfirm: () => void;
  pending?: boolean;
  archiveHint?: string;
};

/** Shared delete UX: blockers, detachable links, typed confirm, archive fallback. */
export function AdminDeletePanel({
  title,
  lead,
  blockers,
  detachable = [],
  canDelete,
  confirmName,
  expectedName,
  onConfirmNameChange,
  onConfirm,
  pending = false,
  archiveHint = 'Физическое удаление недоступно — архивируйте запись.',
}: Props) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-[var(--admin-ink)]">{title}</h2>
        {lead ? <p className="mt-1 text-sm text-[var(--admin-muted)]">{lead}</p> : null}
      </div>
      {blockers.map((row) => (
        <p key={row.code} className="admin-field-error">
          {row.message}
        </p>
      ))}
      {detachable.map((row) => (
        <p key={row.code} className="admin-help">
          {row.message}
        </p>
      ))}
      {canDelete ? (
        <>
          <label className="admin-field">
            <span>Введите название «{expectedName}»</span>
            <input
              className="admin-input"
              value={confirmName}
              onChange={(event) => onConfirmNameChange(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="admin-btn-ghost"
            disabled={pending || confirmName.trim() !== expectedName.trim()}
            onClick={onConfirm}
          >
            Удалить навсегда
          </button>
        </>
      ) : (
        <p className="admin-help">{archiveHint}</p>
      )}
    </div>
  );
}

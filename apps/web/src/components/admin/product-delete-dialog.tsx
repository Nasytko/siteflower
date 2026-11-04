'use client';

import { AdminDeletePanel } from '@/components/admin/admin-delete-panel';

type Relation = {
  code: string;
  message: string;
};

type Props = {
  open: boolean;
  productName: string;
  loading?: boolean;
  pending?: boolean;
  blockers: Relation[];
  detachable: Relation[];
  canDelete: boolean;
  confirmName: string;
  onConfirmNameChange: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
  onArchive?: () => void;
};

/** Modal delete UX shared by product list and product editor. */
export function ProductDeleteDialog({
  open,
  productName,
  loading = false,
  pending = false,
  blockers,
  detachable,
  canDelete,
  confirmName,
  onConfirmNameChange,
  onConfirm,
  onClose,
  onArchive,
}: Props) {
  if (!open) return null;

  return (
    <div className="sf-ap-create" role="presentation" onClick={onClose}>
      <div
        className="sf-ap-create__panel sf-pe-delete"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sf-pe-delete-title"
        onClick={(event) => event.stopPropagation()}
      >
        {loading ? (
          <p className="admin-help">Проверяем связи…</p>
        ) : (
          <AdminDeletePanel
            title="Удалить товар навсегда"
            lead={`«${productName}». Если есть заказы — удаление запрещено, лучше архив.`}
            blockers={blockers}
            detachable={detachable}
            canDelete={canDelete}
            confirmName={confirmName}
            expectedName={productName}
            onConfirmNameChange={onConfirmNameChange}
            onConfirm={onConfirm}
            pending={pending}
            archiveHint="Удалить нельзя — отправьте товар в архив."
          />
        )}
        <div className="sf-pe-delete__actions" id="sf-pe-delete-title">
          {!canDelete && onArchive && !loading ? (
            <button
              type="button"
              className="sf-pe-btn sf-pe-btn--primary"
              disabled={pending}
              onClick={onArchive}
            >
              В архив
            </button>
          ) : null}
          <button
            type="button"
            className="sf-pe-btn sf-pe-btn--quiet"
            disabled={pending}
            onClick={onClose}
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

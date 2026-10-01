'use client';

import type { AdminErrorKind, AdminRequestError } from '@/lib/admin-client';

export type FormSavePhase =
  | 'idle'
  | 'dirty'
  | 'saving'
  | 'saved'
  | 'validation'
  | 'conflict'
  | 'server'
  | 'network';

type FormSaveStatusProps = {
  phase: FormSavePhase;
  savedLabel?: string | null;
  errorMessage?: string | null;
  requestId?: string | null;
  onRetry?: () => void;
  onRefresh?: () => void;
  onDismiss?: () => void;
};

export function phaseFromAdminError(error: AdminRequestError): FormSavePhase {
  switch (error.kind as AdminErrorKind) {
    case 'validation':
      return 'validation';
    case 'conflict':
      return 'conflict';
    case 'network':
      return 'network';
    case 'server':
    case 'rate_limit':
      return 'server';
    default:
      return 'server';
  }
}

export function FormSaveStatus({
  phase,
  savedLabel,
  errorMessage,
  requestId,
  onRetry,
  onRefresh,
  onDismiss,
}: FormSaveStatusProps) {
  if (phase === 'idle' && !savedLabel) return null;

  if (phase === 'dirty') {
    return (
      <p className="admin-form-status admin-form-status--dirty" role="status">
        ● Есть несохранённые изменения
      </p>
    );
  }

  if (phase === 'saving') {
    return (
      <p className="admin-form-status admin-form-status--saving" role="status" aria-live="polite">
        ◌ Сохранение…
      </p>
    );
  }

  if (phase === 'saved') {
    return (
      <p className="admin-form-status admin-form-status--success" role="status" aria-live="polite">
        ✓ {savedLabel ?? 'Изменения сохранены'}
        {savedLabel && savedLabel.includes(':') ? null : null}
      </p>
    );
  }

  if (phase === 'validation' || phase === 'conflict' || phase === 'server' || phase === 'network') {
    const title =
      phase === 'validation'
        ? 'Не удалось сохранить изменения'
        : phase === 'conflict'
          ? 'Изменения не сохранены'
          : phase === 'network'
            ? 'Нет связи с сервером'
            : 'Не удалось сохранить изменения';

    return (
      <div
        className={`admin-form-status admin-form-status--error admin-form-status--${phase}`}
        role="alert"
      >
        <p className="admin-form-status__title">⚠ {title}</p>
        {errorMessage ? <p className="admin-form-status__body">{errorMessage}</p> : null}
        {phase === 'conflict' && /другим пользователем/i.test(errorMessage ?? '') ? (
          <p className="admin-form-status__hint">
            Данные были изменены в другой вкладке или другим пользователем.
          </p>
        ) : null}
        {phase === 'server' && requestId ? (
          <p className="admin-form-status__hint">Код запроса: {requestId}</p>
        ) : null}
        <div className="admin-form-status__actions">
          {phase === 'conflict' && onRefresh ? (
            <button type="button" className="admin-btn-ghost" onClick={onRefresh}>
              Обновить данные
            </button>
          ) : null}
          {(phase === 'server' || phase === 'network') && onRetry ? (
            <button type="button" className="admin-btn-ghost" onClick={onRetry}>
              Повторить
            </button>
          ) : null}
          {onDismiss ? (
            <button type="button" className="admin-btn-ghost" onClick={onDismiss}>
              Закрыть
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (savedLabel) {
    return (
      <p className="admin-form-status admin-form-status--success" role="status">
        ✓ {savedLabel}
      </p>
    );
  }

  return null;
}

type FormErrorSummaryProps = {
  message: string;
  issues?: Array<{ field?: string; message: string }>;
};

export function FormErrorSummary({ message, issues }: FormErrorSummaryProps) {
  return (
    <div className="admin-form-summary" role="alert">
      <p className="admin-form-summary__title">Проверьте данные</p>
      <p className="admin-form-summary__body">{message}</p>
      {issues && issues.length > 0 ? (
        <ul className="admin-form-summary__list">
          {issues.map((issue, index) => (
            <li key={`${issue.field ?? 'x'}-${index}`}>{issue.message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type FieldErrorProps = {
  message?: string | null;
};

export function FieldError({ message }: FieldErrorProps) {
  if (!message) return null;
  return (
    <p className="admin-field-error" role="alert">
      ⚠ {message}
    </p>
  );
}

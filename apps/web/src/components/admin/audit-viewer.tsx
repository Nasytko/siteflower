'use client';

import Link from 'next/link';
import type { AuditLogListResponse } from '@bouquet-one/contracts';

const ACTIONS: Array<{ id: string; label: string }> = [
  { id: 'LOGIN_SUCCESS', label: 'Вход' },
  { id: 'LOGIN_FAILURE', label: 'Неудачный вход' },
  { id: 'LOGOUT', label: 'Выход' },
  { id: 'LOGOUT_ALL', label: 'Выход везде' },
  { id: 'ADMIN_USER_CREATED', label: 'Создан пользователь' },
  { id: 'ADMIN_USER_UPDATED', label: 'Изменён пользователь' },
  { id: 'ADMIN_USER_DISABLED', label: 'Отключён пользователь' },
  { id: 'ADMIN_USER_ENABLED', label: 'Включён пользователь' },
  { id: 'ADMIN_PASSWORD_RESET', label: 'Сброс пароля' },
];

const ACTION_LABELS = Object.fromEntries(ACTIONS.map((item) => [item.id, item.label]));

function entityTypeLabel(value: string | null | undefined): string {
  if (!value) return '—';
  switch (value) {
    case 'ADMIN_USER':
      return 'Пользователь';
    case 'PRODUCT':
      return 'Товар';
    case 'ORDER':
      return 'Заказ';
    default:
      return value;
  }
}

export function AuditViewer({
  initial,
  currentAction,
}: {
  initial: AuditLogListResponse;
  currentAction?: string;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/audit"
          className={`admin-filter-chip ${!currentAction ? 'admin-filter-chip--active' : ''}`}
        >
          Все
        </Link>
        {ACTIONS.map((action) => (
          <Link
            key={action.id}
            href={`/admin/audit?action=${action.id}`}
            className={`admin-filter-chip ${
              currentAction === action.id ? 'admin-filter-chip--active' : ''
            }`}
          >
            {action.label}
          </Link>
        ))}
      </div>

      {initial.items.length === 0 ? (
        <div className="admin-panel">
          <p className="admin-empty">Записей по выбранному фильтру пока нет.</p>
        </div>
      ) : (
        <div className="admin-panel overflow-x-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Время</th>
                <th>Актор</th>
                <th>Действие</th>
                <th>Сущность</th>
                <th>Детали</th>
              </tr>
            </thead>
            <tbody>
              {initial.items.map((item) => (
                <tr key={item.id}>
                  <td className="whitespace-nowrap">
                    {new Date(item.createdAt).toLocaleString('ru-BY')}
                  </td>
                  <td>
                    {item.actorDisplayName ?? '—'}
                    <div className="text-xs text-[var(--admin-muted)]">{item.actorEmail}</div>
                  </td>
                  <td>
                    <span className="admin-chip admin-chip--muted">
                      {ACTION_LABELS[item.action] ?? item.action}
                    </span>
                  </td>
                  <td>
                    {entityTypeLabel(item.entityType)}
                    {item.entityId ? (
                      <details className="text-xs text-[var(--admin-muted)]">
                        <summary>ID</summary>
                        {item.entityId}
                      </details>
                    ) : null}
                  </td>
                  <td className="text-xs text-[var(--admin-muted)]">
                    {item.requestId ? (
                      <details>
                        <summary>Код запроса</summary>
                        <span className="font-mono">{item.requestId}</span>
                      </details>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-sm text-[var(--admin-muted)]">
            Показано {initial.items.length}
            {initial.total != null ? ` из ${initial.total}` : ''}
          </p>
        </div>
      )}
    </div>
  );
}

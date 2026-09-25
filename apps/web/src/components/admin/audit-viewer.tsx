'use client';

import Link from 'next/link';
import type { AuditLogListResponse } from '@bouquet-one/contracts';

const ACTIONS = [
  'LOGIN_SUCCESS',
  'LOGIN_FAILURE',
  'LOGOUT',
  'LOGOUT_ALL',
  'ADMIN_USER_CREATED',
  'ADMIN_USER_UPDATED',
  'ADMIN_USER_DISABLED',
  'ADMIN_USER_ENABLED',
  'ADMIN_PASSWORD_RESET',
];

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
            key={action}
            href={`/admin/audit?action=${action}`}
            className={`admin-filter-chip ${
              currentAction === action ? 'admin-filter-chip--active' : ''
            }`}
          >
            {action}
          </Link>
        ))}
      </div>

      {initial.items.length === 0 ? (
        <div className="admin-panel">
          <p className="admin-empty">Записей пока нет.</p>
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
                <th>Request ID</th>
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
                    <span className="admin-chip">{item.action}</span>
                  </td>
                  <td>
                    {item.entityType}
                    {item.entityId ? (
                      <div className="text-xs text-[var(--admin-muted)]">{item.entityId}</div>
                    ) : null}
                  </td>
                  <td className="font-mono text-xs text-[var(--admin-muted)]">
                    {item.requestId ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

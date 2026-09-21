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
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Link href="/admin/audit" className="rounded-md border px-3 py-1.5 text-sm">
          Все
        </Link>
        {ACTIONS.map((action) => (
          <Link
            key={action}
            href={`/admin/audit?action=${action}`}
            className={`rounded-md border px-3 py-1.5 text-sm ${currentAction === action ? 'bg-stone-900 text-white' : ''}`}
          >
            {action}
          </Link>
        ))}
      </div>

      {initial.items.length === 0 ? (
        <p className="text-stone-600">Записей пока нет.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-stone-600">
              <tr>
                <th className="px-4 py-3 font-medium">Время</th>
                <th className="px-4 py-3 font-medium">Актор</th>
                <th className="px-4 py-3 font-medium">Действие</th>
                <th className="px-4 py-3 font-medium">Сущность</th>
                <th className="px-4 py-3 font-medium">Request ID</th>
              </tr>
            </thead>
            <tbody>
              {initial.items.map((item) => (
                <tr key={item.id} className="border-b border-stone-100 align-top">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {new Date(item.createdAt).toLocaleString('ru-BY')}
                  </td>
                  <td className="px-4 py-3">
                    {item.actorDisplayName ?? '—'}
                    <div className="text-xs text-stone-500">{item.actorEmail}</div>
                  </td>
                  <td className="px-4 py-3">{item.action}</td>
                  <td className="px-4 py-3">
                    {item.entityType}
                    {item.entityId ? (
                      <div className="text-xs text-stone-500">{item.entityId}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{item.requestId ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

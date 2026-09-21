'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminUserListResponse, AdminUserPublic } from '@bouquet-one/contracts';
import { ADMIN_ROLES } from '@bouquet-one/contracts';
import { Button } from '@bouquet-one/ui';

type Props = {
  initial: AdminUserListResponse;
  currentUserId: string;
  permissions: {
    create: boolean;
    update: boolean;
    disable: boolean;
    resetPassword: boolean;
  };
};

async function mutate(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      origin: window.location.origin,
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? `Request failed (${response.status})`);
  }
  return response.json().catch(() => null);
}

export function UsersManager({ initial, permissions, currentUserId }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const users = initial.items;

  const canManage = useMemo(
    () => permissions.create || permissions.update || permissions.disable || permissions.resetPassword,
    [permissions],
  );

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!permissions.create) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await mutate('/api/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: form.get('email'),
          displayName: form.get('displayName'),
          password: form.get('password'),
          role: form.get('role'),
        }),
      });
      event.currentTarget.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setPending(false);
    }
  }

  async function disableUser(user: AdminUserPublic) {
    if (!permissions.disable) return;
    if (!window.confirm(`Отключить ${user.email}?`)) return;
    setPending(true);
    setError(null);
    try {
      await mutate(`/api/v1/admin/users/${user.id}/disable`, { method: 'POST' });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disable failed');
    } finally {
      setPending(false);
    }
  }

  async function enableUser(user: AdminUserPublic) {
    if (!permissions.disable) return;
    setPending(true);
    setError(null);
    try {
      await mutate(`/api/v1/admin/users/${user.id}/enable`, { method: 'POST' });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enable failed');
    } finally {
      setPending(false);
    }
  }

  async function resetPassword(user: AdminUserPublic) {
    if (!permissions.resetPassword) return;
    const next = window.prompt(`Новый пароль для ${user.email} (мин. 12 символов)`);
    if (!next) return;
    if (!window.confirm('Сбросить пароль и завершить все сессии пользователя?')) return;
    setPending(true);
    setError(null);
    try {
      await mutate(`/api/v1/admin/users/${user.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword: next }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-8">
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {permissions.create ? (
        <form onSubmit={onCreate} className="grid gap-3 rounded-lg border border-stone-200 bg-white p-5 sm:grid-cols-2">
          <h2 className="sm:col-span-2 text-lg font-medium text-stone-900">Создать администратора</h2>
          <input name="email" type="email" required placeholder="Email" className="rounded-md border px-3 py-2" />
          <input name="displayName" required placeholder="Имя" className="rounded-md border px-3 py-2" />
          <input name="password" type="password" required minLength={12} placeholder="Пароль" className="rounded-md border px-3 py-2" />
          <select name="role" className="rounded-md border px-3 py-2" defaultValue="MANAGER">
            {ADMIN_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              Создать
            </Button>
          </div>
        </form>
      ) : null}

      {users.length === 0 ? (
        <p className="text-stone-600">Пока нет пользователей.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-stone-600">
              <tr>
                <th className="px-4 py-3 font-medium">Имя</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Роль</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium">Последний вход</th>
                {canManage ? <th className="px-4 py-3 font-medium">Действия</th> : null}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-stone-100">
                  <td className="px-4 py-3">{user.displayName}</td>
                  <td className="px-4 py-3">{user.email}</td>
                  <td className="px-4 py-3">{user.role}</td>
                  <td className="px-4 py-3">{user.status}</td>
                  <td className="px-4 py-3">
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('ru-BY') : '—'}
                  </td>
                  {canManage ? (
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {permissions.disable && user.status === 'ACTIVE' ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={pending || user.id === currentUserId}
                            onClick={() => disableUser(user)}
                          >
                            Отключить
                          </Button>
                        ) : null}
                        {permissions.disable && user.status === 'DISABLED' ? (
                          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => enableUser(user)}>
                            Включить
                          </Button>
                        ) : null}
                        {permissions.resetPassword ? (
                          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => resetPassword(user)}>
                            Сброс пароля
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

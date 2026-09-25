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
    <div className="space-y-6">
      {error ? (
        <p role="alert" className="admin-error">
          {error}
        </p>
      ) : null}

      {permissions.create ? (
        <form onSubmit={onCreate} className="admin-card grid gap-3 sm:grid-cols-2">
          <h2 className="sm:col-span-2 text-base font-semibold text-[var(--admin-ink)]">
            Создать администратора
          </h2>
          <input
            name="email"
            type="email"
            required
            placeholder="Email"
            className="admin-input"
          />
          <input
            name="displayName"
            required
            placeholder="Имя"
            className="admin-input"
          />
          <input
            name="password"
            type="password"
            required
            minLength={12}
            placeholder="Пароль"
            className="admin-input"
          />
          <select name="role" className="admin-select" defaultValue="MANAGER">
            {ADMIN_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending} className="!rounded-lg !bg-[var(--admin-brand)]">
              Создать
            </Button>
          </div>
        </form>
      ) : null}

      {users.length === 0 ? (
        <div className="admin-panel">
          <p className="admin-empty">Пока нет пользователей.</p>
        </div>
      ) : (
        <div className="admin-panel overflow-x-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Имя</th>
                <th>Email</th>
                <th>Роль</th>
                <th>Статус</th>
                <th>Последний вход</th>
                {canManage ? <th>Действия</th> : null}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="font-semibold">{user.displayName}</td>
                  <td>{user.email}</td>
                  <td>
                    <span className="admin-chip">{user.role}</span>
                  </td>
                  <td>
                    <span
                      className={`admin-chip ${
                        user.status === 'ACTIVE' ? '' : 'admin-chip--muted'
                      }`}
                    >
                      {user.status}
                    </span>
                  </td>
                  <td className="text-[var(--admin-muted)]">
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('ru-BY') : '—'}
                  </td>
                  {canManage ? (
                    <td>
                      <div className="flex flex-wrap gap-2">
                        {permissions.disable && user.status === 'ACTIVE' ? (
                          <button
                            type="button"
                            className="admin-btn-ghost"
                            disabled={pending || user.id === currentUserId}
                            onClick={() => disableUser(user)}
                          >
                            Отключить
                          </button>
                        ) : null}
                        {permissions.disable && user.status === 'DISABLED' ? (
                          <button
                            type="button"
                            className="admin-btn-ghost"
                            disabled={pending}
                            onClick={() => enableUser(user)}
                          >
                            Включить
                          </button>
                        ) : null}
                        {permissions.resetPassword ? (
                          <button
                            type="button"
                            className="admin-btn-ghost"
                            disabled={pending}
                            onClick={() => resetPassword(user)}
                          >
                            Сброс пароля
                          </button>
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

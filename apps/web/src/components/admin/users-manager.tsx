'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminUserListResponse, AdminUserPublic } from '@bouquet-one/contracts';
import { ADMIN_ROLES } from '@bouquet-one/contracts';
import { adminRoleLabel } from '@/lib/admin-labels';

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

function statusLabel(status: AdminUserPublic['status']): string {
  return status === 'ACTIVE' ? 'Активен' : 'Отключён';
}

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
    throw new Error(
      typeof body?.message === 'string'
        ? body.message
        : 'Не удалось выполнить действие. Попробуйте ещё раз.',
    );
  }
  return response.json().catch(() => null);
}

export function UsersManager({ initial, permissions, currentUserId }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resetTarget, setResetTarget] = useState<AdminUserPublic | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
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
      setError(err instanceof Error ? err.message : 'Не удалось создать пользователя');
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
      setError(err instanceof Error ? err.message : 'Не удалось отключить пользователя');
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
      setError(err instanceof Error ? err.message : 'Не удалось включить пользователя');
    } finally {
      setPending(false);
    }
  }

  async function confirmResetPassword() {
    if (!permissions.resetPassword || !resetTarget) return;
    if (resetPasswordValue.trim().length < 12) {
      setError('Пароль должен быть не короче 12 символов.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      await mutate(`/api/v1/admin/users/${resetTarget.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword: resetPasswordValue.trim() }),
      });
      setResetTarget(null);
      setResetPasswordValue('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сбросить пароль');
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

      {resetTarget ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-password-title"
          className="admin-panel space-y-3 border border-[var(--admin-brand)]/30 p-4"
        >
          <h2 id="reset-password-title" className="text-base font-semibold text-[var(--admin-ink)]">
            Сброс пароля
          </h2>
          <p className="text-sm text-[var(--admin-muted)]">
            Новый пароль для {resetTarget.email}. Все активные сессии пользователя будут завершены.
          </p>
          <label className="admin-field">
            <span>Новый пароль</span>
            <input
              type="password"
              className="admin-input"
              minLength={12}
              value={resetPasswordValue}
              onChange={(event) => setResetPasswordValue(event.target.value)}
              placeholder="Минимум 12 символов"
              autoComplete="new-password"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="admin-btn"
              disabled={pending}
              onClick={() => void confirmResetPassword()}
            >
              Сбросить пароль
            </button>
            <button
              type="button"
              className="admin-btn-ghost"
              disabled={pending}
              onClick={() => {
                setResetTarget(null);
                setResetPasswordValue('');
              }}
            >
              Отмена
            </button>
          </div>
        </div>
      ) : null}

      {permissions.create ? (
        <form onSubmit={onCreate} className="admin-card grid gap-3 sm:grid-cols-2">
          <h2 className="text-base font-semibold text-[var(--admin-ink)] sm:col-span-2">
            Создать администратора
          </h2>
          <label className="admin-field">
            <span>Email</span>
            <input name="email" type="email" required className="admin-input" />
          </label>
          <label className="admin-field">
            <span>Имя</span>
            <input name="displayName" required className="admin-input" />
          </label>
          <label className="admin-field">
            <span>Пароль</span>
            <input name="password" type="password" required minLength={12} className="admin-input" />
          </label>
          <label className="admin-field">
            <span>Роль</span>
            <select name="role" className="admin-select" defaultValue="MANAGER">
              {ADMIN_ROLES.map((role) => (
                <option key={role} value={role}>
                  {adminRoleLabel(role)}
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-2">
            <button type="submit" disabled={pending} className="admin-btn">
              Создать
            </button>
          </div>
        </form>
      ) : null}

      {users.length === 0 ? (
        <div className="admin-panel">
          <div className="admin-empty admin-empty--action">
            <p>Пока нет пользователей.</p>
            <p className="text-sm text-[var(--admin-muted)]">
              Создайте первого администратора, чтобы он мог работать в панели.
            </p>
          </div>
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
                    <span className="admin-chip admin-chip--muted">{adminRoleLabel(user.role)}</span>
                  </td>
                  <td>
                    <span
                      className={`admin-chip ${
                        user.status === 'ACTIVE' ? '' : 'admin-chip--muted'
                      }`}
                    >
                      {statusLabel(user.status)}
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
                            onClick={() => void disableUser(user)}
                          >
                            Отключить
                          </button>
                        ) : null}
                        {permissions.disable && user.status === 'DISABLED' ? (
                          <button
                            type="button"
                            className="admin-btn-ghost"
                            disabled={pending}
                            onClick={() => void enableUser(user)}
                          >
                            Включить
                          </button>
                        ) : null}
                        {permissions.resetPassword ? (
                          <button
                            type="button"
                            className="admin-btn-ghost"
                            disabled={pending}
                            onClick={() => {
                              setError(null);
                              setResetPasswordValue('');
                              setResetTarget(user);
                            }}
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

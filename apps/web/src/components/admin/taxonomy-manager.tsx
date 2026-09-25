'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TaxonomyAdminDto } from '@bouquet-one/contracts';
import { Button } from '@bouquet-one/ui';

type Props = {
  kind: string;
  title: string;
  initial: TaxonomyAdminDto[];
  canCreate: boolean;
  canUpdate: boolean;
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

export function TaxonomyManager({ kind, title, initial, canCreate, canUpdate }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState(initial);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;
    const form = new FormData(event.currentTarget);
    setError(null);
    try {
      await mutate(`/api/v1/admin/catalog/${kind}`, {
        method: 'POST',
        body: JSON.stringify({
          name: form.get('name'),
          slug: form.get('slug') || undefined,
        }),
      });
      event.currentTarget.reset();
      router.refresh();
      const list = await mutate(`/api/v1/admin/catalog/${kind}`);
      setItems(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  async function toggleVisibility(item: TaxonomyAdminDto) {
    if (!canUpdate) return;
    setError(null);
    try {
      await mutate(`/api/v1/admin/catalog/${kind}/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          expectedVersion: item.version,
          visibility: item.visibility === 'VISIBLE' ? 'HIDDEN' : 'VISIBLE',
        }),
      });
      const list = await mutate(`/api/v1/admin/catalog/${kind}`);
      setItems(list);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  return (
    <main id="main-content" className="space-y-6">
      <header>
        <h1 className="admin-page-title">{title}</h1>
        <p className="admin-page-lead">Справочник каталога · {kind}</p>
      </header>

      {error ? <p className="admin-error">{error}</p> : null}

      {canCreate ? (
        <form onSubmit={onCreate} className="admin-toolbar">
          <label className="admin-field">
            <span>Название</span>
            <input name="name" required placeholder="Название" className="admin-input w-56" />
          </label>
          <label className="admin-field">
            <span>Slug</span>
            <input name="slug" placeholder="slug" className="admin-input w-48" />
          </label>
          <Button type="submit" className="!rounded-lg !bg-[var(--admin-brand)]">
            Добавить
          </Button>
        </form>
      ) : null}

      {items.length === 0 ? (
        <div className="admin-panel">
          <p className="admin-empty">Пусто</p>
        </div>
      ) : (
        <div className="admin-panel">
          <ul className="admin-list">
            {items.map((item) => (
              <li key={item.id} className="admin-list__item">
                <div>
                  <p className="font-semibold text-[var(--admin-ink)]">{item.name}</p>
                  <p className="mt-0.5 text-xs text-[var(--admin-muted)]">
                    {item.slug} · {item.visibility}
                  </p>
                </div>
                {canUpdate ? (
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    onClick={() => void toggleVisibility(item)}
                  >
                    {item.visibility === 'VISIBLE' ? 'Скрыть' : 'Показать'}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}

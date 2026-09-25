'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CollectionAdminDto } from '@bouquet-one/contracts';
import { Button } from '@bouquet-one/ui';

type Props = {
  initial: CollectionAdminDto[];
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

export function CollectionsManager({ initial, canCreate, canUpdate }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [matchInfo, setMatchInfo] = useState<string | null>(null);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;
    const form = new FormData(event.currentTarget);
    try {
      await mutate('/api/v1/admin/catalog/collections', {
        method: 'POST',
        body: JSON.stringify({
          name: form.get('name'),
          type: form.get('type'),
          slug: form.get('slug') || undefined,
        }),
      });
      const list = await mutate('/api/v1/admin/catalog/collections');
      setItems(list);
      event.currentTarget.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  async function previewRules(item: CollectionAdminDto) {
    if (!item.rules) return;
    const result = await mutate('/api/v1/admin/catalog/collections/preview-rules', {
      method: 'POST',
      body: JSON.stringify({ rules: item.rules }),
    });
    setMatchInfo(`${item.name}: совпадений ${result.matchCount}`);
  }

  return (
    <main id="main-content" className="space-y-6">
      <header>
        <h1 className="admin-page-title">Коллекции</h1>
        <p className="admin-page-lead">Ручные и rule-based подборки для витрины</p>
      </header>

      {error ? <p className="admin-error">{error}</p> : null}
      {matchInfo ? <p className="text-sm text-[var(--admin-muted)]">{matchInfo}</p> : null}

      {canCreate ? (
        <form onSubmit={onCreate} className="admin-toolbar">
          <label className="admin-field">
            <span>Название</span>
            <input name="name" required placeholder="Название" className="admin-input w-56" />
          </label>
          <label className="admin-field">
            <span>Тип</span>
            <select name="type" className="admin-select">
              <option value="MANUAL">MANUAL</option>
              <option value="RULE_BASED">RULE_BASED</option>
            </select>
          </label>
          <label className="admin-field">
            <span>Slug</span>
            <input name="slug" placeholder="slug" className="admin-input w-48" />
          </label>
          <Button type="submit" className="!rounded-lg !bg-[var(--admin-brand)]">
            Создать
          </Button>
        </form>
      ) : null}

      <div className="admin-panel">
        {items.length === 0 ? (
          <p className="admin-empty">Коллекций пока нет</p>
        ) : (
          <ul className="admin-list">
            {items.map((item) => (
              <li key={item.id} className="admin-list__item">
                <div>
                  <p className="font-semibold text-[var(--admin-ink)]">{item.name}</p>
                  <p className="mt-0.5 text-xs text-[var(--admin-muted)]">
                    {item.type} · {item.productIds.length} товаров · v{item.version}
                  </p>
                </div>
                {canUpdate && item.type === 'RULE_BASED' ? (
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    onClick={() => void previewRules(item)}
                  >
                    Preview matches
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

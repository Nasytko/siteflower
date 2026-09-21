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
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold text-stone-900">{title}</h1>
      </header>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {canCreate ? (
        <form onSubmit={onCreate} className="flex flex-wrap gap-3">
          <input name="name" required placeholder="Название" className="rounded-md border border-stone-300 px-3 py-2" />
          <input name="slug" placeholder="slug" className="rounded-md border border-stone-300 px-3 py-2" />
          <Button type="submit">Добавить</Button>
        </form>
      ) : null}
      {items.length === 0 ? (
        <p className="text-stone-500">Пусто</p>
      ) : (
        <ul className="divide-y divide-stone-100 border border-stone-200 rounded-md">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p className="font-medium text-stone-900">{item.name}</p>
                <p className="text-stone-500">{item.slug} · {item.visibility}</p>
              </div>
              {canUpdate ? (
                <Button type="button" onClick={() => void toggleVisibility(item)}>
                  {item.visibility === 'VISIBLE' ? 'Скрыть' : 'Показать'}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
    setMatchInfo(`${item.name}: Matches ${result.matchCount} products`);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold text-stone-900">Коллекции</h1>
      </header>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {matchInfo ? <p className="text-sm text-stone-700">{matchInfo}</p> : null}
      {canCreate ? (
        <form onSubmit={onCreate} className="flex flex-wrap gap-3">
          <input name="name" required placeholder="Название" className="rounded-md border border-stone-300 px-3 py-2" />
          <select name="type" className="rounded-md border border-stone-300 px-3 py-2">
            <option value="MANUAL">MANUAL</option>
            <option value="RULE_BASED">RULE_BASED</option>
          </select>
          <Button type="submit">Создать</Button>
        </form>
      ) : null}
      <ul className="divide-y divide-stone-100 rounded-md border border-stone-200">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <div>
              <p className="font-medium">{item.name}</p>
              <p className="text-stone-500">
                {item.type} · {item.productIds.length} products · v{item.version}
              </p>
            </div>
            {canUpdate && item.type === 'RULE_BASED' ? (
              <Button type="button" onClick={() => void previewRules(item)}>
                Preview matches
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

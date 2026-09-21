'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PaginatedResponse, ProductListItemDto } from '@bouquet-one/contracts';
import { Button } from '@bouquet-one/ui';
import { toSameOriginMediaUrl } from '@/lib/media';

type Props = {
  initial: PaginatedResponse<ProductListItemDto>;
  canCreate: boolean;
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

export function ProductsManager({ initial, canCreate }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const created = await mutate('/api/v1/admin/catalog/products', {
        method: 'POST',
        body: JSON.stringify({
          name: form.get('name'),
          slug: form.get('slug') || undefined,
        }),
      });
      router.push(`/admin/catalog/products/${created.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-8">
      {canCreate ? (
        <form onSubmit={onCreate} className="flex flex-wrap items-end gap-3 border-b border-stone-200 pb-6">
          <label className="block text-sm">
            <span className="text-stone-600">Новый товар</span>
            <input
              name="name"
              required
              className="mt-1 block w-56 rounded-md border border-stone-300 px-3 py-2"
              placeholder="Название"
            />
          </label>
          <label className="block text-sm">
            <span className="text-stone-600">Slug (опц.)</span>
            <input
              name="slug"
              className="mt-1 block w-48 rounded-md border border-stone-300 px-3 py-2"
              placeholder="ameli"
            />
          </label>
          <Button type="submit" disabled={pending}>
            Создать черновик
          </Button>
        </form>
      ) : null}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {initial.items.length === 0 ? (
        <p className="text-stone-500">Товаров пока нет.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-stone-200 text-stone-500">
              <tr>
                <th className="py-2 pr-4">Товар</th>
                <th className="py-2 pr-4">Статус</th>
                <th className="py-2 pr-4">Доступность</th>
                <th className="py-2 pr-4">Цена</th>
                <th className="py-2 pr-4">Обновлён</th>
              </tr>
            </thead>
            <tbody>
              {initial.items.map((item) => (
                <tr key={item.id} className="border-b border-stone-100">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-3">
                      {item.primaryImageUrl ? (
                        <img
                          src={toSameOriginMediaUrl(item.primaryImageUrl) ?? item.primaryImageUrl}
                          alt=""
                          className="h-12 w-12 rounded object-cover"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded bg-stone-200" />
                      )}
                      <div>
                        <Link
                          href={`/admin/catalog/products/${item.id}`}
                          className="font-medium text-stone-900 underline-offset-2 hover:underline"
                        >
                          {item.name}
                        </Link>
                        <p className="text-xs text-stone-500">{item.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-4">{item.lifecycle}</td>
                  <td className="py-3 pr-4">{item.availability}</td>
                  <td className="py-3 pr-4">{item.price?.label ?? '—'}</td>
                  <td className="py-3 pr-4 text-stone-500">
                    {new Date(item.updatedAt).toLocaleString('ru-BY')}
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

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
    <div className="space-y-6">
      {canCreate ? (
        <form onSubmit={onCreate} className="admin-toolbar">
          <label className="admin-field">
            <span>Новый товар</span>
            <input
              name="name"
              required
              className="admin-input w-56"
              placeholder="Название"
            />
          </label>
          <label className="admin-field">
            <span>Slug (опц.)</span>
            <input name="slug" className="admin-input w-48" placeholder="ameli" />
          </label>
          <Button type="submit" disabled={pending} className="!rounded-lg !bg-[var(--admin-brand)]">
            Создать черновик
          </Button>
        </form>
      ) : null}

      {error ? <p className="admin-error">{error}</p> : null}

      {initial.items.length === 0 ? (
        <div className="admin-panel">
          <p className="admin-empty">Товаров пока нет.</p>
        </div>
      ) : (
        <div className="admin-panel overflow-x-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Товар</th>
                <th>Статус</th>
                <th>Доступность</th>
                <th>Цена</th>
                <th>Обновлён</th>
              </tr>
            </thead>
            <tbody>
              {initial.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      {item.primaryImageUrl ? (
                        <img
                          src={toSameOriginMediaUrl(item.primaryImageUrl) ?? item.primaryImageUrl}
                          alt=""
                          className="h-12 w-12 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-lg bg-[#eef1ef]" />
                      )}
                      <div>
                        <Link
                          href={`/admin/catalog/products/${item.id}`}
                          className="font-semibold text-[var(--admin-ink)] underline-offset-2 hover:text-[var(--admin-brand)] hover:underline"
                        >
                          {item.name}
                        </Link>
                        <p className="text-xs text-[var(--admin-muted)]">{item.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="admin-chip">{item.lifecycle}</span>
                  </td>
                  <td>
                    <span className="admin-chip admin-chip--muted">{item.availability}</span>
                  </td>
                  <td>{item.price?.label ?? '—'}</td>
                  <td className="text-[var(--admin-muted)]">
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

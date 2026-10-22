'use client';

import { useEffect, useState } from 'react';
import type { ProductAdminDto, ProductFamilyMemberDto } from '@bouquet-one/contracts';
import { formatPriceFromMinor } from '@bouquet-one/contracts';
import { adminDelete, adminGet, adminPost, errorMessage } from '@/lib/admin-client';
import { adminEndpoints, withQuery } from '@/lib/admin-endpoints';

type Suggestion = {
  id: string;
  name: string;
  slug: string;
  heightCm: number | null;
  priceMinor: string | null;
  alreadyLinked: boolean;
};

type SearchHit = {
  id: string;
  name: string;
  slug: string;
  heightCm?: number | null;
  price?: { minMinor: string } | null;
};

type Props = {
  product: ProductAdminDto;
  canUpdate: boolean;
  members: ProductFamilyMemberDto[];
  onChanged: (updated: ProductAdminDto) => void;
};

export function ProductEditorRelated({ product, canUpdate, members, onChanged }: Props) {
  const [open, setOpen] = useState(members.length > 1);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void adminGet<Suggestion[]>(adminEndpoints.productRelatedSuggestions(product.id))
      .then((rows) => {
        if (!cancelled) setSuggestions(rows.filter((row) => !row.alreadyLinked));
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [product.id, product.family?.id, members.length]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void adminGet<{ items: SearchHit[] }>(
        withQuery(adminEndpoints.products, { search: q, page: 1, pageSize: 8 }),
      )
        .then((data) => {
          setHits((data.items ?? []).filter((item) => item.id !== product.id));
        })
        .catch(() => setHits([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, product.id]);

  async function link(relatedId: string) {
    if (!canUpdate) return;
    setPending(true);
    setError(null);
    try {
      const updated = await adminPost<ProductAdminDto>(adminEndpoints.productRelated(product.id), {
        productId: relatedId,
      });
      setQuery('');
      setHits([]);
      onChanged(updated);
    } catch (err) {
      setError(errorMessage(err, 'Не удалось связать товары'));
    } finally {
      setPending(false);
    }
  }

  async function unlink(relatedId: string) {
    if (!canUpdate) return;
    setPending(true);
    setError(null);
    try {
      const updated = await adminDelete<ProductAdminDto>(
        adminEndpoints.productRelatedItem(product.id, relatedId),
      );
      onChanged(updated);
    } catch (err) {
      setError(errorMessage(err, 'Не удалось снять связь'));
    } finally {
      setPending(false);
    }
  }

  const others = members.filter((member) => member.productId !== product.id);

  return (
    <section className="sf-pe-card">
      <button
        type="button"
        className="sf-pe-card__toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="sf-pe-card__index">7</span>
        <span>
          <strong>Связанные товары</strong>
          <span className="sf-pe-card__lead">
            Отдельные карточки одной линейки — например разная длина стебля. Необязательно.
          </span>
        </span>
      </button>
      {open ? (
        <div className="sf-pe-card__body space-y-4">
          {error ? <p className="admin-field-error">{error}</p> : null}
          {others.length === 0 ? (
            <p className="admin-help">Пока нет связанных карточек.</p>
          ) : (
            <ul className="space-y-2">
              {others.map((member) => (
                <li
                  key={member.productId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--admin-border)] px-3 py-2"
                >
                  <div>
                    <p className="font-medium">{member.name}</p>
                    <p className="text-xs text-[var(--admin-muted)]">
                      {member.heightCm != null ? `${member.heightCm} см` : 'без высоты'}
                      {member.price
                        ? ` · ${formatPriceFromMinor(member.price.minMinor, product.currency)}`
                        : ''}
                    </p>
                  </div>
                  {canUpdate ? (
                    <button
                      type="button"
                      className="admin-btn-ghost text-xs"
                      disabled={pending}
                      onClick={() => void unlink(member.productId)}
                    >
                      Отвязать
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {canUpdate ? (
            <>
              <label className="admin-field">
                <span>Найти существующий товар</span>
                <input
                  className="admin-input"
                  value={query}
                  placeholder="Название или адрес"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              {hits.length > 0 ? (
                <ul className="space-y-1">
                  {hits.map((hit) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        className="admin-link text-sm"
                        disabled={pending}
                        onClick={() => void link(hit.id)}
                      >
                        + {hit.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {suggestions.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--admin-muted)]">
                    Похожие по виду и сорту
                  </p>
                  <ul className="space-y-1">
                    {suggestions.map((row) => (
                      <li key={row.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm">
                          {row.name}
                          {row.heightCm != null ? ` · ${row.heightCm} см` : ''}
                        </span>
                        <button
                          type="button"
                          className="admin-btn-ghost text-xs"
                          disabled={pending}
                          onClick={() => void link(row.id)}
                        >
                          Связать
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

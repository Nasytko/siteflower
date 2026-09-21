'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import type { ProductListItemDto } from '@bouquet-one/contracts';
import { trackEvent } from '@/lib/analytics';
import { searchProductsBrowser } from '@/lib/public-api';

type Props = {
  open: boolean;
  onClose: () => void;
};

const RECENT_KEY = 'bouquet-one:recent-searches:v1';

export function SearchDialog({ open, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ProductListItemDto[]>([]);
  const [searched, setSearched] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    try {
      const raw = window.localStorage.getItem(RECENT_KEY);
      setRecent(raw ? (JSON.parse(raw) as string[]).slice(0, 5) : []);
    } catch {
      setRecent([]);
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setItems([]);
      setSearched(false);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const result = await searchProductsBrowser(trimmed, controller.signal);
        setItems(result.items);
        setSearched(true);
        trackEvent('search', { query: trimmed, resultCount: result.total });
      } catch (error) {
        if ((error as { name?: string }).name !== 'AbortError') {
          setItems([]);
          setSearched(true);
        }
      } finally {
        setLoading(false);
      }
    }, 280);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, open]);

  function remember(term: string) {
    const next = [term, ...recent.filter((item) => item !== term)].slice(0, 5);
    setRecent(next);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button
        type="button"
        className="absolute inset-0 bg-foreground/35"
        aria-label="Закрыть поиск"
        onClick={onClose}
      />
      <div className="relative mx-auto mt-10 w-[min(100%-1.5rem,36rem)] rounded-[var(--radius-md)] bg-surface p-4 shadow-lg ring-1 ring-border sm:mt-16 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="sf-h3">
              Поиск
            </h2>
            <p className="sf-small mt-1 text-muted">Найти букет или цветы</p>
          </div>
          <button
            type="button"
            className="rounded-full px-3 py-1.5 text-sm text-muted hover:bg-brand-soft hover:text-foreground"
            onClick={onClose}
          >
            Закрыть
          </button>
        </div>
        <label className="mt-4 block">
          <span className="sr-only">Запрос</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Найти букет или цветы"
            className="w-full rounded-[var(--radius-md)] border border-border bg-background px-4 py-3 text-base outline-none focus:border-brand"
            autoComplete="off"
            enterKeyHint="search"
          />
        </label>

        {recent.length > 0 && query.trim().length < 2 ? (
          <div className="mt-4">
            <p className="sf-label">Недавние</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {recent.map((term) => (
                <li key={term}>
                  <button
                    type="button"
                    className="rounded-full bg-brand-soft px-3 py-1.5 text-sm text-foreground"
                    onClick={() => setQuery(term)}
                  >
                    {term}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-4 max-h-[50vh] overflow-y-auto">
          {loading ? <p className="sf-small text-muted">Ищем…</p> : null}
          {!loading && searched && items.length === 0 ? (
            <div className="py-6 text-center">
              <p className="sf-h3">Ничего не нашли</p>
              <p className="sf-small mt-2 text-muted">Попробуйте другой запрос или откройте весь каталог.</p>
              <Link
                href="/bukety"
                className="mt-4 inline-flex rounded-[var(--radius-md)] bg-brand px-4 py-2 text-sm font-medium text-brand-foreground"
                onClick={onClose}
              >
                Перейти в каталог
              </Link>
            </div>
          ) : null}
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/bukety/${item.slug}`}
                  className="flex items-center justify-between gap-3 py-3 hover:text-brand"
                  onClick={() => {
                    remember(query.trim());
                    onClose();
                  }}
                >
                  <span className="font-medium">{item.name}</span>
                  <span className="sf-small shrink-0 text-muted">{item.price?.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import type { LinkDestinationDto, SystemRouteKey } from '@bouquet-one/contracts';
import {
  inferLinkDestinationFromHref,
  SYSTEM_ROUTE_KEYS,
  systemRouteHref,
  validateCustomHref,
} from '@bouquet-one/contracts';
import { adminGet } from '@/lib/admin-client';
import { adminEndpoints, withQuery } from '@/lib/admin-endpoints';

type CatalogOption = { id: string; label: string; href: string; slug: string };
type ProductOption = { id: string; label: string; href: string; slug: string };

const SYSTEM_LABELS: Record<SystemRouteKey, string> = {
  home: 'Главная',
  catalog: 'Каталог',
  bouquets: 'Букеты',
  stems: 'Цветы поштучно',
  promotions: 'Акции',
  about: 'О нас',
  delivery: 'Доставка',
  contacts: 'Контакты',
};

type Props = {
  label: string;
  value: LinkDestinationDto | null;
  hrefFallback?: string;
  disabled?: boolean;
  onChange: (next: LinkDestinationDto, resolvedHref: string) => void;
};

function resolvedHref(dest: LinkDestinationDto): string {
  if (dest.kind === 'system' && dest.ref && (SYSTEM_ROUTE_KEYS as readonly string[]).includes(dest.ref)) {
    return systemRouteHref(dest.ref as SystemRouteKey);
  }
  return (dest.href ?? '').trim() || '/';
}

export function LinkDestinationPicker({
  label,
  value,
  hrefFallback = '',
  disabled,
  onChange,
}: Props) {
  const initial = value ?? (hrefFallback ? inferLinkDestinationFromHref(hrefFallback) : null);
  const [kind, setKind] = useState<LinkDestinationDto['kind']>(initial?.kind ?? 'system');
  const [ref, setRef] = useState(initial?.ref ?? 'catalog');
  const [customHref, setCustomHref] = useState(
    initial?.kind === 'custom' ? (initial.href ?? hrefFallback) : hrefFallback,
  );
  const [pages, setPages] = useState<CatalogOption[]>([]);
  const [categories, setCategories] = useState<CatalogOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [productQuery, setProductQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [pageList, categoryList, productList] = await Promise.all([
          adminGet<Array<{ id: string; name: string; slug: string; href?: string }>>(
            adminEndpoints.catalogPages,
          ).catch(() => []),
          adminGet<Array<{ id: string; name: string; slug: string }>>(
            adminEndpoints.catalogCategories,
          ).catch(() => []),
          adminGet<{ items: Array<{ id: string; name: string; slug: string }> }>(
            withQuery(adminEndpoints.products, {
              pageSize: 30,
              q: productQuery || undefined,
            }),
          ).catch(() => ({ items: [] as Array<{ id: string; name: string; slug: string }> })),
        ]);
        if (cancelled) return;
        setPages(
          (Array.isArray(pageList) ? pageList : []).map((p) => ({
            id: p.id,
            label: `${p.name} (${p.slug})`,
            slug: p.slug,
            href: p.href ?? `/catalog/${p.slug}`,
          })),
        );
        setCategories(
          (Array.isArray(categoryList) ? categoryList : []).map((c) => ({
            id: c.id,
            label: `${c.name} (${c.slug})`,
            slug: c.slug,
            href: `/catalog/${c.slug}`,
          })),
        );
        setProducts(
          (productList.items ?? []).map((p) => ({
            id: p.id,
            label: `${p.name} (${p.slug})`,
            slug: p.slug,
            href: `/products/${p.slug}`,
          })),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productQuery]);

  const preview = useMemo(() => {
    const dest: LinkDestinationDto = {
      kind,
      ref: kind === 'custom' ? null : ref,
      href: kind === 'custom' ? customHref : null,
    };
    if (kind === 'catalog_page') {
      const hit = pages.find((p) => p.id === ref);
      if (hit) return { dest: { ...dest, href: hit.href }, href: hit.href };
    }
    if (kind === 'category') {
      const hit = categories.find((c) => c.id === ref);
      if (hit) return { dest: { ...dest, href: hit.href }, href: hit.href };
    }
    if (kind === 'product') {
      const hit = products.find((p) => p.id === ref);
      if (hit) return { dest: { ...dest, href: hit.href }, href: hit.href };
    }
    if (kind === 'system') {
      const href = resolvedHref(dest);
      return { dest: { ...dest, href }, href };
    }
    return { dest, href: customHref.trim() || '/' };
  }, [kind, ref, customHref, pages, categories, products]);

  function emit(nextKind: LinkDestinationDto['kind'], nextRef: string, nextCustom: string) {
    setError(null);
    const dest: LinkDestinationDto = {
      kind: nextKind,
      ref: nextKind === 'custom' ? null : nextRef,
      href: nextKind === 'custom' ? nextCustom : null,
    };
    let href = nextCustom;
    if (nextKind === 'system') href = resolvedHref(dest);
    if (nextKind === 'catalog_page') {
      href = pages.find((p) => p.id === nextRef)?.href ?? nextCustom;
      dest.href = href;
    }
    if (nextKind === 'category') {
      href = categories.find((c) => c.id === nextRef)?.href ?? nextCustom;
      dest.href = href;
    }
    if (nextKind === 'product') {
      href = products.find((p) => p.id === nextRef)?.href ?? nextCustom;
      dest.href = href;
    }
    if (nextKind === 'custom') {
      const check = validateCustomHref(nextCustom);
      if (!check.ok) {
        setError(check.message);
        onChange(dest, nextCustom);
        return;
      }
    }
    onChange(dest, href);
  }

  return (
    <fieldset className="admin-field space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="admin-field">
          <span>Тип</span>
          <select
            className="admin-input"
            value={kind}
            onChange={(e) => {
              const next = e.target.value as LinkDestinationDto['kind'];
              setKind(next);
              const nextRef =
                next === 'system'
                  ? 'catalog'
                  : next === 'catalog_page'
                    ? (pages[0]?.id ?? '')
                    : next === 'category'
                      ? (categories[0]?.id ?? '')
                      : next === 'product'
                        ? (products[0]?.id ?? '')
                        : '';
              setRef(nextRef);
              emit(next, nextRef, customHref);
            }}
          >
            <option value="system">Системная страница</option>
            <option value="catalog_page">Страница каталога</option>
            <option value="category">Категория</option>
            <option value="product">Товар</option>
            <option value="custom">Свой URL</option>
          </select>
        </label>

        {kind === 'system' ? (
          <label className="admin-field">
            <span>Страница</span>
            <select
              className="admin-input"
              value={ref ?? 'catalog'}
              onChange={(e) => {
                setRef(e.target.value);
                emit('system', e.target.value, customHref);
              }}
            >
              {SYSTEM_ROUTE_KEYS.map((key) => (
                <option key={key} value={key}>
                  {SYSTEM_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {kind === 'catalog_page' ? (
          <label className="admin-field">
            <span>Страница{loading ? '…' : ''}</span>
            <select
              className="admin-input"
              value={ref ?? ''}
              onChange={(e) => {
                setRef(e.target.value);
                emit('catalog_page', e.target.value, customHref);
              }}
            >
              <option value="">Выберите…</option>
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {kind === 'category' ? (
          <label className="admin-field">
            <span>Категория{loading ? '…' : ''}</span>
            <select
              className="admin-input"
              value={ref ?? ''}
              onChange={(e) => {
                setRef(e.target.value);
                emit('category', e.target.value, customHref);
              }}
            >
              <option value="">Выберите…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {kind === 'product' ? (
          <div className="space-y-2">
            <label className="admin-field">
              <span>Поиск товара</span>
              <input
                className="admin-input"
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                placeholder="Название или slug"
              />
            </label>
            <label className="admin-field">
              <span>Товар</span>
              <select
                className="admin-input"
                value={ref ?? ''}
                onChange={(e) => {
                  setRef(e.target.value);
                  emit('product', e.target.value, customHref);
                }}
              >
                <option value="">Выберите…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {kind === 'custom' ? (
          <label className="admin-field sm:col-span-2">
            <span>URL (путь сайта или https://…)</span>
            <input
              className="admin-input"
              value={customHref}
              onChange={(e) => {
                setCustomHref(e.target.value);
                emit('custom', '', e.target.value);
              }}
              placeholder="/catalog/… или https://…"
            />
          </label>
        ) : null}
      </div>
      <p className="text-xs text-[var(--admin-muted)]">Итоговая ссылка: {preview.href}</p>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </fieldset>
  );
}

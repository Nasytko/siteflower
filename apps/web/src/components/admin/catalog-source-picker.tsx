'use client';

import { useEffect, useState } from 'react';
import type { CatalogSourceDto } from '@bouquet-one/contracts';
import {
  catalogSourceDefaultViewAllHref,
  inferCatalogSourceFromSlug,
} from '@bouquet-one/contracts';
import { adminGet } from '@/lib/admin-client';
import { adminEndpoints } from '@/lib/admin-endpoints';

type Option = { id: string; label: string; slug: string };

type Props = {
  label?: string;
  sectionKind?: string;
  value: CatalogSourceDto | null;
  sourceSlugFallback?: string | null;
  disabled?: boolean;
  /** Hide promotions option for non-promo shelves */
  allowPromotions?: boolean;
  onChange: (next: CatalogSourceDto, resolvedSlug: string | null, autoViewAllHref: string | null) => void;
};

export function CatalogSourcePicker({
  label = 'Источник товаров',
  sectionKind,
  value,
  sourceSlugFallback,
  disabled,
  allowPromotions = sectionKind === 'promotions',
  onChange,
}: Props) {
  const initial =
    value ?? inferCatalogSourceFromSlug(sourceSlugFallback, sectionKind);
  const [kind, setKind] = useState<CatalogSourceDto['kind']>(
    sectionKind === 'promotions' ? 'promotions' : initial.kind,
  );
  const [id, setId] = useState(initial.id ?? '');
  const [slug, setSlug] = useState(initial.slug ?? sourceSlugFallback ?? '');
  const [pages, setPages] = useState<Option[]>([]);
  const [groups, setGroups] = useState<Option[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [pageList, groupList] = await Promise.all([
        adminGet<Array<{ id: string; name: string; slug: string }>>(
          adminEndpoints.catalogPages,
        ).catch(() => []),
        adminGet<Array<{ id: string; name: string; slug: string }>>(
          adminEndpoints.bestsellerGroups,
        ).catch(() => []),
      ]);
      if (cancelled) return;
      setPages(
        (Array.isArray(pageList) ? pageList : []).map((p) => ({
          id: p.id,
          slug: p.slug,
          label: `${p.name} (${p.slug})`,
        })),
      );
      setGroups(
        (Array.isArray(groupList) ? groupList : []).map((g) => ({
          id: g.id,
          slug: g.slug,
          label: `${g.name} (${g.slug})`,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function emit(nextKind: CatalogSourceDto['kind'], nextId: string, nextSlug: string) {
    const source: CatalogSourceDto = {
      kind: nextKind,
      id: nextId || null,
      slug: nextSlug || null,
    };
    const resolvedSlug =
      nextKind === 'auto' || nextKind === 'promotions' ? null : nextSlug || null;
    onChange(source, resolvedSlug, catalogSourceDefaultViewAllHref(source, resolvedSlug));
  }

  return (
    <fieldset className="admin-field space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="admin-field">
          <span>Тип источника</span>
          <select
            className="admin-input"
            value={kind}
            onChange={(e) => {
              const next = e.target.value as CatalogSourceDto['kind'];
              setKind(next);
              if (next === 'catalog_page') {
                const first = pages[0];
                setId(first?.id ?? '');
                setSlug(first?.slug ?? '');
                emit(next, first?.id ?? '', first?.slug ?? '');
              } else if (next === 'bestseller_group') {
                const first = groups[0];
                setId(first?.id ?? '');
                setSlug(first?.slug ?? '');
                emit(next, first?.id ?? '', first?.slug ?? '');
              } else {
                setId('');
                setSlug('');
                emit(next, '', '');
              }
            }}
          >
            <option value="auto">Авто (по умолчанию для секции)</option>
            {allowPromotions ? <option value="promotions">Действующие акции</option> : null}
            <option value="catalog_page">Страница каталога</option>
            <option value="bestseller_group">Группа бестселлеров</option>
          </select>
        </label>

        {kind === 'catalog_page' ? (
          <label className="admin-field">
            <span>Страница</span>
            <select
              className="admin-input"
              value={id}
              onChange={(e) => {
                const opt = pages.find((p) => p.id === e.target.value);
                setId(e.target.value);
                setSlug(opt?.slug ?? '');
                emit('catalog_page', e.target.value, opt?.slug ?? '');
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

        {kind === 'bestseller_group' ? (
          <label className="admin-field">
            <span>Группа</span>
            <select
              className="admin-input"
              value={id}
              onChange={(e) => {
                const opt = groups.find((g) => g.id === e.target.value);
                setId(e.target.value);
                setSlug(opt?.slug ?? '');
                emit('bestseller_group', e.target.value, opt?.slug ?? '');
              }}
            >
              <option value="">Выберите…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {slug ? (
        <p className="text-xs text-[var(--admin-muted)]">Slug источника: {slug}</p>
      ) : null}
    </fieldset>
  );
}

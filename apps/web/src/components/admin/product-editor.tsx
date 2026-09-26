'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProductAdminDto, TaxonomyAdminDto } from '@bouquet-one/contracts';
import { Button } from '@bouquet-one/ui';
import { toSameOriginMediaUrl } from '@/lib/media';

type Props = {
  product: ProductAdminDto;
  taxonomies: {
    categories: TaxonomyAdminDto[];
    occasions: TaxonomyAdminDto[];
    recipients: TaxonomyAdminDto[];
    styles: TaxonomyAdminDto[];
    colors: TaxonomyAdminDto[];
    flowers: TaxonomyAdminDto[];
  };
  canUpdate: boolean;
  canPublish: boolean;
};

async function mutate(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      origin: window.location.origin,
      ...(init?.body instanceof FormData
        ? {}
        : { 'content-type': 'application/json' }),
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const issues = body?.issues as Array<{ message: string }> | undefined;
    const message = issues?.length
      ? `${body.message}: ${issues.map((i) => i.message).join('; ')}`
      : (body?.message ?? `Request failed (${response.status})`);
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
  }
  return body;
}

function variantsDefault(product: ProductAdminDto): string {
  return product.variants.map((v) => `${v.name}|${v.priceMinor}|${v.status}`).join('\n');
}

function componentsDefault(product: ProductAdminDto): string {
  return product.components
    .map((c) => `${c.displayName}|${c.quantity ?? ''}|${c.flowerId ?? ''}`)
    .join('\n');
}

export function ProductEditor({ product, taxonomies, canUpdate, canPublish }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState('basic');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [version, setVersion] = useState(product.version);
  const [local, setLocal] = useState(product);

  const seoWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (!local.seo.resolvedTitle) warnings.push('Нет title');
    if (local.seo.resolvedTitle.length > 70) warnings.push('Title длинный');
    if (!local.seo.resolvedDescription) warnings.push('Нет description');
    if (!local.media.some((m) => m.isPrimary)) warnings.push('Нет primary image');
    if (local.media.some((m) => !m.alt)) warnings.push('Есть изображения без alt');
    return warnings;
  }, [local]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUpdate) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const variantRows = String(form.get('variants') ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, index) => {
          const [name, priceMinor, status] = line.split('|').map((p) => p.trim());
          return {
            name: name || `Вариант ${index + 1}`,
            priceMinor: priceMinor || '0',
            sortOrder: index,
            status: (status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE') as 'ACTIVE' | 'INACTIVE',
          };
        });

      let current = await mutate(`/api/v1/admin/catalog/products/${product.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          expectedVersion: version,
          name: form.get('name'),
          slug: form.get('slug'),
          shortDescription: form.get('shortDescription') || null,
          description: form.get('description') || null,
          availability: form.get('availability'),
          featured: form.get('featured') === 'on',
          heightCm: (() => {
            const raw = String(form.get('heightCm') ?? '').trim();
            if (!raw) return null;
            const n = Number(raw);
            return Number.isFinite(n) ? n : null;
          })(),
          publishAt: form.get('publishAt') || null,
          unpublishAt: form.get('unpublishAt') || null,
          seoTitle: form.get('seoTitle') || null,
          seoDescription: form.get('seoDescription') || null,
          noIndex: form.get('noIndex') === 'on',
        }),
      });

      current = await mutate(`/api/v1/admin/catalog/products/${product.id}/variants`, {
        method: 'PUT',
        body: JSON.stringify({
          expectedVersion: current.version,
          variants: variantRows,
        }),
      });

      current = await mutate(`/api/v1/admin/catalog/products/${product.id}/taxonomies`, {
        method: 'PUT',
        body: JSON.stringify({
          expectedVersion: current.version,
          categoryIds: form.getAll('categoryIds'),
          occasionIds: form.getAll('occasionIds'),
          recipientIds: form.getAll('recipientIds'),
          styleIds: form.getAll('styleIds'),
          colorIds: form.getAll('colorIds'),
        }),
      });

      current = await mutate(`/api/v1/admin/catalog/products/${product.id}/components`, {
        method: 'PUT',
        body: JSON.stringify({
          expectedVersion: current.version,
          components: String(form.get('components') ?? '')
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line, index) => {
              const [displayName, quantity, flowerId] = line.split('|').map((p) => p.trim());
              return {
                displayName,
                quantity: quantity ? Number(quantity) : undefined,
                flowerId: flowerId || undefined,
                unit: 'PIECE',
                sortOrder: index,
              };
            }),
        }),
      });
      setLocal(current);
      setVersion(current.version);
      setDirty(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setPending(false);
    }
  }

  async function lifecycle(action: 'publish' | 'unpublish' | 'archive') {
    if (!canPublish) return;
    setPending(true);
    setError(null);
    try {
      const updated = await mutate(`/api/v1/admin/catalog/products/${product.id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion: version }),
      });
      setLocal(updated);
      setVersion(updated.version);
      setDirty(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setPending(false);
    }
  }

  async function onUpload(file: File) {
    if (!canUpdate) return;
    setPending(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('expectedVersion', String(version));
      const updated = await mutate(`/api/v1/admin/catalog/products/${product.id}/media`, {
        method: 'POST',
        body: form,
      });
      setLocal(updated);
      setVersion(updated.version);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setPending(false);
    }
  }

  const tabs = [
    ['basic', 'Основное'],
    ['variants', 'Варианты'],
    ['photos', 'Фото'],
    ['composition', 'Состав'],
    ['classification', 'Классификация'],
    ['seo', 'SEO'],
    ['publishing', 'Публикация'],
  ] as const;

  const taxonomyGroups = [
    ['categoryIds', 'Категории', taxonomies.categories, local.categories],
    ['occasionIds', 'Поводы', taxonomies.occasions, local.occasions],
    ['recipientIds', 'Кому', taxonomies.recipients, local.recipients],
    ['styleIds', 'Стили', taxonomies.styles, local.styles],
    ['colorIds', 'Цвета', taxonomies.colors, local.colors],
  ] as const;

  return (
    <form
      onSubmit={save}
      onChange={() => setDirty(true)}
      className="space-y-6"
    >
      {error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 border-b border-stone-200 pb-3">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === id ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'
            }`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'basic' ? (
        <div className="grid max-w-2xl gap-4">
          <label className="block text-sm">
            Название
            <input
              name="name"
              required
              defaultValue={local.name}
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
           Slug
            <input
              name="slug"
              required
              defaultValue={local.slug}
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Краткое описание
            <textarea
              name="shortDescription"
              defaultValue={local.shortDescription ?? ''}
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
              rows={2}
            />
          </label>
          <label className="block text-sm">
            Описание
            <textarea
              name="description"
              defaultValue={local.description ?? ''}
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
              rows={5}
            />
          </label>
          <label className="block text-sm">
            Доступность
            <select
              name="availability"
              defaultValue={local.availability}
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
            >
              <option value="AVAILABLE">AVAILABLE</option>
              <option value="TEMPORARILY_UNAVAILABLE">TEMPORARILY_UNAVAILABLE</option>
              <option value="PREORDER">PREORDER</option>
              <option value="SEASONAL">SEASONAL</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="featured" defaultChecked={local.featured} />
            Featured
          </label>
          <label className="block text-sm">
            Высота букета (см)
            <input
              name="heightCm"
              type="number"
              min={15}
              max={250}
              step={1}
              placeholder="не указана"
              defaultValue={local.heightCm ?? ''}
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
            />
            <span className="mt-1 block text-xs text-stone-500">
              Опционально. На карточке — при наведении; на странице товара — всегда у фото. Пусто =
              скрыть.
            </span>
          </label>
        </div>
      ) : null}

      {tab === 'variants' ? (
        <label className="block max-w-2xl text-sm">
          Варианты (строка: имя|priceMinor|ACTIVE)
          <textarea
            name="variants"
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 font-mono text-xs"
            rows={6}
            defaultValue={variantsDefault(local)}
          />
          <span className="mt-1 block text-stone-500">Цена: {local.price?.label ?? '—'}</span>
        </label>
      ) : null}

      {tab === 'photos' ? (
        <div className="space-y-4">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            disabled={!canUpdate || pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onUpload(file);
            }}
          />
          <ul className="grid gap-3 sm:grid-cols-3">
            {local.media.map((m) => (
              <li key={m.id} className="rounded-md border border-stone-200 p-2">
                <img
                  src={toSameOriginMediaUrl(m.url) ?? m.url}
                  alt={m.alt ?? ''}
                  className="aspect-square w-full rounded object-cover"
                />
                <p className="mt-1 text-xs text-stone-500">
                  {m.isPrimary ? 'Primary' : `Order ${m.sortOrder}`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {tab === 'composition' ? (
        <label className="block max-w-2xl text-sm">
          Состав (displayName|quantity|flowerId)
          <textarea
            name="components"
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 font-mono text-xs"
            rows={6}
            defaultValue={componentsDefault(local)}
          />
          <span className="mt-1 block text-xs text-stone-500">
            Flowers: {taxonomies.flowers.map((f) => `${f.name}=${f.id}`).join(', ') || 'нет'}
          </span>
        </label>
      ) : null}

      {tab === 'classification' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {taxonomyGroups.map(([name, label, options, selected]) => (
            <fieldset key={name} className="rounded-md border border-stone-200 p-3">
              <legend className="px-1 text-sm font-medium">{label}</legend>
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm">
                {options.map((opt) => (
                  <label key={opt.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name={name}
                      value={opt.id}
                      defaultChecked={selected.some((s) => s.id === opt.id)}
                    />
                    {opt.name}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      ) : null}

      {tab === 'seo' ? (
        <div className="grid max-w-2xl gap-4">
          <label className="block text-sm">
            SEO title
            <input
              name="seoTitle"
              defaultValue={local.seoTitle ?? ''}
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            SEO description
            <textarea
              name="seoDescription"
              defaultValue={local.seoDescription ?? ''}
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
              rows={3}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="noIndex" defaultChecked={local.noIndex} />
            noindex
          </label>
          <div className="rounded-md border border-stone-200 bg-stone-50 p-4 text-sm">
            <p className="font-medium text-blue-700">{local.seo.resolvedTitle}</p>
            <p className="text-green-700">/bukety/{local.slug}</p>
            <p className="mt-1 text-stone-600">{local.seo.resolvedDescription}</p>
            {seoWarnings.length ? (
              <ul className="mt-3 list-disc pl-5 text-amber-800">
                {seoWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === 'publishing' ? (
        <div className="grid max-w-xl gap-4">
          <p className="text-sm text-stone-600">
            Статус: <strong>{local.lifecycle}</strong> · version {version}
          </p>
          <label className="block text-sm">
            publishAt (ISO)
            <input
              name="publishAt"
              defaultValue={local.publishAt ?? ''}
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            unpublishAt (ISO)
            <input
              name="unpublishAt"
              defaultValue={local.unpublishAt ?? ''}
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {canPublish ? (
              <>
                <Button type="button" disabled={pending} onClick={() => void lifecycle('publish')}>
                  Опубликовать
                </Button>
                <Button type="button" disabled={pending} onClick={() => void lifecycle('unpublish')}>
                  Снять с публикации
                </Button>
                <Button type="button" disabled={pending} onClick={() => void lifecycle('archive')}>
                  В архив
                </Button>
              </>
            ) : null}
            <a
              className="rounded-md border border-stone-300 px-3 py-2 text-sm"
              href={`/admin/catalog/products/${product.id}/preview`}
            >
              Preview
            </a>
          </div>
        </div>
      ) : null}

      {/*
        Persist fields from inactive tabs so "Save" never sends empty variants/taxonomies
        or nulls SEO / publish schedules by accident.
      */}
      <div className="hidden" aria-hidden>
        {tab !== 'basic' ? (
          <>
            <input name="name" defaultValue={local.name} readOnly />
            <input name="slug" defaultValue={local.slug} readOnly />
            <input name="shortDescription" defaultValue={local.shortDescription ?? ''} readOnly />
            <input name="description" defaultValue={local.description ?? ''} readOnly />
            <input name="availability" defaultValue={local.availability} readOnly />
            <input name="heightCm" defaultValue={local.heightCm ?? ''} readOnly />
            {local.featured ? <input type="checkbox" name="featured" defaultChecked readOnly /> : null}
          </>
        ) : null}
        {tab !== 'variants' ? (
          <textarea name="variants" defaultValue={variantsDefault(local)} readOnly />
        ) : null}
        {tab !== 'composition' ? (
          <textarea name="components" defaultValue={componentsDefault(local)} readOnly />
        ) : null}
        {tab !== 'classification'
          ? taxonomyGroups.flatMap(([name, , , selected]) =>
              selected.map((item) => (
                <input key={`${name}-${item.id}`} type="checkbox" name={name} value={item.id} defaultChecked readOnly />
              )),
            )
          : null}
        {tab !== 'seo' ? (
          <>
            <input name="seoTitle" defaultValue={local.seoTitle ?? ''} readOnly />
            <input name="seoDescription" defaultValue={local.seoDescription ?? ''} readOnly />
            {local.noIndex ? <input type="checkbox" name="noIndex" defaultChecked readOnly /> : null}
          </>
        ) : null}
        {tab !== 'publishing' ? (
          <>
            <input name="publishAt" defaultValue={local.publishAt ?? ''} readOnly />
            <input name="unpublishAt" defaultValue={local.unpublishAt ?? ''} readOnly />
          </>
        ) : null}
      </div>

      {canUpdate ? (
        <Button type="submit" disabled={pending}>
          {pending ? 'Сохранение…' : 'Сохранить черновик'}
        </Button>
      ) : null}
    </form>
  );
}

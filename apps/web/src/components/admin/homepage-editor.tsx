'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  HOMEPAGE_SECTION_KINDS,
  type HomepageConfigAdminDto,
  type HomepageSectionDto,
  type HomepageSectionKind,
} from '@bouquet-one/contracts';
import { Button } from '@bouquet-one/ui';

type Props = {
  initial: HomepageConfigAdminDto;
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
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const err = new Error(
      typeof body?.message === 'string'
        ? body.message
        : Array.isArray(body?.message)
          ? body.message.join(', ')
          : `Request failed (${response.status})`,
    ) as Error & { status?: number };
    err.status = response.status;
    throw err;
  }
  return body as HomepageConfigAdminDto;
}

export function HomepageEditor({ initial, canUpdate }: Props) {
  const router = useRouter();
  const [version, setVersion] = useState(initial.version);
  const [hero, setHero] = useState(initial.hero);
  const [sections, setSections] = useState<HomepageSectionDto[]>(
    [...initial.sections].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  function updateSection(index: number, patch: Partial<HomepageSectionDto>) {
    setSections((prev) => prev.map((section, i) => (i === index ? { ...section, ...patch } : section)));
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!canUpdate) return;
    setPending(true);
    setError(null);
    setSavedAt(null);
    try {
      const updated = await mutate('/api/v1/admin/storefront/homepage', {
        method: 'PATCH',
        body: JSON.stringify({
          expectedVersion: version,
          hero: {
            title: hero.title.trim(),
            subtitle: hero.subtitle.trim(),
            imageUrl: hero.imageUrl?.trim() ? hero.imageUrl.trim() : null,
            ctaLabel: hero.ctaLabel.trim(),
            ctaHref: hero.ctaHref.trim(),
          },
          sections: sections.map((section) => ({
            id: section.id.trim(),
            kind: section.kind,
            enabled: section.enabled,
            heading: section.heading.trim(),
            collectionSlug:
              section.kind === 'collection'
                ? section.collectionSlug?.trim() || null
                : section.collectionSlug?.trim()
                  ? section.collectionSlug.trim()
                  : null,
            sortOrder: Number(section.sortOrder) || 0,
          })),
        }),
      });
      setVersion(updated.version);
      setHero(updated.hero);
      setSections(
        [...updated.sections].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
      );
      setSavedAt(new Date().toLocaleString('ru-BY'));
      router.refresh();
    } catch (err) {
      const status = err && typeof err === 'object' && 'status' in err ? Number(err.status) : 0;
      if (status === 409) {
        setError(
          'Конфликт версий (409): конфигурация изменена другим пользователем. Обновите страницу и сохраните снова.',
        );
      } else {
        setError(err instanceof Error ? err.message : 'Ошибка сохранения');
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSave} className="space-y-10">
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-stone-900">Hero</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm md:col-span-2">
            <span className="text-stone-600">Заголовок</span>
            <input
              required
              disabled={!canUpdate}
              value={hero.title}
              onChange={(e) => setHero((h) => ({ ...h, title: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="text-stone-600">Подзаголовок</span>
            <textarea
              required
              disabled={!canUpdate}
              rows={2}
              value={hero.subtitle}
              onChange={(e) => setHero((h) => ({ ...h, subtitle: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="text-stone-600">Image URL</span>
            <input
              disabled={!canUpdate}
              value={hero.imageUrl ?? ''}
              onChange={(e) =>
                setHero((h) => ({ ...h, imageUrl: e.target.value.length ? e.target.value : null }))
              }
              className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2"
              placeholder="/media/... или https://..."
            />
          </label>
          <label className="block text-sm">
            <span className="text-stone-600">CTA label</span>
            <input
              required
              disabled={!canUpdate}
              value={hero.ctaLabel}
              onChange={(e) => setHero((h) => ({ ...h, ctaLabel: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-stone-600">CTA href</span>
            <input
              required
              disabled={!canUpdate}
              value={hero.ctaHref}
              onChange={(e) => setHero((h) => ({ ...h, ctaHref: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2"
            />
          </label>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-stone-900">Секции</h2>
        <div className="space-y-4">
          {sections.map((section, index) => (
            <div key={section.id} className="grid gap-3 border-b border-stone-100 pb-4 md:grid-cols-6">
              <label className="block text-sm">
                <span className="text-stone-600">ID</span>
                <input
                  required
                  disabled={!canUpdate}
                  value={section.id}
                  onChange={(e) => updateSection(index, { id: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="text-stone-600">Kind</span>
                <select
                  disabled={!canUpdate}
                  value={section.kind}
                  onChange={(e) =>
                    updateSection(index, { kind: e.target.value as HomepageSectionKind })
                  }
                  className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2"
                >
                  {HOMEPAGE_SECTION_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm md:col-span-2">
                <span className="text-stone-600">Заголовок секции</span>
                <input
                  required
                  disabled={!canUpdate}
                  value={section.heading}
                  onChange={(e) => updateSection(index, { heading: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="text-stone-600">collectionSlug</span>
                <input
                  disabled={!canUpdate}
                  value={section.collectionSlug ?? ''}
                  onChange={(e) =>
                    updateSection(index, {
                      collectionSlug: e.target.value.length ? e.target.value : null,
                    })
                  }
                  className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2"
                  placeholder={section.kind === 'collection' ? 'required' : 'опц.'}
                />
              </label>
              <div className="flex items-end gap-4">
                <label className="block text-sm">
                  <span className="text-stone-600">sortOrder</span>
                  <input
                    type="number"
                    min={0}
                    disabled={!canUpdate}
                    value={section.sortOrder}
                    onChange={(e) => updateSection(index, { sortOrder: Number(e.target.value) || 0 })}
                    className="mt-1 block w-24 rounded-md border border-stone-300 px-3 py-2"
                  />
                </label>
                <label className="mb-2 flex items-center gap-2 text-sm text-stone-700">
                  <input
                    type="checkbox"
                    disabled={!canUpdate}
                    checked={section.enabled}
                    onChange={(e) => updateSection(index, { enabled: e.target.checked })}
                  />
                  Вкл.
                </label>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-4">
        {canUpdate ? (
          <Button type="submit" disabled={pending}>
            {pending ? 'Сохранение…' : 'Сохранить'}
          </Button>
        ) : (
          <p className="text-sm text-stone-500">Только просмотр (нет CONTENT_UPDATE)</p>
        )}
        <p className="text-sm text-stone-500">Версия {version}</p>
        {savedAt ? <p className="text-sm text-green-700">Сохранено: {savedAt}</p> : null}
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </form>
  );
}

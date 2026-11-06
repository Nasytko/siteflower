'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  DEFAULT_HOMEPAGE_H1,
  DEFAULT_HOMEPAGE_SEO_DESCRIPTION,
  DEFAULT_HOMEPAGE_SEO_TITLE,
  resolveHomepageSeo,
  type HomepageConfigAdminDto,
} from '@bouquet-one/contracts';
import { adminGet, adminPatch, errorMessage } from '@/lib/admin-client';
import { adminEndpoints } from '@/lib/admin-endpoints';

type Props = {
  initial: HomepageConfigAdminDto;
};

export function HomepageSeoEditor({ initial }: Props) {
  const [version, setVersion] = useState(initial.version);
  const [seoTitle, setSeoTitle] = useState(initial.seoTitle ?? '');
  const [seoDescription, setSeoDescription] = useState(initial.seoDescription ?? '');
  const [h1, setH1] = useState(initial.h1 ?? '');
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const resolved = useMemo(
    () =>
      resolveHomepageSeo({
        seoTitle,
        seoDescription,
        h1,
      }),
    [seoTitle, seoDescription, h1],
  );

  function save(next: { seoTitle: string; seoDescription: string; h1: string }) {
    setError(null);
    startTransition(async () => {
      try {
        const updated = await adminPatch<HomepageConfigAdminDto>(adminEndpoints.homepageSeo, {
          expectedVersion: version,
          seoTitle: next.seoTitle.trim() || null,
          seoDescription: next.seoDescription.trim() || null,
          h1: next.h1.trim() || null,
        });
        setVersion(updated.version);
        setSeoTitle(updated.seoTitle ?? '');
        setSeoDescription(updated.seoDescription ?? '');
        setH1(updated.h1 ?? '');
        setSavedAt(new Date().toISOString());
      } catch (err) {
        setError(errorMessage(err));
        const fresh = await adminGet<HomepageConfigAdminDto>(adminEndpoints.homepage).catch(
          () => null,
        );
        if (fresh) setVersion(fresh.version);
      }
    });
  }

  return (
    <section className="admin-card space-y-4" aria-labelledby="homepage-seo-heading">
      <div>
        <h2 id="homepage-seo-heading" className="text-lg font-semibold">
          SEO главной
        </h2>
        <p className="mt-1 text-sm text-muted">
          Title, description и H1 не зависят от промослайдов. Пустое поле возвращает автоматическое
          значение. Диагностика ниже — состояние сайта, не факт индексации в Google/Яндексе.
        </p>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Title</span>
        <input
          className="admin-input w-full"
          value={seoTitle}
          placeholder={DEFAULT_HOMEPAGE_SEO_TITLE}
          onChange={(event) => setSeoTitle(event.target.value)}
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Description</span>
        <textarea
          className="admin-input w-full min-h-[5rem]"
          value={seoDescription}
          placeholder={DEFAULT_HOMEPAGE_SEO_DESCRIPTION}
          onChange={(event) => setSeoDescription(event.target.value)}
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">H1</span>
        <input
          className="admin-input w-full"
          value={h1}
          placeholder={DEFAULT_HOMEPAGE_H1}
          onChange={(event) => setH1(event.target.value)}
        />
      </label>

      <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
        <p className="font-medium">Итоговые значения</p>
        <p className="mt-2">
          <span className="text-muted">Title:</span> {resolved.title}
        </p>
        <p className="mt-1">
          <span className="text-muted">Description:</span> {resolved.description}
        </p>
        <p className="mt-1">
          <span className="text-muted">H1:</span> {resolved.h1}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="admin-btn"
          disabled={pending}
          onClick={() => save({ seoTitle, seoDescription, h1 })}
        >
          Сохранить
        </button>
        <button
          type="button"
          className="admin-btn admin-btn--ghost"
          disabled={pending}
          onClick={() => {
            setSeoTitle('');
            setSeoDescription('');
            setH1('');
            save({ seoTitle: '', seoDescription: '', h1: '' });
          }}
        >
          Сбросить к автоматике
        </button>
        {savedAt ? (
          <span className="text-xs text-muted">
            Сохранено {new Date(savedAt).toLocaleTimeString('ru-BY')}
          </span>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CatalogPageDto, CatalogPageKind } from '@bouquet-one/contracts';
import { adminGet, adminPatch, adminPost, errorMessage } from '@/lib/admin-client';
import { adminEndpoints, withQuery } from '@/lib/admin-endpoints';
import { FormSaveStatus, type FormSavePhase } from '@/components/admin/form-status';

type Props = {
  canCreate: boolean;
  canUpdate: boolean;
  canPublish: boolean;
};

type EditorMode = 'closed' | 'create' | 'edit';

function kindLabel(kind: CatalogPageKind): string {
  switch (kind) {
    case 'SYSTEM_HUB':
      return 'Основной раздел';
    case 'THEMATIC':
      return 'Тематическая';
    case 'GIFT_SUBTYPE':
      return 'Подтип подарка';
    default:
      return kind;
  }
}

function statusLabel(page: CatalogPageDto): string {
  if (page.pageKind === 'SYSTEM_HUB') return 'Системный';
  if (page.status === 'PUBLISHED' || page.status === 'LIVE') return 'Опубликовано';
  if (page.status === 'ARCHIVED') return 'Архив';
  return 'Черновик';
}

export function CatalogPagesManager({ canCreate, canUpdate, canPublish }: Props) {
  const [pages, setPages] = useState<CatalogPageDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<FormSavePhase>('idle');
  const [q, setQ] = useState('');
  const [kindFilter, setKindFilter] = useState<'' | CatalogPageKind>('');
  const [mode, setMode] = useState<EditorMode>('closed');
  const [editing, setEditing] = useState<CatalogPageDto | null>(null);
  const [draft, setDraft] = useState({
    name: '',
    slug: '',
    h1: '',
    rulesJson: '{\n  "productKinds": ["BOUQUET"]\n}',
  });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await adminGet<CatalogPageDto[]>(
        withQuery(adminEndpoints.catalogPages, {
          q: q.trim() || undefined,
          pageKind: kindFilter || undefined,
          withCounts: '1',
        }),
      );
      setPages(data);
    } catch (err) {
      setError(errorMessage(err, 'Не удалось загрузить страницы'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [kindFilter]);

  const hubs = useMemo(
    () => pages.filter((p) => p.pageKind === 'SYSTEM_HUB'),
    [pages],
  );
  const thematic = useMemo(
    () => pages.filter((p) => p.pageKind !== 'SYSTEM_HUB'),
    [pages],
  );

  function openCreate() {
    setMode('create');
    setEditing(null);
    setDraft({
      name: '',
      slug: '',
      h1: '',
      rulesJson: '{\n  "productKinds": ["BOUQUET"],\n  "containsFlowerType": "roza"\n}',
    });
  }

  function openEdit(page: CatalogPageDto) {
    setMode('edit');
    setEditing(page);
    setDraft({
      name: page.name,
      slug: page.slug,
      h1: page.h1 ?? page.name,
      rulesJson: JSON.stringify(page.rules ?? {}, null, 2),
    });
  }

  function closeEditor() {
    setMode('closed');
    setEditing(null);
  }

  async function save() {
    if (!canUpdate && !canCreate) return;
    let rules: Record<string, unknown> = {};
    try {
      rules = JSON.parse(draft.rulesJson) as Record<string, unknown>;
    } catch {
      setError('Правила должны быть корректным JSON');
      setPhase('validation');
      return;
    }
    setPhase('saving');
    setError(null);
    try {
      if (mode === 'edit' && editing) {
        if (editing.isSystem) {
          setError('Системный раздел нельзя редактировать здесь');
          setPhase('server');
          return;
        }
        const updated = await adminPatch<CatalogPageDto>(adminEndpoints.catalogPage(editing.id), {
          expectedVersion: editing.version,
          name: draft.name,
          slug: draft.slug,
          h1: draft.h1,
          rules,
        });
        setEditing(updated);
      } else {
        if (!canCreate) return;
        const created = await adminPost<CatalogPageDto>(adminEndpoints.catalogPages, {
          name: draft.name,
          slug: draft.slug || undefined,
          h1: draft.h1 || undefined,
          rules,
        });
        setEditing(created);
        setMode('edit');
      }
      setPhase('saved');
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось сохранить'));
      setPhase('server');
    }
  }

  async function publish() {
    if (!editing || !canPublish || editing.isSystem) return;
    setPhase('saving');
    try {
      const updated = await adminPost<CatalogPageDto>(
        adminEndpoints.catalogPagePublish(editing.id),
        { expectedVersion: editing.version },
      );
      setEditing(updated);
      setPhase('saved');
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось опубликовать'));
      setPhase('server');
    }
  }

  const showEditor = mode !== 'closed';

  return (
    <div className="space-y-6">
      <FormSaveStatus phase={phase} errorMessage={error} onDismiss={() => setError(null)} />

      <div className="flex flex-wrap items-end gap-3">
        <label className="admin-field min-w-[12rem] flex-1">
          <span>Поиск</span>
          <input
            className="admin-input"
            value={q}
            placeholder="Название или URL…"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void load();
            }}
          />
        </label>
        <label className="admin-field">
          <span>Тип</span>
          <select
            className="admin-select"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as '' | CatalogPageKind)}
          >
            <option value="">Все</option>
            <option value="SYSTEM_HUB">Основные</option>
            <option value="THEMATIC">Тематические</option>
            <option value="GIFT_SUBTYPE">Подарки</option>
          </select>
        </label>
        <button type="button" className="admin-btn-ghost" onClick={() => void load()}>
          Найти
        </button>
        {canCreate ? (
          <button type="button" className="admin-btn" onClick={openCreate}>
            + Страница
          </button>
        ) : null}
      </div>

      {showEditor ? (
        <div className="admin-panel max-w-xl space-y-3 p-4">
          <h2 className="text-base font-semibold">
            {editing ? `Изменить: ${editing.name}` : 'Новая тематическая страница'}
          </h2>
          {editing?.isSystem ? (
            <p className="text-sm text-[var(--admin-muted)]">
              Системный раздел определяется типом товара. Редактирование правил недоступно.
            </p>
          ) : (
            <>
              <label className="admin-field">
                <span>Название</span>
                <input
                  className="admin-input"
                  value={draft.name}
                  disabled={!canUpdate && mode !== 'create'}
                  onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
                />
              </label>
              <label className="admin-field">
                <span>URL (slug)</span>
                <input
                  className="admin-input"
                  value={draft.slug}
                  disabled={!canUpdate && mode !== 'create'}
                  onChange={(e) => setDraft((p) => ({ ...p, slug: e.target.value }))}
                />
              </label>
              <label className="admin-field">
                <span>H1</span>
                <input
                  className="admin-input"
                  value={draft.h1}
                  disabled={!canUpdate && mode !== 'create'}
                  onChange={(e) => setDraft((p) => ({ ...p, h1: e.target.value }))}
                />
              </label>
              <label className="admin-field">
                <span>Какие товары показывать</span>
                <textarea
                  className="admin-input font-mono text-xs"
                  rows={8}
                  value={draft.rulesJson}
                  disabled={!canUpdate && mode !== 'create'}
                  onChange={(e) => setDraft((p) => ({ ...p, rulesJson: e.target.value }))}
                />
                <span className="admin-field__hint">
                  Примеры: containsFlowerType (с розами), onlyFlowerType (из роз),
                  compositionKinds MONO/MIXED, traitKeys AUTHORIAL
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="admin-btn"
                  disabled={phase === 'saving'}
                  onClick={() => void save()}
                >
                  Сохранить
                </button>
                {editing && canPublish && editing.status !== 'PUBLISHED' ? (
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    disabled={phase === 'saving'}
                    onClick={() => void publish()}
                  >
                    Опубликовать
                  </button>
                ) : null}
                <button type="button" className="admin-btn-ghost" onClick={closeEditor}>
                  Закрыть
                </button>
              </div>
            </>
          )}
          {editing?.isSystem ? (
            <button type="button" className="admin-btn-ghost" onClick={closeEditor}>
              Закрыть
            </button>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-[var(--admin-muted)]">Загрузка…</p>
      ) : pages.length === 0 ? (
        <div className="admin-panel space-y-3 p-6">
          <p className="font-medium">Пока нет страниц каталога</p>
          <p className="text-sm text-[var(--admin-muted)]">
            Основные разделы появятся после миграции. Тематическую страницу можно создать кнопкой
            выше — например «Букеты с розами».
          </p>
          {canCreate ? (
            <button type="button" className="admin-btn" onClick={openCreate}>
              Создать первую страницу
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-6">
          {hubs.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--admin-muted)]">
                Основные разделы
              </h3>
              <PageTable pages={hubs} onEdit={openEdit} />
            </section>
          ) : null}
          {thematic.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--admin-muted)]">
                Тематические и прочие
              </h3>
              <PageTable pages={thematic} onEdit={openEdit} />
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function PageTable({
  pages,
  onEdit,
}: {
  pages: CatalogPageDto[];
  onEdit: (page: CatalogPageDto) => void;
}) {
  return (
    <div className="admin-panel overflow-x-auto">
      <table className="admin-table min-w-[720px]">
        <thead>
          <tr>
            <th>Название</th>
            <th>Тип</th>
            <th>Правило</th>
            <th>Товаров</th>
            <th>Статус</th>
            <th>URL</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {pages.map((page) => (
            <tr key={page.id}>
              <td className="font-medium">{page.name}</td>
              <td className="text-sm">{kindLabel(page.pageKind)}</td>
              <td className="max-w-[14rem] truncate text-xs text-[var(--admin-muted)]">
                {page.rulesSummary}
              </td>
              <td className="text-sm tabular-nums">
                {page.productsCount == null ? '—' : page.productsCount}
              </td>
              <td className="text-sm">{statusLabel(page)}</td>
              <td className="text-xs">
                <a href={page.publicPath} className="admin-link" target="_blank" rel="noreferrer">
                  {page.publicPath}
                </a>
              </td>
              <td>
                <button type="button" className="admin-btn-ghost text-xs" onClick={() => onEdit(page)}>
                  Изменить
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

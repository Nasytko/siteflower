'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PaginatedResponse, TaxonomyVisibility } from '@bouquet-one/contracts';
import { normalizeSlug } from '@bouquet-one/contracts';
import { Button } from '@bouquet-one/ui';
import { adminGet, adminPatch, adminPost, AdminRequestError, errorMessage } from '@/lib/admin-client';
import { adminEndpoints, withQuery, type TaxonomyKindMeta } from '@/lib/admin-endpoints';
import { unwrapAdminList } from '@/lib/admin-list';
import { formatAdminDate, visibilityLabel } from '@/lib/admin-labels';
import { FormSaveStatus, phaseFromAdminError, type FormSavePhase } from '@/components/admin/form-status';

/** Shape shared by TaxonomyAdminDto, ColorAdminDto and BouquetSizeAdminDto. */
export type TaxonomyRow = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  swatch?: string | null;
  sortOrder: number;
  visibility: TaxonomyVisibility;
  version: number;
  updatedAt: string;
};

type Props = {
  meta: TaxonomyKindMeta;
  initial: TaxonomyRow[];
  canCreate: boolean;
  canUpdate: boolean;
};

type Draft = {
  name: string;
  slug: string;
  description: string;
  swatch: string;
};

function byOrder(a: TaxonomyRow, b: TaxonomyRow): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ru');
}

function toDraft(row: TaxonomyRow): Draft {
  return {
    name: row.name,
    slug: row.slug,
    description: row.description ?? '',
    swatch: row.swatch ?? '',
  };
}

export function TaxonomyCrud({ meta, initial, canCreate, canUpdate }: Props) {
  const router = useRouter();
  const listPath = withQuery(adminEndpoints.taxonomy(meta.kind), { page: 1, pageSize: 200 });

  const [rows, setRows] = useState<TaxonomyRow[]>(() => [...initial].sort(byOrder));
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [slugManual, setSlugManual] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [phase, setPhase] = useState<FormSavePhase>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (needle.length === 0) return rows;
    return rows.filter(
      (row) =>
        row.name.toLowerCase().includes(needle) || row.slug.toLowerCase().includes(needle),
    );
  }, [rows, search]);

  const searching = search.trim().length > 0;

  async function reload() {
    const payload = await adminGet<PaginatedResponse<TaxonomyRow> | TaxonomyRow[]>(listPath);
    setRows(unwrapAdminList(payload).sort(byOrder));
  }

  async function run(action: () => Promise<void>, successMessage?: string) {
    setPending(true);
    setError(null);
    setRequestId(null);
    setNotice(null);
    setPhase('saving');
    try {
      await action();
      await reload();
      if (successMessage) {
        setNotice(successMessage);
        setPhase('saved');
      } else {
        setPhase('idle');
      }
      router.refresh();
    } catch (err) {
      if (err instanceof AdminRequestError) {
        setPhase(phaseFromAdminError(err));
        setRequestId(err.requestId ?? null);
      } else {
        setPhase('server');
      }
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    if (name.length === 0) return;
    const slug = String(data.get('slug') ?? '').trim();
    const swatch = String(data.get('swatch') ?? '').trim();

    await run(async () => {
      await adminPost(adminEndpoints.taxonomy(meta.kind), {
        name,
        ...(slug.length > 0 ? { slug } : {}),
        ...(meta.hasSwatch && swatch.length > 0 ? { swatch } : {}),
        sortOrder: (rows.at(-1)?.sortOrder ?? 0) + 10,
      });
      form.reset();
    }, `«${name}» добавлен`);
  }

  function startEdit(row: TaxonomyRow) {
    setEditingId(row.id);
    setDraft(toDraft(row));
    setSlugManual(normalizeSlug(row.name) !== row.slug);
    setNotice(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
    setSlugManual(false);
  }

  async function saveEdit(row: TaxonomyRow) {
    if (!canUpdate || !draft) return;
    const name = draft.name.trim();
    if (name.length === 0) {
      setError('Название не может быть пустым');
      return;
    }
    await run(async () => {
      await adminPatch(adminEndpoints.taxonomyItem(meta.kind, row.id), {
        expectedVersion: row.version,
        name,
        slug: draft.slug.trim() || row.slug,
        ...(meta.hasDescription ? { description: draft.description.trim() || null } : {}),
        ...(meta.hasSwatch ? { swatch: draft.swatch.trim() || null } : {}),
      });
      cancelEdit();
    }, 'Изменения сохранены');
  }

  async function toggleVisibility(row: TaxonomyRow) {
    if (!canUpdate) return;
    const next: TaxonomyVisibility = row.visibility === 'VISIBLE' ? 'HIDDEN' : 'VISIBLE';
    await run(
      async () => {
        await adminPatch(adminEndpoints.taxonomyItem(meta.kind, row.id), {
          expectedVersion: row.version,
          visibility: next,
        });
      },
      next === 'HIDDEN'
        ? `«${row.name}» скрыт: пропадёт из подбора на витрине, товары остаются`
        : `«${row.name}» снова показан на витрине`,
    );
  }

  /** Move one position and renumber the affected rows (10, 20, 30 …). */
  async function move(row: TaxonomyRow, direction: -1 | 1) {
    if (!canUpdate || searching) return;
    const index = rows.findIndex((item) => item.id === row.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= rows.length) return;

    const reordered = [...rows];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved!);

    await run(async () => {
      for (const [position, item] of reordered.entries()) {
        const sortOrder = (position + 1) * 10;
        if (item.sortOrder === sortOrder) continue;
        await adminPatch(adminEndpoints.taxonomyItem(meta.kind, item.id), {
          expectedVersion: item.version,
          sortOrder,
        });
      }
    });
  }

  return (
    <div className="space-y-6">
      <FormSaveStatus
        phase={phase}
        savedLabel={notice}
        errorMessage={error}
        requestId={requestId}
        onRefresh={() => void reload()}
        onDismiss={() => {
          setError(null);
          setPhase(notice ? 'saved' : 'idle');
        }}
      />

      <div className="admin-toolbar">
        <label className="admin-field">
          <span>Поиск</span>
          <input
            className="admin-input w-56"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Название или адрес"
          />
        </label>
        <p className="admin-toolbar__hint">
          Всего: {rows.length} · показано: {visible.length}
        </p>
      </div>

      {canCreate ? (
        <form onSubmit={onCreate} className="admin-toolbar">
          <label className="admin-field">
            <span>Название</span>
            <input name="name" required className="admin-input w-56" placeholder="Например, Пионы" />
          </label>
          <label className="admin-field">
            <span>Адрес в ссылке</span>
            <input
              name="slug"
              className="admin-input w-48"
              placeholder="авто из названия"
            />
          </label>
          {meta.hasSwatch ? (
            <label className="admin-field">
              <span>Оттенок</span>
              <input name="swatch" type="color" className="admin-input admin-input--color" />
            </label>
          ) : null}
          <Button type="submit" disabled={pending} className="!rounded-lg !bg-[var(--admin-brand)]">
            Добавить
          </Button>
        </form>
      ) : null}

      {visible.length === 0 ? (
        <div className="admin-panel">
          <p className="admin-empty">
            {searching ? 'Ничего не найдено' : 'Справочник пока пуст'}
          </p>
        </div>
      ) : (
        <div className="admin-panel overflow-x-auto">
          <table className="admin-table min-w-[720px]">
            <thead>
              <tr>
                <th className="w-20">Порядок</th>
                <th>Название</th>
                <th className="w-40">Витрина</th>
                <th className="w-32">Обновлён</th>
                <th className="w-52">Действия</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const editing = editingId === row.id && draft !== null;
                const index = rows.findIndex((item) => item.id === row.id);
                return (
                  <tr key={row.id} className={row.visibility === 'HIDDEN' ? 'admin-row--muted' : ''}>
                    <td>
                      <div className="admin-row-actions">
                        <button
                          type="button"
                          className="admin-icon-btn"
                          aria-label="Выше"
                          title={searching ? 'Очистите поиск, чтобы менять порядок' : 'Выше'}
                          disabled={!canUpdate || pending || searching || index <= 0}
                          onClick={() => void move(row, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="admin-icon-btn"
                          aria-label="Ниже"
                          title={searching ? 'Очистите поиск, чтобы менять порядок' : 'Ниже'}
                          disabled={
                            !canUpdate || pending || searching || index === rows.length - 1
                          }
                          onClick={() => void move(row, 1)}
                        >
                          ↓
                        </button>
                      </div>
                    </td>
                    <td>
                      {editing ? (
                        <div className="grid gap-2">
                          <input
                            className="admin-input"
                            value={draft.name}
                            aria-label="Название"
                            onChange={(event) => {
                              const name = event.target.value;
                              setDraft((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      name,
                                      ...(slugManual ? {} : { slug: normalizeSlug(name) }),
                                    }
                                  : prev,
                              );
                            }}
                          />
                          <input
                            className="admin-input"
                            value={draft.slug}
                            aria-label="Адрес в ссылке"
                            onChange={(event) => {
                              setSlugManual(true);
                              setDraft((prev) =>
                                prev ? { ...prev, slug: event.target.value } : prev,
                              );
                            }}
                          />
                          {meta.hasDescription ? (
                            <textarea
                              className="admin-input"
                              rows={2}
                              aria-label="Описание"
                              placeholder="Описание для страницы подбора"
                              value={draft.description}
                              onChange={(event) =>
                                setDraft((prev) =>
                                  prev ? { ...prev, description: event.target.value } : prev,
                                )
                              }
                            />
                          ) : null}
                          {meta.hasSwatch ? (
                            <label className="admin-field admin-field--row">
                              <span>Оттенок</span>
                              <input
                                type="color"
                                className="admin-input admin-input--color"
                                value={draft.swatch || '#ffffff'}
                                onChange={(event) =>
                                  setDraft((prev) =>
                                    prev ? { ...prev, swatch: event.target.value } : prev,
                                  )
                                }
                              />
                              <button
                                type="button"
                                className="admin-btn-ghost"
                                onClick={() =>
                                  setDraft((prev) => (prev ? { ...prev, swatch: '' } : prev))
                                }
                              >
                                Убрать
                              </button>
                            </label>
                          ) : null}
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          {meta.hasSwatch ? (
                            <span
                              aria-hidden
                              className="admin-swatch"
                              style={row.swatch ? { background: row.swatch } : undefined}
                            />
                          ) : null}
                          <div>
                            <p className="font-semibold text-[var(--admin-ink)]">{row.name}</p>
                            <p className="mt-0.5 text-xs text-[var(--admin-muted)]">/{row.slug}</p>
                          </div>
                        </div>
                      )}
                    </td>
                    <td>
                      <span
                        className={`admin-chip ${
                          row.visibility === 'VISIBLE' ? '' : 'admin-chip--muted'
                        }`}
                      >
                        {visibilityLabel(row.visibility)}
                      </span>
                    </td>
                    <td className="text-[var(--admin-muted)]">{formatAdminDate(row.updatedAt)}</td>
                    <td>
                      {canUpdate ? (
                        <div className="admin-row-actions">
                          {editing ? (
                            <>
                              <button
                                type="button"
                                className="admin-btn-ghost"
                                disabled={pending}
                                onClick={() => void saveEdit(row)}
                              >
                                Сохранить
                              </button>
                              <button
                                type="button"
                                className="admin-btn-ghost"
                                disabled={pending}
                                onClick={cancelEdit}
                              >
                                Отмена
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="admin-btn-ghost"
                                disabled={pending}
                                onClick={() => startEdit(row)}
                              >
                                Изменить
                              </button>
                              <button
                                type="button"
                                className="admin-btn-ghost"
                                disabled={pending}
                                onClick={() => void toggleVisibility(row)}
                              >
                                {row.visibility === 'VISIBLE' ? 'Скрыть' : 'Показать'}
                              </button>
                            </>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-[var(--admin-muted)]">Только просмотр</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="admin-help">
        Скрытая запись не удаляется: она исчезает из подбора на витрине, но остаётся у товаров и в
        истории заказов.
      </p>
    </div>
  );
}

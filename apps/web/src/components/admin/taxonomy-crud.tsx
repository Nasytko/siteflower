'use client';

import {
  Fragment,
  FormEvent,
  useMemo,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import type {
  PaginatedResponse,
  TaxonomyDeleteImpactDto,
  TaxonomyVisibility,
} from '@bouquet-one/contracts';
import { normalizeSlug } from '@bouquet-one/contracts';
import { Button } from '@bouquet-one/ui';
import {
  adminDelete,
  adminGet,
  adminPatch,
  adminPost,
  AdminRequestError,
  errorMessage,
} from '@/lib/admin-client';
import { adminEndpoints, withQuery, type TaxonomyKindMeta } from '@/lib/admin-endpoints';
import { unwrapAdminList } from '@/lib/admin-list';
import { formatAdminDate, visibilityLabel } from '@/lib/admin-labels';
import { FormSaveStatus, phaseFromAdminError, type FormSavePhase } from '@/components/admin/form-status';

/** Shape shared by TaxonomyAdminDto and ColorAdminDto. */
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
  seoTitle?: string | null;
  seoDescription?: string | null;
  noIndex?: boolean;
  productsCount?: number;
  flowerItemsCount?: number;
  componentsCount?: number;
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
  seoTitle: string;
  seoDescription: string;
  noIndex: boolean;
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
    seoTitle: row.seoTitle ?? '',
    seoDescription: row.seoDescription ?? '',
    noIndex: row.noIndex ?? false,
  };
}

function linksCount(row: TaxonomyRow): number {
  return (row.productsCount ?? 0) + (row.flowerItemsCount ?? 0) + (row.componentsCount ?? 0);
}

/** Dense expand-row table for audience taxonomies; colors keep the card layout. */
function usesExpandTable(meta: TaxonomyKindMeta): boolean {
  return meta.kind === 'occasions' || meta.kind === 'holidays' || meta.kind === 'recipients';
}

export function TaxonomyCrud({ meta, initial, canCreate, canUpdate }: Props) {
  const router = useRouter();
  const listPath = withQuery(adminEndpoints.taxonomy(meta.kind), { page: 1, pageSize: 200 });
  const expandTable = usesExpandTable(meta);

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

  function toggleEdit(row: TaxonomyRow) {
    if (!canUpdate) return;
    if (editingId === row.id) {
      cancelEdit();
      return;
    }
    startEdit(row);
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
        ...(meta.hasSeo
          ? {
              seoTitle: draft.seoTitle.trim() || null,
              seoDescription: draft.seoDescription.trim() || null,
              noIndex: draft.noIndex,
            }
          : {}),
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

  async function removeRow(row: TaxonomyRow) {
    if (!canUpdate) return;
    const impact = await adminGet<TaxonomyDeleteImpactDto>(
      adminEndpoints.taxonomyDeleteImpact(meta.kind, row.id),
    );
    if (!impact.canDelete) {
      setError(impact.blockers.map((item) => item.message).join(' '));
      setPhase('server');
      return;
    }
    if (!window.confirm(`Удалить «${row.name}» навсегда? Запись нигде не используется.`)) return;
    if (editingId === row.id) cancelEdit();
    await run(async () => {
      await adminDelete(adminEndpoints.taxonomyItem(meta.kind, row.id), {
        expectedVersion: row.version,
      });
    }, `«${row.name}» удалена`);
  }

  /**
   * Detach this label from every product. Two-step confirm:
   * 1) yes/no with count, 2) type the exact name.
   */
  async function unlinkAllProducts(row: TaxonomyRow) {
    if (!canUpdate) return;
    const count = row.productsCount ?? 0;
    if (count <= 0) {
      setError('К этой записи товары не привязаны');
      setPhase('server');
      return;
    }
    const ok = window.confirm(
      `Отвязать «${row.name}» от ${count} ${productWord(count)}?\n\n` +
        `Товары останутся в каталоге — снимется только эта метка.\n` +
        `После отвязки запись можно будет удалить, если больше нигде не используется.`,
    );
    if (!ok) return;
    const typed = window.prompt(
      `Для подтверждения введите название точно:\n${row.name}`,
      '',
    );
    if (typed === null) return;
    if (typed.trim() !== row.name) {
      setError('Отвязка отменена: название введено неверно');
      setPhase('server');
      return;
    }
    setPending(true);
    setError(null);
    setRequestId(null);
    setNotice(null);
    setPhase('saving');
    try {
      const result = await adminPost<{ unlinkedCount: number }>(
        adminEndpoints.taxonomyUnlinkProducts(meta.kind, row.id),
        {
          expectedVersion: row.version,
          confirmName: row.name,
        },
      );
      await reload();
      if (editingId === row.id) cancelEdit();
      setNotice(
        result.unlinkedCount > 0
          ? `Отвязано товаров: ${result.unlinkedCount}. Теперь запись можно удалить, если связей не осталось.`
          : 'Привязанных товаров не оказалось',
      );
      setPhase('saved');
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

  function productWord(count: number): string {
    const n = Math.abs(count) % 100;
    const n1 = n % 10;
    if (n1 === 1 && n !== 11) return 'товара';
    return 'товаров';
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

  function updateDraftName(name: string) {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            name,
            ...(slugManual ? {} : { slug: normalizeSlug(name) }),
          }
        : prev,
    );
  }

  function renderEditFields() {
    if (!draft) return null;
    return (
      <div className="admin-tax-edit">
        <div className="admin-tax-edit__grid">
          <label className="admin-field">
            <span>Название</span>
            <input
              className="admin-input"
              value={draft.name}
              autoFocus
              onChange={(event) => updateDraftName(event.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>Адрес в ссылке</span>
            <input
              className="admin-input"
              value={draft.slug}
              onChange={(event) => {
                setSlugManual(true);
                setDraft((prev) => (prev ? { ...prev, slug: event.target.value } : prev));
              }}
            />
          </label>
          {meta.hasSwatch ? (
            <label className="admin-field admin-field--row">
              <span>Оттенок</span>
              <input
                type="color"
                className="admin-input admin-input--color"
                value={draft.swatch || '#ffffff'}
                onChange={(event) =>
                  setDraft((prev) => (prev ? { ...prev, swatch: event.target.value } : prev))
                }
              />
              <button
                type="button"
                className="admin-btn-ghost"
                onClick={() => setDraft((prev) => (prev ? { ...prev, swatch: '' } : prev))}
              >
                Убрать
              </button>
            </label>
          ) : null}
        </div>
        {meta.hasDescription ? (
          <label className="admin-field">
            <span>Описание</span>
            <textarea
              className="admin-input"
              rows={2}
              placeholder="Кратко для страницы подбора на витрине"
              value={draft.description}
              onChange={(event) =>
                setDraft((prev) =>
                  prev ? { ...prev, description: event.target.value } : prev,
                )
              }
            />
          </label>
        ) : null}
        {meta.hasSeo ? (
          <div className="admin-tax-edit__seo">
            <p className="admin-help !mt-0 !mb-0">
              SEO необязательно. Если пусто — сайт сам соберёт заголовок и описание.
            </p>
            <label className="admin-field">
              <span>SEO-заголовок</span>
              <input
                className="admin-input"
                value={draft.seoTitle}
                placeholder="Автоматически"
                onChange={(event) =>
                  setDraft((prev) => (prev ? { ...prev, seoTitle: event.target.value } : prev))
                }
              />
            </label>
            <label className="admin-field">
              <span>SEO-описание</span>
              <textarea
                className="admin-input"
                rows={2}
                value={draft.seoDescription}
                placeholder="Автоматически"
                onChange={(event) =>
                  setDraft((prev) =>
                    prev ? { ...prev, seoDescription: event.target.value } : prev,
                  )
                }
              />
            </label>
            <label className="admin-check">
              <input
                type="checkbox"
                checked={draft.noIndex}
                onChange={(event) =>
                  setDraft((prev) =>
                    prev ? { ...prev, noIndex: event.target.checked } : prev,
                  )
                }
              />
              Скрыть страницу от поисковых систем
            </label>
          </div>
        ) : null}
      </div>
    );
  }

  function renderExpandTable() {
    const colCount = 6;
    return (
      <div className="admin-panel admin-table-wrap">
        <table className="admin-table admin-table--compact admin-table--taxonomy">
          <thead>
            <tr>
              <th className="w-16">#</th>
              <th>Название</th>
              <th className="w-28">Витрина</th>
              <th className="w-20">Связи</th>
              <th className="w-28">Обновлён</th>
              <th className="w-36"> </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const editing = editingId === row.id && draft !== null;
              const index = rows.findIndex((item) => item.id === row.id);
              const openRow = (event?: MouseEvent | KeyboardEvent) => {
                if (!canUpdate) return;
                const target = event?.target as HTMLElement | undefined;
                if (target?.closest('button, a, input, textarea, label, select')) return;
                toggleEdit(row);
              };
              return (
                <Fragment key={row.id}>
                  <tr
                    className={[
                      'admin-tax-row',
                      canUpdate ? 'admin-tax-row--interactive' : '',
                      editing ? 'admin-tax-row--open' : '',
                      row.visibility === 'HIDDEN' ? 'admin-row--muted' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    tabIndex={canUpdate ? 0 : undefined}
                    aria-expanded={canUpdate ? editing : undefined}
                    onClick={openRow}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openRow(event);
                      }
                    }}
                  >
                    <td>
                      <div className="admin-row-actions" onClick={(event) => event.stopPropagation()}>
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
                      <div className="admin-tax-row__name">
                        <span className="admin-tax-row__chevron" aria-hidden>
                          {editing ? '▾' : '▸'}
                        </span>
                        <div className="min-w-0">
                          <p className="admin-tax-row__title">{row.name}</p>
                          <p className="admin-tax-row__slug">/{row.slug}</p>
                        </div>
                      </div>
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
                    <td className="tabular-nums">{linksCount(row)}</td>
                    <td className="text-[var(--admin-muted)] whitespace-nowrap">
                      {formatAdminDate(row.updatedAt)}
                    </td>
                    <td onClick={(event) => event.stopPropagation()}>
                      {canUpdate ? (
                        <div className="admin-row-actions justify-end">
                          <button
                            type="button"
                            className="admin-btn-ghost"
                            disabled={pending}
                            onClick={() => void toggleVisibility(row)}
                          >
                            {row.visibility === 'VISIBLE' ? 'Скрыть' : 'Показать'}
                          </button>
                          {(row.productsCount ?? 0) > 0 ? (
                            <button
                              type="button"
                              className="admin-btn-ghost text-[var(--admin-danger)]"
                              disabled={pending}
                              title="Снять метку со всех товаров"
                              onClick={() => void unlinkAllProducts(row)}
                            >
                              Отвязать ({row.productsCount})
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="admin-btn-ghost text-[var(--admin-danger)]"
                            disabled={pending}
                            onClick={() => void removeRow(row)}
                          >
                            Удалить
                          </button>
                        </div>
                      ) : (
                        <span className="text-sm text-[var(--admin-muted)]">Просмотр</span>
                      )}
                    </td>
                  </tr>
                  {editing ? (
                    <tr className="admin-tax-expand">
                      <td colSpan={colCount}>
                        {renderEditFields()}
                        <div className="admin-tax-edit__actions">
                          <Button
                            type="button"
                            disabled={pending}
                            className="!rounded-lg !bg-[var(--admin-brand)]"
                            onClick={() => void saveEdit(row)}
                          >
                            Сохранить
                          </Button>
                          <button
                            type="button"
                            className="admin-btn-ghost"
                            disabled={pending}
                            onClick={cancelEdit}
                          >
                            Отмена
                          </button>
                          {(row.productsCount ?? 0) > 0 ? (
                            <button
                              type="button"
                              className="admin-btn-ghost text-[var(--admin-danger)]"
                              disabled={pending}
                              title="Снять метку со всех товаров, чтобы можно было удалить запись"
                              onClick={() => void unlinkAllProducts(row)}
                            >
                              Отвязать товары ({row.productsCount})
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  function renderCardTable() {
    return (
      <div className="admin-panel admin-table-wrap admin-table-wrap--cards">
        <table className="admin-table admin-table--compact">
          <thead>
            <tr>
              <th className="w-20">Порядок</th>
              <th>Название</th>
              <th className="w-40">Витрина</th>
              <th className="w-28">Связи</th>
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
                  <td data-hide-mobile>
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
                  <td data-primary>
                    {editing ? (
                      renderEditFields()
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
                  <td data-label="Витрина">
                    <span
                      className={`admin-chip ${
                        row.visibility === 'VISIBLE' ? '' : 'admin-chip--muted'
                      }`}
                    >
                      {visibilityLabel(row.visibility)}
                    </span>
                  </td>
                  <td data-label="Связи" className="text-sm tabular-nums">
                    {linksCount(row)}
                  </td>
                  <td data-label="Обновлён" className="text-[var(--admin-muted)]">
                    {formatAdminDate(row.updatedAt)}
                  </td>
                  <td data-label="Действия">
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
                            {(row.productsCount ?? 0) > 0 ? (
                              <button
                                type="button"
                                className="admin-btn-ghost text-[var(--admin-danger)]"
                                disabled={pending}
                                title="Снять метку со всех товаров, чтобы можно было удалить запись"
                                onClick={() => void unlinkAllProducts(row)}
                              >
                                Отвязать товары ({row.productsCount})
                              </button>
                            ) : null}
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
                            {(row.productsCount ?? 0) > 0 ? (
                              <button
                                type="button"
                                className="admin-btn-ghost text-[var(--admin-danger)]"
                                disabled={pending}
                                title="Снять метку со всех товаров, чтобы можно было удалить запись"
                                onClick={() => void unlinkAllProducts(row)}
                              >
                                Отвязать ({row.productsCount})
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="admin-btn-ghost text-[var(--admin-danger)]"
                              disabled={pending}
                              onClick={() => void removeRow(row)}
                            >
                              Удалить
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
    );
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
          {expandTable && canUpdate ? ' · нажмите строку, чтобы редактировать' : ''}
        </p>
      </div>

      {canCreate ? (
        <form onSubmit={onCreate} className="admin-toolbar">
          <label className="admin-field">
            <span>Название</span>
            <input
              name="name"
              required
              className="admin-input w-56"
              placeholder={`Новый ${meta.itemLabel}`}
            />
          </label>
          <label className="admin-field">
            <span>Адрес в ссылке</span>
            <input name="slug" className="admin-input w-48" placeholder="авто из названия" />
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
      ) : expandTable ? (
        renderExpandTable()
      ) : (
        renderCardTable()
      )}

      <p className="admin-help">
        Скрытая запись пропадает из подбора на витрине, но остаётся у товаров. «Отвязать товары»
        снимает метку со всех букетов (с подтверждением названия) — после этого свободную запись
        можно удалить. Товары и заказы каскадно не трогаем.
      </p>
    </div>
  );
}

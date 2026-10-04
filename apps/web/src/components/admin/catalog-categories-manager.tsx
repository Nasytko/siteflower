'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CATALOG_LISTING_KINDS, type CatalogCategoryAdminDto } from '@bouquet-one/contracts';
import {
  adminDelete,
  adminGet,
  adminPatch,
  adminPost,
  AdminRequestError,
  errorMessage,
} from '@/lib/admin-client';
import { adminEndpoints } from '@/lib/admin-endpoints';
import { categoryPickerOptions } from '@/lib/admin-catalog-picker-labels';
import { FormSaveStatus, phaseFromAdminError, type FormSavePhase } from '@/components/admin/form-status';

type Props = {
  initial: CatalogCategoryAdminDto[];
  canCreate: boolean;
  canUpdate: boolean;
};

type DialogState =
  | null
  | { kind: 'edit'; row: CatalogCategoryAdminDto }
  | { kind: 'add-child'; parent: CatalogCategoryAdminDto }
  | { kind: 'move'; row: CatalogCategoryAdminDto }
  | { kind: 'delete'; row: CatalogCategoryAdminDto; targetCategoryId: string };

function productCountLabel(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${n} товаров`;
  if (mod10 === 1) return `${n} товар`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} товара`;
  return `${n} товаров`;
}

function buildTree(rows: CatalogCategoryAdminDto[]): Array<CatalogCategoryAdminDto & { depth: number }> {
  const byParent = new Map<string | null, CatalogCategoryAdminDto[]>();
  for (const row of rows) {
    const key = row.parentId;
    const list = byParent.get(key) ?? [];
    list.push(row);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ru'));
  }
  const out: Array<CatalogCategoryAdminDto & { depth: number }> = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const row of byParent.get(parentId) ?? []) {
      out.push({ ...row, depth });
      walk(row.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function CatalogCategoriesManager({ initial, canCreate, canUpdate }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [dialog, setDialog] = useState<DialogState>(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editListingKind, setEditListingKind] = useState('');
  const [editSeoTitle, setEditSeoTitle] = useState('');
  const [editSeoDescription, setEditSeoDescription] = useState('');
  const [editParentId, setEditParentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [phase, setPhase] = useState<FormSavePhase>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const parentOptions = useMemo(() => categoryPickerOptions(rows), [rows]);
  const tree = useMemo(() => buildTree(rows), [rows]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return tree.filter((row) => {
        let parentId = row.parentId;
        while (parentId) {
          if (collapsed.has(parentId)) return false;
          parentId = rows.find((r) => r.id === parentId)?.parentId ?? null;
        }
        return true;
      });
    }
    const matchedIds = new Set(
      rows.filter((row) => row.name.toLowerCase().includes(q) || row.slug.toLowerCase().includes(q)).map((r) => r.id),
    );
    // Include ancestors of matches so path context remains.
    for (const id of [...matchedIds]) {
      let cur = rows.find((r) => r.id === id);
      while (cur?.parentId) {
        matchedIds.add(cur.parentId);
        cur = rows.find((r) => r.id === cur!.parentId);
      }
    }
    return tree.filter((row) => matchedIds.has(row.id));
  }, [tree, search, collapsed, rows]);

  async function reload() {
    const payload = await adminGet<CatalogCategoryAdminDto[]>(adminEndpoints.catalogCategories);
    setRows(payload);
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
      setNotice(successMessage ?? null);
      setPhase(successMessage ? 'saved' : 'idle');
      router.refresh();
    } catch (err) {
      setPhase(err instanceof AdminRequestError ? phaseFromAdminError(err) : 'server');
      setRequestId(err instanceof AdminRequestError ? err.requestId ?? null : null);
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function onCreateRoot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;
    const form = event.currentTarget;
    const name = String(new FormData(form).get('name') ?? '').trim();
    if (!name) return;
    await run(async () => {
      await adminPost(adminEndpoints.catalogCategories, {
        name,
        sortOrder: (rows.filter((r) => !r.parentId).at(-1)?.sortOrder ?? 0) + 10,
      });
      form.reset();
    }, `«${name}» добавлена`);
  }

  function openEdit(row: CatalogCategoryAdminDto) {
    setEditName(row.name);
    setEditSlug(row.slug);
    setEditListingKind(row.listingKind ?? '');
    setEditSeoTitle(row.seoTitle ?? '');
    setEditSeoDescription(row.seoDescription ?? '');
    setDialog({ kind: 'edit', row });
  }

  function openMove(row: CatalogCategoryAdminDto) {
    setEditParentId(row.parentId ?? '');
    setDialog({ kind: 'move', row });
  }

  function openDelete(row: CatalogCategoryAdminDto) {
    setDialog({
      kind: 'delete',
      row,
      targetCategoryId: '',
    });
  }

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const moveTargets = useMemo(() => {
    if (!dialog || dialog.kind !== 'move') return parentOptions;
    const blocked = new Set<string>([dialog.row.id]);
    const stack = [dialog.row.id];
    while (stack.length) {
      const id = stack.pop()!;
      for (const child of rows.filter((r) => r.parentId === id)) {
        blocked.add(child.id);
        stack.push(child.id);
      }
    }
    return parentOptions.filter((option) => !blocked.has(option.id));
  }, [dialog, parentOptions, rows]);

  const deleteTargets = useMemo(() => {
    if (!dialog || dialog.kind !== 'delete') return parentOptions;
    return parentOptions.filter((option) => option.id !== dialog.row.id);
  }, [dialog, parentOptions]);

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

      <div className="admin-toolbar flex flex-wrap items-end gap-3">
        <label className="admin-field min-w-[14rem] flex-1">
          <span>Поиск</span>
          <input
            className="admin-input"
            value={search}
            placeholder="Название или slug"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        {canCreate ? (
          <form onSubmit={onCreateRoot} className="flex flex-wrap items-end gap-2">
            <label className="admin-field">
              <span>Новая корневая</span>
              <input name="name" required className="admin-input w-52" placeholder="Например, Подарки" />
            </label>
            <button type="submit" className="admin-btn" disabled={pending}>
              Добавить
            </button>
          </form>
        ) : null}
      </div>

      <div className="admin-panel overflow-x-auto">
        <table className="admin-table min-w-[720px]">
          <thead>
            <tr>
              <th>Категория</th>
              <th className="w-28">Товары</th>
              <th className="w-24">Статус</th>
              <th className="w-56">Действия</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="admin-empty">
                  Категории не найдены.
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => {
                const hasChildren = row.childrenCount > 0;
                const isCollapsed = collapsed.has(row.id);
                return (
                  <tr key={row.id} className={row.visibility === 'HIDDEN' ? 'opacity-70' : undefined}>
                    <td>
                      <div className="flex items-start gap-1" style={{ paddingLeft: `${row.depth * 1.25}rem` }}>
                        {hasChildren ? (
                          <button
                            type="button"
                            className="admin-btn-ghost mt-0.5 px-1 py-0 text-xs"
                            aria-expanded={!isCollapsed}
                            onClick={() => toggleCollapse(row.id)}
                          >
                            {isCollapsed ? '▸' : '▾'}
                          </button>
                        ) : (
                          <span className="inline-block w-4" />
                        )}
                        <div>
                          <div className="font-medium text-[var(--admin-ink)]">{row.name}</div>
                          <div className="text-xs text-[var(--admin-muted)]">/{row.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span title={`Прямых: ${row.productsCount}`}>
                        {productCountLabel(row.descendantProductsCount)}
                      </span>
                      {row.childrenCount > 0 ? (
                        <div className="text-xs text-[var(--admin-muted)]">
                          {row.childrenCount} дочерн.
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <span
                        className={
                          row.visibility === 'VISIBLE'
                            ? 'admin-chip admin-chip--ok'
                            : 'admin-chip'
                        }
                      >
                        {row.visibility === 'VISIBLE' ? 'Активна' : 'Скрыта'}
                      </span>
                    </td>
                    <td>
                      {canUpdate ? (
                        <div className="flex flex-wrap gap-1">
                          <Link
                            href={`/admin/catalog/products?catalogCategoryId=${row.id}`}
                            className="admin-btn-ghost text-xs"
                          >
                            Товары
                          </Link>
                          <button type="button" className="admin-btn-ghost text-xs" onClick={() => openEdit(row)}>
                            Изменить
                          </button>
                          {canCreate ? (
                            <button
                              type="button"
                              className="admin-btn-ghost text-xs"
                              onClick={() => setDialog({ kind: 'add-child', parent: row })}
                            >
                              + Дочерняя
                            </button>
                          ) : null}
                          <button type="button" className="admin-btn-ghost text-xs" onClick={() => openMove(row)}>
                            Переместить
                          </button>
                          <button
                            type="button"
                            className="admin-btn-ghost text-xs"
                            disabled={pending}
                            onClick={() =>
                              void run(async () => {
                                await adminPost(adminEndpoints.catalogCategoryReorder(row.id), {
                                  expectedVersion: row.version,
                                  direction: 'up',
                                });
                              })
                            }
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="admin-btn-ghost text-xs"
                            disabled={pending}
                            onClick={() =>
                              void run(async () => {
                                await adminPost(adminEndpoints.catalogCategoryReorder(row.id), {
                                  expectedVersion: row.version,
                                  direction: 'down',
                                });
                              })
                            }
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="admin-btn-ghost text-xs"
                            disabled={pending}
                            onClick={() =>
                              void run(async () => {
                                await adminPatch(adminEndpoints.catalogCategory(row.id), {
                                  expectedVersion: row.version,
                                  visibility: row.visibility === 'VISIBLE' ? 'HIDDEN' : 'VISIBLE',
                                });
                              }, row.visibility === 'VISIBLE' ? 'Категория скрыта' : 'Категория активна')
                            }
                          >
                            {row.visibility === 'VISIBLE' ? 'Скрыть' : 'Показать'}
                          </button>
                          <button
                            type="button"
                            className="admin-btn-ghost text-xs text-[var(--admin-danger)]"
                            onClick={() => openDelete(row)}
                          >
                            Удалить
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--admin-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {dialog?.kind === 'edit' ? (
        <div role="dialog" aria-modal="true" aria-labelledby="cat-edit-title" className="admin-panel space-y-3 border border-[var(--admin-brand)]/30 p-4">
          <h2 id="cat-edit-title" className="text-base font-semibold">
            Редактировать «{dialog.row.name}»
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="admin-field">
              <span>Название</span>
              <input className="admin-input" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </label>
            <label className="admin-field">
              <span>Slug</span>
              <input className="admin-input" value={editSlug} onChange={(e) => setEditSlug(e.target.value)} />
            </label>
            <label className="admin-field">
              <span>Тип витрины</span>
              <select
                className="admin-select"
                value={editListingKind}
                onChange={(e) => setEditListingKind(e.target.value)}
              >
                <option value="">Не задан</option>
                {CATALOG_LISTING_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field md:col-span-2">
              <span>SEO title</span>
              <input
                className="admin-input"
                value={editSeoTitle}
                onChange={(e) => setEditSeoTitle(e.target.value)}
              />
            </label>
            <label className="admin-field md:col-span-2">
              <span>SEO description</span>
              <textarea
                className="admin-input min-h-20"
                value={editSeoDescription}
                onChange={(e) => setEditSeoDescription(e.target.value)}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="admin-btn"
              disabled={pending || editName.trim().length === 0 || editSlug.trim().length === 0}
              onClick={() =>
                void run(async () => {
                  await adminPatch(adminEndpoints.catalogCategory(dialog.row.id), {
                    expectedVersion: dialog.row.version,
                    name: editName.trim(),
                    slug: editSlug.trim(),
                    listingKind: editListingKind || null,
                    seoTitle: editSeoTitle.trim() || null,
                    seoDescription: editSeoDescription.trim() || null,
                  });
                  setDialog(null);
                }, 'Сохранено')
              }
            >
              Сохранить
            </button>
            <button type="button" className="admin-btn-ghost" onClick={() => setDialog(null)}>
              Отмена
            </button>
          </div>
        </div>
      ) : null}

      {dialog?.kind === 'add-child' ? (
        <div role="dialog" aria-modal="true" aria-labelledby="cat-child-title" className="admin-panel space-y-3 border border-[var(--admin-brand)]/30 p-4">
          <h2 id="cat-child-title" className="text-base font-semibold">
            Дочерняя для «{dialog.parent.name}»
          </h2>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const name = String(new FormData(event.currentTarget).get('name') ?? '').trim();
              if (!name) return;
              void run(async () => {
                await adminPost(adminEndpoints.catalogCategories, {
                  name,
                  parentId: dialog.parent.id,
                  sortOrder: (rows.filter((r) => r.parentId === dialog.parent.id).at(-1)?.sortOrder ?? 0) + 10,
                });
                setDialog(null);
              }, `«${name}» добавлена`);
            }}
          >
            <label className="admin-field">
              <span>Название</span>
              <input name="name" required className="admin-input w-56" />
            </label>
            <button type="submit" className="admin-btn" disabled={pending}>
              Создать
            </button>
            <button type="button" className="admin-btn-ghost" onClick={() => setDialog(null)}>
              Отмена
            </button>
          </form>
        </div>
      ) : null}

      {dialog?.kind === 'move' ? (
        <div role="dialog" aria-modal="true" aria-labelledby="cat-move-title" className="admin-panel space-y-3 border border-[var(--admin-brand)]/30 p-4">
          <h2 id="cat-move-title" className="text-base font-semibold">
            Переместить «{dialog.row.name}»
          </h2>
          <label className="admin-field max-w-md">
            <span>Новый родитель</span>
            <select
              className="admin-select"
              value={editParentId}
              onChange={(event) => setEditParentId(event.target.value)}
            >
              <option value="">Корень каталога</option>
              {moveTargets.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="admin-btn"
              disabled={pending}
              onClick={() =>
                void run(async () => {
                  await adminPatch(adminEndpoints.catalogCategory(dialog.row.id), {
                    expectedVersion: dialog.row.version,
                    parentId: editParentId || null,
                  });
                  setDialog(null);
                }, 'Категория перемещена')
              }
            >
              Переместить
            </button>
            <button type="button" className="admin-btn-ghost" onClick={() => setDialog(null)}>
              Отмена
            </button>
          </div>
        </div>
      ) : null}

      {dialog?.kind === 'delete' ? (
        <div role="dialog" aria-modal="true" aria-labelledby="cat-delete-title" className="admin-panel space-y-3 border border-[var(--admin-danger)]/40 p-4">
          <h2 id="cat-delete-title" className="text-base font-semibold">
            Удалить «{dialog.row.name}»?
          </h2>
          {dialog.row.childrenCount > 0 ? (
            <>
              <p className="text-sm text-[var(--admin-muted)]">
                В категории есть {dialog.row.childrenCount} дочерних категорий. Удаление запрещено.
                Сначала переместите или удалите дочерние категории.
              </p>
              <button type="button" className="admin-btn-ghost" onClick={() => setDialog(null)}>
                Закрыть
              </button>
            </>
          ) : dialog.row.productsCount > 0 ? (
            <>
              <p className="text-sm text-[var(--admin-muted)]">
                В категории {productCountLabel(dialog.row.productsCount)}. Перед удалением перенесите
                товары в другую категорию. Операция необратима.
              </p>
              <label className="admin-field max-w-md">
                <span>Перенести товары в</span>
                <select
                  className="admin-select"
                  value={dialog.targetCategoryId}
                  onChange={(event) =>
                    setDialog({ ...dialog, targetCategoryId: event.target.value })
                  }
                >
                  <option value="">Выберите категорию</option>
                  {deleteTargets.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="admin-btn"
                  disabled={pending || !dialog.targetCategoryId}
                  onClick={() =>
                    void run(async () => {
                      await adminPost(adminEndpoints.catalogCategoryReassignDelete(dialog.row.id), {
                        expectedVersion: dialog.row.version,
                        targetCategoryId: dialog.targetCategoryId,
                      });
                      setDialog(null);
                    }, `Перенесено ${dialog.row.productsCount} товаров, категория удалена`)
                  }
                >
                  Перенести {dialog.row.productsCount} и удалить
                </button>
                <button type="button" className="admin-btn-ghost" onClick={() => setDialog(null)}>
                  Отмена
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-[var(--admin-muted)]">
                Категория пустая. Удаление необратимо.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="admin-btn"
                  disabled={pending}
                  onClick={() =>
                    void run(async () => {
                      await adminDelete(adminEndpoints.catalogCategory(dialog.row.id), {
                        expectedVersion: dialog.row.version,
                      });
                      setDialog(null);
                    }, 'Категория удалена')
                  }
                >
                  Удалить
                </button>
                <button type="button" className="admin-btn-ghost" onClick={() => setDialog(null)}>
                  Отмена
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

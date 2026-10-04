'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CatalogCategoryAdminDto } from '@bouquet-one/contracts';
import { adminGet, adminPatch, adminPost, AdminRequestError, errorMessage } from '@/lib/admin-client';
import { adminEndpoints } from '@/lib/admin-endpoints';
import { categoryPickerOptions } from '@/lib/admin-catalog-picker-labels';
import { FormSaveStatus, phaseFromAdminError, type FormSavePhase } from '@/components/admin/form-status';

type Props = {
  initial: CatalogCategoryAdminDto[];
  canCreate: boolean;
  canUpdate: boolean;
};

export function CatalogCategoriesManager({ initial, canCreate, canUpdate }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(() => [...initial].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ru')));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [phase, setPhase] = useState<FormSavePhase>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const parentOptions = useMemo(() => categoryPickerOptions(rows), [rows]);

  async function reload() {
    const payload = await adminGet<CatalogCategoryAdminDto[]>(adminEndpoints.catalogCategories);
    setRows([...payload].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ru')));
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

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;
    const formEl = event.currentTarget;
    const data = new FormData(formEl);
    const name = String(data.get('name') ?? '').trim();
    if (name.length === 0) return;
    const parentId = String(data.get('parentId') ?? '').trim();
    await run(async () => {
      await adminPost(adminEndpoints.catalogCategories, {
        name,
        parentId: parentId.length > 0 ? parentId : null,
        sortOrder: (rows.at(-1)?.sortOrder ?? 0) + 10,
      });
      formEl.reset();
    }, `«${name}» добавлена`);
  }

  function startEdit(row: CatalogCategoryAdminDto) {
    setEditingId(row.id);
    setEditName(row.name);
    setNotice(null);
  }

  async function saveEdit(row: CatalogCategoryAdminDto) {
    if (!canUpdate) return;
    const name = editName.trim();
    if (name.length === 0) return;
    await run(async () => {
      await adminPatch(adminEndpoints.catalogCategory(row.id), {
        expectedVersion: row.version,
        name,
      });
      setEditingId(null);
      setEditName('');
    }, 'Название сохранено');
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

      {canCreate ? (
        <form onSubmit={onCreate} className="admin-toolbar">
          <label className="admin-field">
            <span>Новая категория</span>
            <input name="name" required className="admin-input w-56" placeholder="Название" />
          </label>
          <label className="admin-field">
            <span>Родитель</span>
            <select name="parentId" className="admin-select w-64" defaultValue="">
              <option value="">Корень каталога</option>
              {parentOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="admin-btn" disabled={pending}>
            Добавить
          </button>
        </form>
      ) : null}

      <div className="admin-panel overflow-x-auto">
        <table className="admin-table min-w-[640px]">
          <thead>
            <tr>
              <th>Категория</th>
              <th className="w-24">Товаров</th>
              <th className="w-40">Действия</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3}>
                  <p className="admin-empty">Категорий пока нет</p>
                </td>
              </tr>
            ) : (
              parentOptions.map((option) => {
                const row = rows.find((item) => item.id === option.id)!;
                const editing = editingId === row.id;
                return (
                  <tr key={row.id}>
                    <td>
                      {editing ? (
                        <input
                          className="admin-input"
                          value={editName}
                          disabled={!canUpdate || pending}
                          onChange={(event) => setEditName(event.target.value)}
                        />
                      ) : (
                        <span>{option.name}</span>
                      )}
                      <p className="text-xs text-[var(--admin-muted)]">/{row.slug}</p>
                    </td>
                    <td className="tabular-nums">{row.productsCount}</td>
                    <td>
                      {canUpdate ? (
                        editing ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="admin-btn"
                              disabled={pending}
                              onClick={() => void saveEdit(row)}
                            >
                              Сохранить
                            </button>
                            <button
                              type="button"
                              className="admin-btn-ghost"
                              disabled={pending}
                              onClick={() => {
                                setEditingId(null);
                                setEditName('');
                              }}
                            >
                              Отмена
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="admin-link text-sm"
                            disabled={pending}
                            onClick={() => startEdit(row)}
                          >
                            Переименовать
                          </button>
                        )
                      ) : (
                        <span className="text-[var(--admin-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

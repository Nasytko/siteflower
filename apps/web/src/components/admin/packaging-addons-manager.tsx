'use client';

import { useMemo, useState } from 'react';
import {
  PACKAGING_ADDON_KIND_LABELS,
  PACKAGING_ADDON_KINDS,
  type PackagingAddonDto,
  type PackagingAddonKind,
} from '@bouquet-one/contracts';
import {
  adminDelete,
  adminPatch,
  adminPost,
  errorMessage,
} from '@/lib/admin-client';
import { adminEndpoints } from '@/lib/admin-endpoints';
import { majorInputToMinor, minorToMajorInput } from '@/lib/admin-money';

type Props = {
  initialItems: PackagingAddonDto[];
  canCreate: boolean;
  canUpdate: boolean;
};

type Draft = {
  name: string;
  kind: PackagingAddonKind;
  surchargeMajor: string;
  erpSku: string;
  active: boolean;
};

function emptyDraft(): Draft {
  return {
    name: '',
    kind: 'RIBBON',
    surchargeMajor: '0',
    erpSku: '',
    active: true,
  };
}

function formatMoney(minor: string): string {
  const value = Number(minor);
  if (!Number.isFinite(value)) return minor;
  return `${(value / 100).toFixed(2).replace('.', ',')} BYN`;
}

export function PackagingAddonsManager({ initialItems, canCreate, canUpdate }: Props) {
  const [items, setItems] = useState(initialItems);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editing = useMemo(
    () => items.find((item) => item.id === editingId) ?? null,
    [items, editingId],
  );

  function startEdit(item: PackagingAddonDto) {
    setEditingId(item.id);
    setDraft({
      name: item.name,
      kind: item.kind,
      surchargeMajor: minorToMajorInput(item.surchargeMinor),
      erpSku: item.erpSku ?? '',
      active: item.active,
    });
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(emptyDraft());
    setError(null);
  }

  async function save() {
    const name = draft.name.trim();
    if (!name) {
      setError('Укажите название');
      return;
    }
    const surchargeMinor = majorInputToMinor(draft.surchargeMajor);
    if (surchargeMinor == null) {
      setError('Проверьте доплату');
      return;
    }
    const erpSku = draft.erpSku.trim().toUpperCase().replace(/\s+/g, '');
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        const updated = await adminPatch<PackagingAddonDto>(
          adminEndpoints.packagingAddon(editing.id),
          {
            expectedVersion: editing.version,
            name,
            kind: draft.kind,
            surchargeMinor,
            erpSku: erpSku || null,
            active: draft.active,
          },
        );
        setItems((prev) =>
          prev
            .map((item) => (item.id === updated.id ? updated : item))
            .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ru')),
        );
        cancelEdit();
      } else {
        const created = await adminPost<PackagingAddonDto>(adminEndpoints.packagingAddons, {
          name,
          kind: draft.kind,
          surchargeMinor,
          erpSku: erpSku || null,
          active: draft.active,
        });
        setItems((prev) =>
          [...prev, created].sort(
            (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ru'),
          ),
        );
        setDraft(emptyDraft());
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: PackagingAddonDto) {
    if (!canUpdate) return;
    if (!window.confirm(`Удалить «${item.name}» из справочника?`)) return;
    setBusy(true);
    setError(null);
    try {
      await adminDelete(adminEndpoints.packagingAddon(item.id), {
        expectedVersion: item.version,
      });
      setItems((prev) => prev.filter((row) => row.id !== item.id));
      if (editingId === item.id) cancelEdit();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {(canCreate || (canUpdate && editing)) && (
        <section className="sf-pe-card space-y-3">
          <div className="sf-pe-card__head">
            <h2>{editing ? 'Изменить позицию' : 'Новая позиция'}</h2>
          </div>
          <div className="sf-pe-card__body grid gap-3 sm:grid-cols-2">
            <label className="sf-pe-field">
              <span>Название</span>
              <input
                className="sf-pe-input"
                value={draft.name}
                disabled={busy}
                placeholder="Атласная лента"
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
              />
            </label>
            <label className="sf-pe-field">
              <span>Тип</span>
              <select
                className="admin-select"
                value={draft.kind}
                disabled={busy}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    kind: event.target.value as PackagingAddonKind,
                  }))
                }
              >
                {PACKAGING_ADDON_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {PACKAGING_ADDON_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
            </label>
            <label className="sf-pe-field">
              <span>Доплата, BYN</span>
              <input
                className="sf-pe-input sf-pe-input--num"
                value={draft.surchargeMajor}
                disabled={busy}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, surchargeMajor: event.target.value }))
                }
              />
            </label>
            <label className="sf-pe-field">
              <span>Артикул в ERP</span>
              <input
                className="sf-pe-input"
                value={draft.erpSku}
                disabled={busy}
                placeholder="Необязательно"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setDraft((prev) => ({ ...prev, erpSku: event.target.value }))}
              />
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={draft.active}
                disabled={busy}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, active: event.target.checked }))
                }
              />
              Показывать в выборе на товаре
            </label>
          </div>
          {error ? <p className="admin-error-text px-4 pb-2">{error}</p> : null}
          <div className="admin-row-actions px-4 pb-4">
            <button type="button" className="sf-pe-btn" disabled={busy} onClick={() => void save()}>
              {editing ? 'Сохранить' : 'Добавить'}
            </button>
            {editing ? (
              <button
                type="button"
                className="sf-pe-btn sf-pe-btn--quiet"
                disabled={busy}
                onClick={cancelEdit}
              >
                Отмена
              </button>
            ) : null}
          </div>
        </section>
      )}

      <section className="sf-pe-card">
        <div className="sf-pe-card__head">
          <h2>Позиции справочника</h2>
          <p className="sf-pe-card__lead">
            Цена и артикул задаются здесь один раз — в карточке товара только выбираете из списка.
          </p>
        </div>
        <div className="sf-pe-card__body">
          {items.length === 0 ? (
            <p className="text-sm text-[var(--admin-muted)]">Пока пусто. Добавьте ленту или упаковку.</p>
          ) : (
            <ul className="divide-y divide-[var(--admin-border)]">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="font-medium">
                      {item.name}
                      {!item.active ? (
                        <span className="ml-2 text-xs font-normal text-[var(--admin-muted)]">
                          скрыта
                        </span>
                      ) : null}
                    </p>
                    <p className="text-sm text-[var(--admin-muted)]">
                      {PACKAGING_ADDON_KIND_LABELS[item.kind]} · {formatMoney(item.surchargeMinor)}
                      {item.erpSku ? ` · ${item.erpSku}` : ''}
                    </p>
                  </div>
                  {canUpdate ? (
                    <div className="admin-row-actions">
                      <button
                        type="button"
                        className="sf-pe-btn sf-pe-btn--quiet"
                        disabled={busy}
                        onClick={() => startEdit(item)}
                      >
                        Изменить
                      </button>
                      <button
                        type="button"
                        className="sf-pe-btn sf-pe-btn--quiet"
                        disabled={busy}
                        onClick={() => void remove(item)}
                      >
                        Удалить
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import {
  PACKAGING_ADDON_KIND_LABELS,
  PACKAGING_ADDON_KINDS,
  type PackagingAddonDto,
  type PackagingAddonKind,
  type PackagingAddonPricingMode,
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

type TierDraft = {
  key: string;
  maxBaseMajor: string;
  /** Empty max = open-ended top tier. */
  openEnded: boolean;
  surchargeMajor: string;
};

type Draft = {
  name: string;
  kind: PackagingAddonKind;
  pricingMode: PackagingAddonPricingMode;
  surchargeMajor: string;
  tiers: TierDraft[];
  erpSku: string;
  active: boolean;
};

let tierKeySeq = 0;
function nextTierKey() {
  tierKeySeq += 1;
  return `tier-${tierKeySeq}`;
}

function emptyTier(openEnded = false): TierDraft {
  return {
    key: nextTierKey(),
    maxBaseMajor: openEnded ? '' : '60',
    openEnded,
    surchargeMajor: openEnded ? '15' : '8',
  };
}

function emptyDraft(): Draft {
  return {
    name: '',
    kind: 'RIBBON',
    pricingMode: 'FIXED',
    surchargeMajor: '0',
    tiers: [emptyTier(false), emptyTier(true)],
    erpSku: '',
    active: true,
  };
}

function formatMoney(minor: string): string {
  const value = Number(minor);
  if (!Number.isFinite(value)) return minor;
  return `${(value / 100).toFixed(2).replace('.', ',')} BYN`;
}

function pricingLabel(item: PackagingAddonDto): string {
  if (item.pricingMode !== 'TIERED' || item.tiers.length === 0) {
    return formatMoney(item.surchargeMinor);
  }
  return item.tiers
    .map((tier) => {
      const fee = formatMoney(tier.surchargeMinor);
      if (tier.maxBaseMinor == null) return `свыше → ${fee}`;
      return `до ${formatMoney(tier.maxBaseMinor)} → ${fee}`;
    })
    .join('; ');
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

  const showTierEditor =
    draft.kind !== 'RIBBON' && draft.pricingMode === 'TIERED';

  function startEdit(item: PackagingAddonDto) {
    setEditingId(item.id);
    setDraft({
      name: item.name,
      kind: item.kind,
      pricingMode: item.kind === 'RIBBON' ? 'FIXED' : item.pricingMode,
      surchargeMajor: minorToMajorInput(item.surchargeMinor),
      tiers:
        item.tiers.length > 0
          ? item.tiers.map((tier) => ({
              key: nextTierKey(),
              maxBaseMajor: tier.maxBaseMinor ? minorToMajorInput(tier.maxBaseMinor) : '',
              openEnded: tier.maxBaseMinor == null,
              surchargeMajor: minorToMajorInput(tier.surchargeMinor),
            }))
          : [emptyTier(false), emptyTier(true)],
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

  function buildPayload() {
    const name = draft.name.trim();
    if (!name) {
      setError('Укажите название');
      return null;
    }
    const erpSku = draft.erpSku.trim().toUpperCase().replace(/\s+/g, '');
    const pricingMode: PackagingAddonPricingMode =
      draft.kind === 'RIBBON' ? 'FIXED' : draft.pricingMode;

    if (pricingMode === 'TIERED') {
      const tiers = [];
      for (const tier of draft.tiers) {
        const surchargeMinor = majorInputToMinor(tier.surchargeMajor);
        if (surchargeMinor == null) {
          setError('Проверьте доплату в шкале');
          return null;
        }
        if (tier.openEnded) {
          tiers.push({ maxBaseMinor: null, surchargeMinor });
          continue;
        }
        const maxBaseMinor = majorInputToMinor(tier.maxBaseMajor);
        if (maxBaseMinor == null) {
          setError('Проверьте порог «до … BYN» в шкале');
          return null;
        }
        tiers.push({ maxBaseMinor, surchargeMinor });
      }
      if (tiers.length === 0) {
        setError('Добавьте хотя бы одну ступень');
        return null;
      }
      return {
        name,
        kind: draft.kind,
        pricingMode,
        surchargeMinor: tiers[0]!.surchargeMinor,
        tiers,
        erpSku: erpSku || null,
        active: draft.active,
      };
    }

    const surchargeMinor = majorInputToMinor(draft.surchargeMajor);
    if (surchargeMinor == null) {
      setError('Проверьте доплату');
      return null;
    }
    return {
      name,
      kind: draft.kind,
      pricingMode: 'FIXED' as const,
      surchargeMinor,
      tiers: [] as Array<{ maxBaseMinor: string | null; surchargeMinor: string }>,
      erpSku: erpSku || null,
      active: draft.active,
    };
  }

  async function save() {
    const payload = buildPayload();
    if (!payload) return;
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        const updated = await adminPatch<PackagingAddonDto>(
          adminEndpoints.packagingAddon(editing.id),
          {
            expectedVersion: editing.version,
            ...payload,
          },
        );
        setItems((prev) =>
          prev
            .map((item) => (item.id === updated.id ? updated : item))
            .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ru')),
        );
        cancelEdit();
      } else {
        const created = await adminPost<PackagingAddonDto>(adminEndpoints.packagingAddons, payload);
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
                onChange={(event) => {
                  const kind = event.target.value as PackagingAddonKind;
                  setDraft((prev) => ({
                    ...prev,
                    kind,
                    pricingMode: kind === 'RIBBON' ? 'FIXED' : prev.pricingMode,
                  }));
                }}
              >
                {PACKAGING_ADDON_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {PACKAGING_ADDON_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
            </label>

            {draft.kind !== 'RIBBON' ? (
              <label className="sf-pe-field sm:col-span-2">
                <span>Как считать цену</span>
                <select
                  className="admin-select"
                  value={draft.pricingMode}
                  disabled={busy}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      pricingMode: event.target.value as PackagingAddonPricingMode,
                    }))
                  }
                >
                  <option value="FIXED">Фиксированная доплата</option>
                  <option value="TIERED">По шкале от цены цветов</option>
                </select>
                <span className="admin-help">
                  Шкала считается от цены цветов/веток без ленты и упаковки.
                </span>
              </label>
            ) : null}

            {!showTierEditor ? (
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
            ) : (
              <div className="sm:col-span-2 space-y-3 rounded-md border border-[var(--admin-border)] p-3">
                <p className="text-sm font-medium">Шкала доплаты</p>
                <ul className="space-y-2">
                  {draft.tiers.map((tier, index) => (
                    <li key={tier.key} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <label className="sf-pe-field">
                        <span>{tier.openEnded ? 'Порог' : 'До суммы цветов, BYN'}</span>
                        {tier.openEnded ? (
                          <input className="sf-pe-input" value="свыше предыдущей" disabled />
                        ) : (
                          <input
                            className="sf-pe-input sf-pe-input--num"
                            value={tier.maxBaseMajor}
                            disabled={busy}
                            onChange={(event) =>
                              setDraft((prev) => ({
                                ...prev,
                                tiers: prev.tiers.map((row, i) =>
                                  i === index
                                    ? { ...row, maxBaseMajor: event.target.value }
                                    : row,
                                ),
                              }))
                            }
                          />
                        )}
                      </label>
                      <label className="sf-pe-field">
                        <span>Доплата, BYN</span>
                        <input
                          className="sf-pe-input sf-pe-input--num"
                          value={tier.surchargeMajor}
                          disabled={busy}
                          onChange={(event) =>
                            setDraft((prev) => ({
                              ...prev,
                              tiers: prev.tiers.map((row, i) =>
                                i === index
                                  ? { ...row, surchargeMajor: event.target.value }
                                  : row,
                              ),
                            }))
                          }
                        />
                      </label>
                      <div className="flex items-end">
                        <button
                          type="button"
                          className="sf-pe-btn sf-pe-btn--quiet"
                          disabled={busy || draft.tiers.length <= 1}
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              tiers: prev.tiers.filter((_, i) => i !== index),
                            }))
                          }
                        >
                          Удалить
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="admin-row-actions">
                  <button
                    type="button"
                    className="sf-pe-btn sf-pe-btn--quiet"
                    disabled={busy}
                    onClick={() =>
                      setDraft((prev) => {
                        const withoutOpen = prev.tiers.filter((t) => !t.openEnded);
                        const open = prev.tiers.find((t) => t.openEnded) ?? emptyTier(true);
                        return {
                          ...prev,
                          tiers: [...withoutOpen, emptyTier(false), open],
                        };
                      })
                    }
                  >
                    Ещё ступень
                  </button>
                </div>
              </div>
            )}

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
                      {PACKAGING_ADDON_KIND_LABELS[item.kind]}
                      {item.pricingMode === 'TIERED' ? ' · шкала' : ''} · {pricingLabel(item)}
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

'use client';

import Link from 'next/link';
import {
  PACKAGING_ADDON_KIND_LABELS,
  PRODUCT_OPTION_SELECTIONS,
  type PackagingAddonDto,
  type ProductOptionChargeMode,
  type ProductOptionSelection,
} from '@bouquet-one/contracts';
import { majorInputToMinor, minorToMajorInput } from '@/lib/admin-money';
import { nextEditorKey, type VariantDraft } from '@/components/admin/product-editor-shared';

export type OptionValueDraft = {
  key: string;
  /** Selected packaging directory id; empty = legacy free-text row. */
  addonId: string;
  name: string;
  /** ERP stock article for packaging/ribbon; empty when unset or owned by addon. */
  erpSku: string;
  surchargeMajor: string;
  /** Always PER_LINE in UI — once per bouquet / cart line. */
  chargeMode: ProductOptionChargeMode;
  active: boolean;
  /** variant draft key → surcharge major override (empty = use default) */
  variantSurchargeMajor: Record<string, string>;
};

export type OptionGroupDraft = {
  key: string;
  name: string;
  selection: ProductOptionSelection;
  required: boolean;
  values: OptionValueDraft[];
};

type Props = {
  canUpdate: boolean;
  optionGroups: OptionGroupDraft[];
  setOptionGroups: React.Dispatch<React.SetStateAction<OptionGroupDraft[]>>;
  variants: VariantDraft[];
  packagingAddons: PackagingAddonDto[];
  touch: () => void;
};

export function emptyOptionValueDraft(): OptionValueDraft {
  return {
    key: nextEditorKey('opt-val'),
    addonId: '',
    name: '',
    erpSku: '',
    surchargeMajor: '0',
    chargeMode: 'PER_LINE',
    active: true,
    variantSurchargeMajor: {},
  };
}

export function emptyOptionGroupDraft(): OptionGroupDraft {
  return {
    key: nextEditorKey('opt-grp'),
    name: '',
    selection: 'SINGLE',
    required: false,
    values: [emptyOptionValueDraft()],
  };
}

export function toOptionGroupDrafts(
  groups: Array<{
    name: string;
    selection: ProductOptionSelection;
    required: boolean;
    values: Array<{
      addonId?: string | null;
      name: string;
      erpSku?: string | null;
      surchargeMinor: string;
      chargeMode: ProductOptionChargeMode;
      active: boolean;
      variantSurcharges: Record<string, string>;
    }>;
  }>,
  variants: VariantDraft[],
): OptionGroupDraft[] {
  const variantById = new Map(
    variants.filter((v) => v.id).map((v) => [v.id as string, v.key]),
  );
  return groups.map((group) => ({
    key: nextEditorKey('opt-grp'),
    name: group.name,
    selection: group.selection,
    required: group.required,
    values: group.values.map((value) => {
      const variantSurchargeMajor: Record<string, string> = {};
      for (const [variantId, minor] of Object.entries(value.variantSurcharges ?? {})) {
        const draftKey = variantById.get(variantId);
        if (draftKey) variantSurchargeMajor[draftKey] = minorToMajorInput(minor);
      }
      return {
        key: nextEditorKey('opt-val'),
        addonId: value.addonId ?? '',
        name: value.name,
        erpSku: value.erpSku ?? '',
        surchargeMajor: minorToMajorInput(value.surchargeMinor),
        chargeMode: 'PER_LINE',
        active: value.active,
        variantSurchargeMajor,
      };
    }),
  }));
}

export function optionGroupsToPayload(
  groups: OptionGroupDraft[],
  variants: VariantDraft[],
): Array<{
  name: string;
  selection: ProductOptionSelection;
  required: boolean;
  sortOrder: number;
  values: Array<{
    name: string;
    addonId: string | null;
    erpSku: string | null;
    surchargeMinor: string;
    chargeMode: ProductOptionChargeMode;
    sortOrder: number;
    active: boolean;
    variantSurcharges: Record<string, string>;
  }>;
}> {
  return groups
    .filter((group) => group.name.trim().length > 0)
    .map((group, groupIndex) => ({
      name: group.name.trim(),
      selection: group.selection,
      required: group.required,
      sortOrder: groupIndex,
      values: group.values
        .filter((value) => value.addonId || value.name.trim().length > 0)
        .map((value, valueIndex) => {
          const variantSurcharges: Record<string, string> = {};
          for (const variant of variants) {
            if (!variant.id) continue;
            const raw = value.variantSurchargeMajor[variant.key]?.trim() ?? '';
            if (!raw) continue;
            const minor = majorInputToMinor(raw);
            if (minor == null) continue;
            variantSurcharges[variant.id] = minor;
          }
          const addonId = value.addonId.trim() || null;
          const erpSku = value.erpSku.trim().toUpperCase().replace(/\s+/g, '');
          return {
            name: value.name.trim() || 'Вариант',
            addonId,
            erpSku: addonId ? null : erpSku.length > 0 ? erpSku : null,
            surchargeMinor: majorInputToMinor(value.surchargeMajor) ?? '0',
            chargeMode: 'PER_LINE' as const,
            sortOrder: valueIndex,
            active: value.active,
            variantSurcharges,
          };
        }),
    }))
    .filter((group) => group.values.length > 0);
}

function formatAddonLabel(addon: PackagingAddonDto): string {
  const price = Number(addon.surchargeMinor);
  const money = Number.isFinite(price)
    ? `${(price / 100).toFixed(2).replace('.', ',')} BYN`
    : '';
  const kind = PACKAGING_ADDON_KIND_LABELS[addon.kind];
  return money ? `${addon.name} — ${money} (${kind})` : `${addon.name} (${kind})`;
}

export function ProductEditorOptionsTab(props: Props) {
  const { canUpdate, optionGroups, setOptionGroups, variants, packagingAddons, touch } = props;
  const activeAddons = packagingAddons.filter((item) => item.active);
  const addonById = new Map(packagingAddons.map((item) => [item.id, item]));

  function updateGroup(index: number, patch: Partial<OptionGroupDraft>) {
    setOptionGroups((prev) =>
      prev.map((group, i) => (i === index ? { ...group, ...patch } : group)),
    );
    touch();
  }

  function updateValue(
    groupIndex: number,
    valueIndex: number,
    patch: Partial<OptionValueDraft>,
  ) {
    setOptionGroups((prev) =>
      prev.map((group, gi) => {
        if (gi !== groupIndex) return group;
        return {
          ...group,
          values: group.values.map((value, vi) =>
            vi === valueIndex ? { ...value, ...patch } : value,
          ),
        };
      }),
    );
    touch();
  }

  function selectAddon(groupIndex: number, valueIndex: number, addonId: string) {
    const addon = addonById.get(addonId);
    setOptionGroups((prev) =>
      prev.map((group, gi) => {
        if (gi !== groupIndex) return group;
        const nextName =
          !group.name.trim() && addon
            ? PACKAGING_ADDON_KIND_LABELS[addon.kind]
            : group.name;
        return {
          ...group,
          name: nextName,
          values: group.values.map((value, vi) => {
            if (vi !== valueIndex) return value;
            if (!addon) {
              return { ...value, addonId: '', name: '', erpSku: '', surchargeMajor: '0' };
            }
            return {
              ...value,
              addonId: addon.id,
              name: addon.name,
              erpSku: addon.erpSku ?? '',
              surchargeMajor: minorToMajorInput(addon.surchargeMinor),
            };
          }),
        };
      }),
    );
    touch();
  }

  return (
    <section className="sf-pe-card space-y-6" data-section="options">
      <div className="sf-pe-card__head">
        <div>
          <h2>Лента и упаковка</h2>
          <p className="sf-pe-card__lead">
            Выберите позиции из справочника. Доплата один раз к букету — если клиент берёт 7 роз,
            лента считается один раз, не семь.
          </p>
        </div>
      </div>

      <div className="sf-pe-card__body space-y-6">
        {activeAddons.length === 0 ? (
          <p className="admin-notice">
            Справочник пока пуст.{' '}
            <Link href="/admin/catalog/packaging" className="underline">
              Добавьте ленту или упаковку
            </Link>
            , затем вернитесь сюда.
          </p>
        ) : (
          <p className="text-sm text-[var(--admin-muted)]">
            Справочник:{' '}
            <Link href="/admin/catalog/packaging" className="underline">
              Лента и упаковка
            </Link>
          </p>
        )}

        {optionGroups.length === 0 ? (
          <p className="text-sm text-[var(--admin-muted)]">
            Пока пусто. Добавьте группу, например «Лента» или «Упаковка».
          </p>
        ) : null}

        {optionGroups.map((group, groupIndex) => (
          <div
            key={group.key}
            className="space-y-3 rounded-lg border border-[var(--admin-border)] px-3 py-3"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="sf-pe-field">
                <span>Название группы</span>
                <input
                  className="sf-pe-input"
                  value={group.name}
                  disabled={!canUpdate}
                  placeholder="Лента"
                  onChange={(event) => updateGroup(groupIndex, { name: event.target.value })}
                />
              </label>
              <label className="sf-pe-field">
                <span>Выбор на сайте</span>
                <select
                  className="admin-select"
                  value={group.selection}
                  disabled={!canUpdate}
                  onChange={(event) =>
                    updateGroup(groupIndex, {
                      selection: event.target.value as ProductOptionSelection,
                    })
                  }
                >
                  {PRODUCT_OPTION_SELECTIONS.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode === 'SINGLE' ? 'Один вариант' : 'Можно несколько'}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={group.required}
                disabled={!canUpdate}
                onChange={(event) => updateGroup(groupIndex, { required: event.target.checked })}
              />
              Обязательно выбрать
            </label>

            <ul className="space-y-3">
              {group.values.map((value, valueIndex) => {
                const linked = Boolean(value.addonId);
                const orphanAddon =
                  linked && !addonById.has(value.addonId)
                    ? { id: value.addonId, name: value.name }
                    : null;
                return (
                  <li
                    key={value.key}
                    className="space-y-2 rounded-md border border-[var(--admin-border)] px-3 py-2"
                  >
                    <label className="sf-pe-field">
                      <span>Позиция из справочника</span>
                      <select
                        className="admin-select"
                        value={value.addonId}
                        disabled={!canUpdate || activeAddons.length === 0}
                        onChange={(event) =>
                          selectAddon(groupIndex, valueIndex, event.target.value)
                        }
                      >
                        <option value="">Выберите…</option>
                        {orphanAddon ? (
                          <option value={orphanAddon.id}>
                            {orphanAddon.name} (нет в справочнике)
                          </option>
                        ) : null}
                        {activeAddons.map((addon) => (
                          <option key={addon.id} value={addon.id}>
                            {formatAddonLabel(addon)}
                          </option>
                        ))}
                        {linked &&
                        addonById.get(value.addonId) &&
                        !addonById.get(value.addonId)!.active ? (
                          <option value={value.addonId}>
                            {formatAddonLabel(addonById.get(value.addonId)!)} (скрыта)
                          </option>
                        ) : null}
                      </select>
                    </label>

                    {linked ? (
                      <p className="text-sm text-[var(--admin-muted)]">
                        Доплата {value.surchargeMajor || '0'} BYN
                        {value.erpSku ? ` · ERP ${value.erpSku}` : ' · без артикула ERP'}
                      </p>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="sf-pe-field">
                          <span>Вариант (старый)</span>
                          <input
                            className="sf-pe-input"
                            value={value.name}
                            disabled={!canUpdate}
                            placeholder="Атласная"
                            onChange={(event) =>
                              updateValue(groupIndex, valueIndex, { name: event.target.value })
                            }
                          />
                        </label>
                        <label className="sf-pe-field">
                          <span>Доплата, BYN</span>
                          <input
                            className="sf-pe-input sf-pe-input--num"
                            value={value.surchargeMajor}
                            disabled={!canUpdate}
                            onChange={(event) =>
                              updateValue(groupIndex, valueIndex, {
                                surchargeMajor: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                    )}

                    {variants.length > 1 ? (
                      <details className="text-sm">
                        <summary className="cursor-pointer text-[var(--admin-muted)]">
                          Разная доплата по размерам
                        </summary>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          {variants.map((variant) => (
                            <label key={variant.key} className="sf-pe-field">
                              <span className="text-xs">{variant.name || 'Размер'}</span>
                              <input
                                className="sf-pe-input sf-pe-input--num"
                                value={value.variantSurchargeMajor[variant.key] ?? ''}
                                disabled={!canUpdate}
                                placeholder="как общая"
                                onChange={(event) =>
                                  updateValue(groupIndex, valueIndex, {
                                    variantSurchargeMajor: {
                                      ...value.variantSurchargeMajor,
                                      [variant.key]: event.target.value,
                                    },
                                  })
                                }
                              />
                            </label>
                          ))}
                        </div>
                      </details>
                    ) : null}

                    {canUpdate ? (
                      <div className="admin-row-actions">
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={value.active}
                            onChange={(event) =>
                              updateValue(groupIndex, valueIndex, {
                                active: event.target.checked,
                              })
                            }
                          />
                          Показывать
                        </label>
                        <button
                          type="button"
                          className="sf-pe-btn sf-pe-btn--quiet"
                          onClick={() => {
                            setOptionGroups((prev) =>
                              prev.map((g, gi) =>
                                gi === groupIndex
                                  ? {
                                      ...g,
                                      values: g.values.filter((_, vi) => vi !== valueIndex),
                                    }
                                  : g,
                              ),
                            );
                            touch();
                          }}
                        >
                          Удалить
                        </button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            {canUpdate ? (
              <div className="admin-row-actions">
                <button
                  type="button"
                  className="sf-pe-btn sf-pe-btn--quiet"
                  onClick={() => {
                    setOptionGroups((prev) =>
                      prev.map((g, gi) =>
                        gi === groupIndex
                          ? { ...g, values: [...g.values, emptyOptionValueDraft()] }
                          : g,
                      ),
                    );
                    touch();
                  }}
                >
                  Ещё вариант
                </button>
                <button
                  type="button"
                  className="sf-pe-btn sf-pe-btn--quiet"
                  onClick={() => {
                    setOptionGroups((prev) => prev.filter((_, i) => i !== groupIndex));
                    touch();
                  }}
                >
                  Удалить группу
                </button>
              </div>
            ) : null}
          </div>
        ))}

        {canUpdate ? (
          <button
            type="button"
            className="sf-pe-btn"
            onClick={() => {
              setOptionGroups((prev) => [...prev, emptyOptionGroupDraft()]);
              touch();
            }}
          >
            Добавить ленту или упаковку
          </button>
        ) : null}
      </div>
    </section>
  );
}

'use client';

import {
  PRODUCT_OPTION_CHARGE_MODES,
  PRODUCT_OPTION_SELECTIONS,
  type ProductOptionChargeMode,
  type ProductOptionSelection,
} from '@bouquet-one/contracts';
import { majorInputToMinor, minorToMajorInput } from '@/lib/admin-money';
import { nextEditorKey, type VariantDraft } from '@/components/admin/product-editor-shared';

export type OptionValueDraft = {
  key: string;
  name: string;
  /** ERP stock article for packaging/ribbon; empty when unset. */
  erpSku: string;
  surchargeMajor: string;
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
  touch: () => void;
};

const CHARGE_LABELS: Record<ProductOptionChargeMode, string> = {
  PER_LINE: 'Один раз за позицию',
  PER_UNIT: 'За каждую единицу',
};

export function emptyOptionValueDraft(): OptionValueDraft {
  return {
    key: nextEditorKey('opt-val'),
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
        name: value.name,
        erpSku: value.erpSku ?? '',
        surchargeMajor: minorToMajorInput(value.surchargeMinor),
        chargeMode: value.chargeMode,
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
        .filter((value) => value.name.trim().length > 0)
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
          const erpSku = value.erpSku.trim().toUpperCase().replace(/\s+/g, '');
          return {
            name: value.name.trim(),
            erpSku: erpSku.length > 0 ? erpSku : null,
            surchargeMinor: majorInputToMinor(value.surchargeMajor) ?? '0',
            chargeMode: value.chargeMode,
            sortOrder: valueIndex,
            active: value.active,
            variantSurcharges,
          };
        }),
    }))
    .filter((group) => group.values.length > 0);
}

export function ProductEditorOptionsTab(props: Props) {
  const { canUpdate, optionGroups, setOptionGroups, variants, touch } = props;

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

  return (
    <section className="sf-pe-card space-y-6" data-section="options">
      <div className="sf-pe-card__head">
        <div>
          <h2>Доплаты</h2>
          <p className="sf-pe-card__lead">
            Упаковка, лента, ваза — доплата к выбранному варианту, не размер.
          </p>
        </div>
      </div>

      <div className="sf-pe-card__body space-y-6">
        {optionGroups.length === 0 ? (
          <p className="text-sm text-[var(--admin-muted)]">Опций пока нет.</p>
        ) : null}

        {optionGroups.map((group, groupIndex) => (
          <div
            key={group.key}
            className="space-y-3 rounded-lg border border-[var(--admin-border)] px-3 py-3"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="admin-field">
                <span>Группа</span>
                <input
                  className="admin-input"
                  value={group.name}
                  disabled={!canUpdate}
                  placeholder="Например: Упаковка"
                  onChange={(event) => updateGroup(groupIndex, { name: event.target.value })}
                />
              </label>
              <label className="admin-field">
                <span>Выбор</span>
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
                      {mode === 'SINGLE' ? 'Одно значение' : 'Несколько значений'}
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
              Обязательная группа
            </label>

            <ul className="space-y-3">
              {group.values.map((value, valueIndex) => (
                <li
                  key={value.key}
                  className="space-y-2 rounded-md border border-[var(--admin-border)] px-3 py-2"
                >
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="admin-field sm:col-span-1">
                      <span>Значение</span>
                      <input
                        className="admin-input"
                        value={value.name}
                        disabled={!canUpdate}
                        placeholder="Крафт"
                        onChange={(event) =>
                          updateValue(groupIndex, valueIndex, { name: event.target.value })
                        }
                      />
                    </label>
                    <label className="admin-field">
                      <span>Доплата</span>
                      <input
                        className="admin-input tabular-nums"
                        value={value.surchargeMajor}
                        disabled={!canUpdate}
                        onChange={(event) =>
                          updateValue(groupIndex, valueIndex, {
                            surchargeMajor: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="admin-field">
                      <span>Как считать</span>
                      <select
                        className="admin-select"
                        value={value.chargeMode}
                        disabled={!canUpdate}
                        onChange={(event) =>
                          updateValue(groupIndex, valueIndex, {
                            chargeMode: event.target.value as ProductOptionChargeMode,
                          })
                        }
                      >
                        {PRODUCT_OPTION_CHARGE_MODES.map((mode) => (
                          <option key={mode} value={mode}>
                            {CHARGE_LABELS[mode]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="admin-field">
                    <span>Артикул ERP (склад)</span>
                    <input
                      className="admin-input"
                      value={value.erpSku}
                      disabled={!canUpdate}
                      placeholder="Необязательно — если есть в ERP"
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) =>
                        updateValue(groupIndex, valueIndex, { erpSku: event.target.value })
                      }
                    />
                    <span className="admin-field__hint">
                      Для упаковки и ленты — артикул складской позиции в ERP, без отдельного
                      товара на сайте.
                    </span>
                  </label>

                  {variants.length > 1 ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {variants.map((variant) => (
                        <label key={variant.key} className="admin-field">
                          <span className="text-xs">
                            Доплата для «{variant.name || 'размера'}» (пусто = общая)
                          </span>
                          <input
                            className="admin-input tabular-nums"
                            value={value.variantSurchargeMajor[variant.key] ?? ''}
                            disabled={!canUpdate}
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
                  ) : null}

                  {canUpdate ? (
                    <div className="admin-row-actions">
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={value.active}
                          onChange={(event) =>
                            updateValue(groupIndex, valueIndex, { active: event.target.checked })
                          }
                        />
                        Активна
                      </label>
                      <button
                        type="button"
                        className="admin-btn-ghost text-xs"
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
                        Удалить значение
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>

            {canUpdate ? (
              <div className="admin-row-actions">
                <button
                  type="button"
                  className="admin-btn-ghost text-xs"
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
                  Добавить значение
                </button>
                <button
                  type="button"
                  className="admin-btn-ghost text-xs"
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
            className="admin-btn-ghost"
            onClick={() => {
              setOptionGroups((prev) => [...prev, emptyOptionGroupDraft()]);
              touch();
            }}
          >
            Добавить группу опций
          </button>
        ) : null}
      </div>
    </section>
  );
}

'use client';

import {
  COMPONENT_ROLES,
  COMPOSITION_PRECISIONS,
  deriveCompositionKind,
  deriveCompositionManagerSummary,
  suggestVisualPaletteColorIds,
  type ComponentRole,
  type CompositionPrecision,
} from '@bouquet-one/contracts';
import {
  componentRoleLabel,
  compositionKindLabel,
  compositionPrecisionLabel,
} from '@/lib/admin-labels';
import {
  emptyComponentDraft,
  type ComponentDraft,
  type CompositionHit,
  type PickerOption,
} from '@/components/admin/product-editor-shared';

type ColorOption = PickerOption & { swatch?: string | null };

type Props = {
  canUpdate: boolean;
  components: ComponentDraft[];
  setComponents: React.Dispatch<React.SetStateAction<ComponentDraft[]>>;
  compositionPrecision: CompositionPrecision;
  setCompositionPrecision: (value: CompositionPrecision) => void;
  colors: ColorOption[];
  compositionPickerOpen: boolean;
  setCompositionPickerOpen: (open: boolean) => void;
  compositionReplaceKey: string | null;
  setCompositionReplaceKey: (key: string | null) => void;
  compositionSearch: string;
  setCompositionSearch: (value: string) => void;
  compositionAddQty: string;
  setCompositionAddQty: (value: string) => void;
  compositionHits: CompositionHit[];
  compositionSearchPending: boolean;
  onAddFlower: (itemId: string, itemName?: string) => void;
  onOpenReplace: (componentKey: string) => void;
  onSuggestPalette: (colorIds: string[]) => void;
  touch: () => void;
  nextComponentKey: () => string;
};

export function ProductEditorCompositionTab(props: Props) {
  const {
    canUpdate,
    components,
    setComponents,
    compositionPrecision,
    setCompositionPrecision,
    colors,
    compositionPickerOpen,
    setCompositionPickerOpen,
    compositionReplaceKey,
    setCompositionReplaceKey,
    compositionSearch,
    setCompositionSearch,
    compositionAddQty,
    setCompositionAddQty,
    compositionHits,
    compositionSearchPending,
    onAddFlower,
    onOpenReplace,
    onSuggestPalette,
    touch,
    nextComponentKey,
  } = props;

  const derivedKind = deriveCompositionKind(
    components.map((row) => ({
      role: row.role,
      typeName: row.typeName,
    })),
  );
  const compositionSummary = deriveCompositionManagerSummary(components);
  const suggestedPaletteIds = suggestVisualPaletteColorIds(
    components.map((row) => ({ role: row.role, colorId: row.colorId || null })),
  );

  function updateRow(index: number, patch: Partial<ComponentDraft>) {
    setComponents((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
    touch();
  }

  function duplicateRow(index: number) {
    setComponents((prev) => {
      const source = prev[index];
      if (!source) return prev;
      const copy = emptyComponentDraft({
        ...source,
        key: nextComponentKey(),
      });
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
    touch();
  }

  return (
    <section className="admin-section space-y-6">
      <div>
        <h2 className="admin-section__title">Состав</h2>
        <p className="admin-section__lead">
          Строки цветов с цветом, количеством и ролью. Вид состава считается автоматически.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="admin-field max-w-xs">
          <span>Точность состава</span>
          <select
            className="admin-select"
            value={compositionPrecision}
            disabled={!canUpdate}
            onChange={(event) => {
              setCompositionPrecision(event.target.value as CompositionPrecision);
              touch();
            }}
          >
            {COMPOSITION_PRECISIONS.map((value) => (
              <option key={value} value={value}>
                {compositionPrecisionLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm">
          <span className="text-[var(--admin-muted)]">Вид состава: </span>
          <strong>{compositionKindLabel(derivedKind)}</strong>
          <span className="admin-field__hint ml-2">(по основным позициям)</span>
        </p>
      </div>

      <ul className="space-y-3">
        {components.length === 0 ? (
          <li className="text-sm text-[var(--admin-muted)]">Добавьте хотя бы один цветок.</li>
        ) : (
          components.map((component, index) => (
            <li
              key={component.key}
              className="space-y-3 rounded-lg border border-[var(--admin-border)] px-3 py-3"
            >
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{component.displayName || '—'}</p>
                  <p className="text-xs text-[var(--admin-muted)]">
                    {[component.typeName, component.varietyName, component.originName]
                      .filter(Boolean)
                      .join(' · ')}
                    {component.stemLengthCm != null ? ` · ${component.stemLengthCm} см` : ''}
                  </p>
                </div>
                {canUpdate ? (
                  <div className="admin-row-actions">
                    <button
                      type="button"
                      className="admin-btn-ghost text-xs"
                      onClick={() => onOpenReplace(component.key)}
                    >
                      Изменить цветок
                    </button>
                    <button
                      type="button"
                      className="admin-btn-ghost text-xs"
                      onClick={() => duplicateRow(index)}
                    >
                      Дублировать
                    </button>
                    <button
                      type="button"
                      className="admin-btn-ghost text-xs"
                      onClick={() => {
                        setComponents((prev) => prev.filter((_, i) => i !== index));
                        touch();
                      }}
                    >
                      Удалить
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="admin-field">
                  <span>Цвет в букете</span>
                  <select
                    className="admin-select"
                    value={component.colorId}
                    disabled={!canUpdate}
                    onChange={(event) => {
                      const colorId = event.target.value;
                      const colorName = colors.find((c) => c.id === colorId)?.name ?? '';
                      updateRow(index, { colorId, colorName });
                    }}
                  >
                    <option value="">Не указан</option>
                    {colors.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-field">
                  <span>Количество</span>
                  <div className="admin-field admin-field--row">
                    <input
                      className="admin-input w-24 tabular-nums"
                      type="number"
                      min={0}
                      value={component.quantity}
                      disabled={!canUpdate}
                      onChange={(event) => updateRow(index, { quantity: event.target.value })}
                    />
                    <span className="text-sm text-[var(--admin-muted)]">шт.</span>
                  </div>
                </label>
                <label className="admin-field">
                  <span>Роль</span>
                  <select
                    className="admin-select"
                    value={component.role}
                    disabled={!canUpdate}
                    onChange={(event) =>
                      updateRow(index, { role: event.target.value as ComponentRole })
                    }
                  >
                    {COMPONENT_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {componentRoleLabel(role)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </li>
          ))
        )}
      </ul>

      {canUpdate ? (
        <div className="space-y-3">
          {!compositionPickerOpen ? (
            <button
              type="button"
              className="admin-btn"
              onClick={() => {
                setCompositionReplaceKey(null);
                setCompositionPickerOpen(true);
              }}
            >
              + Добавить цветок
            </button>
          ) : (
            <div className="max-w-lg space-y-3 rounded-lg border border-[var(--admin-border)] p-3">
              <p className="text-sm font-medium">
                {compositionReplaceKey ? 'Заменить цветок' : 'Добавить цветок'}
              </p>
              <label className="admin-field">
                <span>Поиск</span>
                <input
                  className="admin-input"
                  value={compositionSearch}
                  autoFocus
                  placeholder="Мондиаль, Эквадор…"
                  onChange={(event) => setCompositionSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && compositionHits[0]) {
                      event.preventDefault();
                      onAddFlower(compositionHits[0].id, compositionHits[0].name);
                    }
                  }}
                />
              </label>
              {!compositionReplaceKey ? (
                <label className="admin-field">
                  <span>Количество для следующего</span>
                  <input
                    className="admin-input w-24"
                    type="number"
                    min={1}
                    value={compositionAddQty}
                    onChange={(event) => setCompositionAddQty(event.target.value)}
                  />
                </label>
              ) : null}
              <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
                {compositionSearchPending ? (
                  <li className="text-[var(--admin-muted)]">Поиск…</li>
                ) : compositionHits.length === 0 ? (
                  <li className="text-[var(--admin-muted)]">
                    Ничего не найдено.{' '}
                    <a
                      href="/admin/catalog/flower-structure"
                      className="underline underline-offset-2"
                    >
                      Создать цветок
                    </a>
                  </li>
                ) : (
                  compositionHits.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="w-full rounded px-2 py-1.5 text-left hover:bg-[var(--admin-surface-muted,rgba(0,0,0,0.04))]"
                        onClick={() => onAddFlower(item.id, item.name)}
                      >
                        {item.name}
                      </button>
                    </li>
                  ))
                )}
              </ul>
              <button
                type="button"
                className="admin-btn-ghost"
                onClick={() => {
                  setCompositionPickerOpen(false);
                  setCompositionReplaceKey(null);
                  setCompositionSearch('');
                }}
              >
                Готово
              </button>
            </div>
          )}
        </div>
      ) : null}

      {canUpdate && suggestedPaletteIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="admin-btn-ghost"
            onClick={() => onSuggestPalette(suggestedPaletteIds)}
          >
            Предложить палитру из состава
          </button>
          <span className="admin-field__hint">
            {suggestedPaletteIds.length}{' '}
            {suggestedPaletteIds.length === 1 ? 'цвет' : 'цвета'} → вкладка «Подбор»
          </span>
        </div>
      ) : null}

      {compositionSummary.flowerTypes.length > 0 ? (
        <div className="rounded-lg bg-[var(--admin-surface-muted,rgba(0,0,0,0.03))] p-3 text-sm">
          <p className="font-medium">Из состава система знает</p>
          <dl className="mt-2 grid gap-1 sm:grid-cols-2">
            <div>
              <dt className="text-[var(--admin-muted)]">Цветы</dt>
              <dd>{compositionSummary.flowerTypes.join(' · ')}</dd>
            </div>
            {compositionSummary.varieties.length > 0 ? (
              <div>
                <dt className="text-[var(--admin-muted)]">Сорта</dt>
                <dd>{compositionSummary.varieties.join(' · ')}</dd>
              </div>
            ) : null}
            {compositionSummary.origins.length > 0 ? (
              <div>
                <dt className="text-[var(--admin-muted)]">Происхождение</dt>
                <dd>{compositionSummary.origins.join(' · ')}</dd>
              </div>
            ) : null}
            {compositionSummary.stemLengthLabel ? (
              <div>
                <dt className="text-[var(--admin-muted)]">Высота стеблей</dt>
                <dd>{compositionSummary.stemLengthLabel}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}
    </section>
  );
}

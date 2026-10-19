'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  COMPONENT_ROLES,
  deriveCompositionKind,
  formatCompositionSummaryLine,
  productKindUsesBouquetCompositionKind,
  suggestVisualPaletteColorIds,
  type ComponentRole,
  type ProductKind,
} from '@bouquet-one/contracts';
import { AdminColorSwatch } from '@/components/admin/admin-color-swatch';
import {
  emptyComponentDraft,
  formatCompositionHitSubtitle,
  type ComponentDraft,
  type CompositionHit,
} from '@/components/admin/product-editor-shared';
import { componentRoleLabel } from '@/lib/admin-labels';

type Props = {
  canUpdate: boolean;
  productKind: ProductKind;
  components: ComponentDraft[];
  setComponents: React.Dispatch<React.SetStateAction<ComponentDraft[]>>;
  compositionSearch: string;
  setCompositionSearch: (value: string) => void;
  compositionAddQty: string;
  setCompositionAddQty: (value: string) => void;
  compositionHits: CompositionHit[];
  compositionSearchPending: boolean;
  compositionSearchError: string | null;
  /** True when query is empty — hits are browse suggestions, not search results. */
  compositionBrowseMode: boolean;
  compositionReplaceKey: string | null;
  setCompositionReplaceKey: (key: string | null) => void;
  onAddFlower: (itemId: string, itemName?: string) => void;
  onSuggestPalette: (colorIds: string[]) => void;
  touch: () => void;
  nextComponentKey: () => string;
};

export function ProductEditorCompositionTab(props: Props) {
  const {
    canUpdate,
    productKind,
    components,
    setComponents,
    compositionSearch,
    setCompositionSearch,
    compositionAddQty,
    setCompositionAddQty,
    compositionHits,
    compositionSearchPending,
    compositionSearchError,
    compositionBrowseMode,
    compositionReplaceKey,
    setCompositionReplaceKey,
    onAddFlower,
    onSuggestPalette,
    touch,
    nextComponentKey,
  } = props;

  const listId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [compositionHits, compositionSearch]);

  const derivedKind = deriveCompositionKind(
    components.map((row) => ({
      role: row.role,
      typeName: row.typeName,
    })),
  );
  const typeNames = [
    ...new Set(components.map((row) => row.typeName.trim()).filter(Boolean)),
  ];
  const colorNames = [
    ...new Set(components.map((row) => row.colorName.trim()).filter(Boolean)),
  ];
  const summaryLine = formatCompositionSummaryLine({
    kind: derivedKind,
    typeNames,
    colorNames,
    productKind,
  });
  const suggestedPaletteIds = suggestVisualPaletteColorIds(
    components.map((row) => ({ role: row.role, colorId: row.colorId || null })),
  );
  const showBouquetRoles = productKindUsesBouquetCompositionKind(productKind);
  const isStem = productKind === 'STEM';
  const isReplacing = Boolean(compositionReplaceKey);

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

  function pickHit(hit: CompositionHit) {
    onAddFlower(hit.id, hit.name);
    searchRef.current?.focus();
  }

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (compositionHits.length === 0) return;
      setActiveIndex((i) => Math.min(i + 1, compositionHits.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (compositionHits.length === 0) return;
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      const hit = compositionHits[activeIndex] ?? compositionHits[0];
      if (hit) {
        event.preventDefault();
        pickHit(hit);
      }
      return;
    }
    if (event.key === 'Escape' && isReplacing) {
      event.preventDefault();
      setCompositionReplaceKey(null);
      setCompositionSearch('');
    }
  }

  return (
    <section className="admin-section space-y-6" data-section="composition">
      <div>
        <h2 className="admin-section__title">Состав</h2>
        <p className="admin-section__lead">
          {isStem
            ? 'Выберите цветок из справочника — цвет подставится автоматически.'
            : 'Добавьте цветы из справочника. Цвет берётся из карточки цветка, не задаётся вручную.'}
        </p>
      </div>

      {summaryLine ? (
        <p className="text-sm text-[var(--admin-muted)]">{summaryLine}</p>
      ) : null}

      {canUpdate ? (
        <div className="max-w-xl space-y-3">
          {isReplacing ? (
            <p className="text-sm font-medium text-amber-900">
              Замена цветка — выберите новую позицию из списка.
              <button
                type="button"
                className="admin-link ml-2 text-xs"
                onClick={() => {
                  setCompositionReplaceKey(null);
                  setCompositionSearch('');
                }}
              >
                Отмена
              </button>
            </p>
          ) : null}

          <label className="admin-field">
            <span>Поиск цветка</span>
            <input
              ref={searchRef}
              className="admin-input"
              value={compositionSearch}
              autoFocus={isReplacing}
              placeholder="Название, вид, форма, сорт…"
              role="combobox"
              aria-expanded={compositionHits.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              onChange={(event) => setCompositionSearch(event.target.value)}
              onKeyDown={onSearchKeyDown}
            />
          </label>

          {!isReplacing ? (
            <label className="admin-field max-w-[8rem]">
              <span>Кол-во</span>
              <input
                className="admin-input tabular-nums"
                type="number"
                min={1}
                value={compositionAddQty}
                onChange={(event) => setCompositionAddQty(event.target.value)}
              />
            </label>
          ) : null}

          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--admin-muted)]">
              {compositionBrowseMode ? 'Из справочника' : 'Результаты поиска'}
            </p>
            <ul
              id={listId}
              role="listbox"
              className="max-h-56 space-y-0.5 overflow-y-auto rounded-md border border-[var(--admin-border)] p-1"
            >
              {compositionSearchPending ? (
                <li className="px-2 py-2 text-sm text-[var(--admin-muted)]">Поиск…</li>
              ) : compositionSearchError ? (
                <li className="px-2 py-2 text-sm text-red-800">{compositionSearchError}</li>
              ) : compositionHits.length === 0 ? (
                <li className="px-2 py-2 text-sm text-[var(--admin-muted)]">
                  {compositionBrowseMode
                    ? 'Нет доступных позиций. '
                    : 'Ничего не найдено. '}
                  <a
                    href="/admin/catalog/flower-structure"
                    className="underline underline-offset-2"
                  >
                    Создать цветок
                  </a>
                </li>
              ) : (
                compositionHits.map((item, index) => {
                  const subtitle = formatCompositionHitSubtitle(item);
                  const active = index === activeIndex;
                  return (
                    <li key={item.id} role="option" aria-selected={active}>
                      <button
                        type="button"
                        className={`flex w-full items-start gap-2 rounded px-2 py-2 text-left text-sm ${
                          active
                            ? 'bg-[var(--admin-surface-muted,rgba(0,0,0,0.06))]'
                            : 'hover:bg-[var(--admin-surface-muted,rgba(0,0,0,0.04))]'
                        }`}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => pickHit(item)}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{item.name}</span>
                          {subtitle ? (
                            <span className="mt-0.5 block text-xs text-[var(--admin-muted)]">
                              {subtitle}
                            </span>
                          ) : null}
                        </span>
                        {item.color?.name ? (
                          <AdminColorSwatch
                            name={item.color.name}
                            swatch={item.color.swatch}
                            className="shrink-0 text-xs text-[var(--admin-muted)]"
                          />
                        ) : (
                          <span className="shrink-0 text-xs text-[var(--admin-muted)]">
                            цвет не указан
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>
      ) : null}

      <hr className="border-[var(--admin-border)]" />

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-[var(--admin-ink)]">
          В составе ({components.length})
        </h3>
        <ul className="space-y-3">
          {components.length === 0 ? (
            <li className="text-sm text-[var(--admin-muted)]">
              Пока пусто — найдите цветок выше и добавьте.
            </li>
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
                      {[component.typeName, component.formName, component.varietyName]
                        .filter(Boolean)
                        .join(' · ')}
                      {component.stemLengthCm != null ? ` · ${component.stemLengthCm} см` : ''}
                    </p>
                    {component.colorName ? (
                      <p className="mt-1 text-sm">
                        <AdminColorSwatch
                          name={component.colorName}
                          swatch={component.colorSwatch}
                        />
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-[var(--admin-muted)]">
                        Цвет не задан в справочнике
                      </p>
                    )}
                  </div>
                  {canUpdate ? (
                    <div className="admin-row-actions">
                      <button
                        type="button"
                        className="admin-btn-ghost text-xs"
                        onClick={() => {
                          setCompositionReplaceKey(component.key);
                          setCompositionSearch('');
                          searchRef.current?.focus();
                        }}
                      >
                        Заменить
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

                <div className="grid gap-3 sm:grid-cols-2">
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
                  {showBouquetRoles ? (
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
                  ) : null}
                </div>
              </li>
            ))
          )}
        </ul>
      </div>

      {canUpdate && suggestedPaletteIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="admin-btn-ghost"
            onClick={() => onSuggestPalette(suggestedPaletteIds)}
          >
            Предложить гамму из состава
          </button>
          <span className="admin-field__hint">
            Необязательно — для SEO-фильтров во вкладке «Основное»
          </span>
        </div>
      ) : null}
    </section>
  );
}

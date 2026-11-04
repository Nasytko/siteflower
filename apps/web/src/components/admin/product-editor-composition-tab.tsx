'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import {
  deriveCompositionKind,
  formatCompositionSummaryLine,
  productKindUsesBouquetCompositionKind,
  type ProductKind,
} from '@bouquet-one/contracts';
import { AdminColorSwatch } from '@/components/admin/admin-color-swatch';
import {
  formatCompositionHitSubtitle,
  type ComponentDraft,
  type CompositionHit,
} from '@/components/admin/product-editor-shared';

type Props = {
  canUpdate: boolean;
  productKind: ProductKind;
  components: ComponentDraft[];
  setComponents: React.Dispatch<React.SetStateAction<ComponentDraft[]>>;
  compositionSearch: string;
  setCompositionSearch: (value: string) => void;
  compositionHits: CompositionHit[];
  compositionSearchPending: boolean;
  compositionSearchError: string | null;
  /** True when query is empty — hits are browse suggestions, not search results. */
  compositionBrowseMode: boolean;
  compositionReplaceKey: string | null;
  setCompositionReplaceKey: (key: string | null) => void;
  onAddFlower: (itemId: string, itemName?: string) => void;
  touch: () => void;
};

const FLOWER_DICTIONARY_HREF = '/admin/catalog/flower-structure';

export function ProductEditorCompositionTab(props: Props) {
  const {
    canUpdate,
    productKind,
    components,
    setComponents,
    compositionSearch,
    setCompositionSearch,
    compositionHits,
    compositionSearchPending,
    compositionSearchError,
    compositionBrowseMode,
    compositionReplaceKey,
    setCompositionReplaceKey,
    onAddFlower,
    touch,
  } = props;

  const listId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [compositionHits, compositionSearch]);

  const derivedKind = deriveCompositionKind(
    components.map((row) => ({
      typeId: row.typeId || null,
      compositionClass: row.compositionClass,
      flowerItem: row.typeId
        ? {
            flowerTypeId: row.typeId,
            flowerType: {
              id: row.typeId,
              compositionClass: row.compositionClass,
            },
          }
        : null,
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
  const showKindPreview = productKindUsesBouquetCompositionKind(productKind);
  const isStem = productKind === 'STEM';
  const isReplacing = Boolean(compositionReplaceKey);

  function moveRow(index: number, delta: -1 | 1) {
    setComponents((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const current = next[index];
      const swap = next[target];
      if (!current || !swap) return prev;
      next[index] = swap;
      next[target] = current;
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
    <section className="sf-pe-card space-y-6" data-section="composition">
      <div className="sf-pe-card__head">
        <div>
          <h2>{isStem ? 'Выбор цветка' : 'Состав'}</h2>
          <p className="sf-pe-card__lead">
            {isStem
              ? 'Одна позиция из справочника — вид и параметры подставятся сами.'
              : 'Цветы из справочника. Каждый вид один раз, порядок можно менять.'}
          </p>
        </div>
      </div>
      <div className="sf-pe-card__body space-y-6">
        {summaryLine ? (
          <p className="text-sm text-[var(--admin-muted)]">{summaryLine}</p>
        ) : showKindPreview && derivedKind === 'UNKNOWN' && components.length > 0 ? (
          <p className="text-sm text-[var(--admin-muted)]">
            Добавьте основной цветок из справочника — так определится вид букета.
          </p>
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

            <label className="sf-pe-field">
              <span>Поиск цветка</span>
              <input
                ref={searchRef}
                className="sf-pe-input"
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
                    <Link className="admin-link" href={FLOWER_DICTIONARY_HREF}>
                      Справочник цветов
                    </Link>
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
            <p className="text-xs text-[var(--admin-muted)]">
              Новые позиции добавляются в{' '}
              <Link className="admin-link" href={FLOWER_DICTIONARY_HREF}>
                справочнике цветов
              </Link>
              , не здесь.
            </p>
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
                  className="space-y-2 rounded-lg border border-[var(--admin-border)] px-3 py-3"
                >
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{component.displayName || '—'}</p>
                      {component.flowerItemMissing ? (
                        <p className="mt-1 text-sm text-amber-900">
                          Позиция не найдена в справочнике.{' '}
                          <Link className="admin-link" href={FLOWER_DICTIONARY_HREF}>
                            Открыть справочник
                          </Link>
                        </p>
                      ) : (
                        <>
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
                        </>
                      )}
                    </div>
                    {canUpdate ? (
                      <div className="admin-row-actions">
                        {!isStem && index > 0 ? (
                          <button
                            type="button"
                            className="sf-pe-btn sf-pe-btn--quiet"
                            onClick={() => moveRow(index, -1)}
                          >
                            ↑
                          </button>
                        ) : null}
                        {!isStem && index < components.length - 1 ? (
                          <button
                            type="button"
                            className="sf-pe-btn sf-pe-btn--quiet"
                            onClick={() => moveRow(index, 1)}
                          >
                            ↓
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="sf-pe-btn sf-pe-btn--quiet"
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
                          className="sf-pe-btn sf-pe-btn--quiet"
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
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}

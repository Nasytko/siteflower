'use client';

import { useEffect, useState } from 'react';
import {
  CATALOG_FILTER_PRESETS,
  type CatalogCategoryFilterConfigDto,
  type CatalogFilterDefinitionDto,
  type CatalogFilterPreset,
} from '@bouquet-one/contracts';
import {
  adminGet,
  adminPost,
  adminPut,
  AdminRequestError,
  errorMessage,
} from '@/lib/admin-client';
import { adminEndpoints } from '@/lib/admin-endpoints';

type FiltersPayload = {
  categoryId: string;
  filters: CatalogCategoryFilterConfigDto[];
  available: CatalogFilterDefinitionDto[];
};

type Props = {
  categoryId: string;
  categoryName: string;
  onClose: () => void;
};

export function CategoryFiltersEditor({ categoryId, categoryName, onClose }: Props) {
  const [data, setData] = useState<FiltersPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void adminGet<FiltersPayload>(adminEndpoints.catalogCategoryFilters(categoryId))
      .then((next) => {
        if (cancelled) return;
        setData(next);
        setPreview(next.filters.filter((row) => row.enabled).map((row) => row.label));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  const save = async (filters: CatalogCategoryFilterConfigDto[]) => {
    setPending(true);
    setError(null);
    try {
      const next = await adminPut<FiltersPayload>(adminEndpoints.catalogCategoryFilters(categoryId), {
        filters: filters.map((row, position) => ({
          key: row.key,
          enabled: row.enabled,
          position,
          labelOverride: row.labelOverride,
          collapsed: row.collapsed,
        })),
      });
      setData(next);
      setPreview(next.filters.filter((row) => row.enabled).map((row) => row.label));
    } catch (err) {
      setError(err instanceof AdminRequestError ? errorMessage(err) : errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const applyPreset = async (preset: CatalogFilterPreset) => {
    setPending(true);
    setError(null);
    try {
      const next = await adminPost<FiltersPayload>(
        adminEndpoints.catalogCategoryFiltersPreset(categoryId),
        { preset },
      );
      setData(next);
      setPreview(next.filters.filter((row) => row.enabled).map((row) => row.label));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const move = (index: number, direction: -1 | 1) => {
    if (!data) return;
    const next = [...data.filters];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const tmp = next[index]!;
    next[index] = next[target]!;
    next[target] = tmp;
    void save(next);
  };

  const addFilter = (definition: CatalogFilterDefinitionDto) => {
    if (!data) return;
    void save([
      ...data.filters,
      {
        id: definition.id,
        definitionId: definition.id,
        key: definition.key,
        name: definition.name,
        label: definition.name,
        filterType: definition.filterType,
        enabled: true,
        position: data.filters.length,
        labelOverride: null,
        collapsed: false,
        version: 1,
      },
    ]);
  };

  const removeFilter = (key: string) => {
    if (!data) return;
    void save(data.filters.filter((row) => row.key !== key));
  };

  const toggleEnabled = (key: string) => {
    if (!data) return;
    void save(
      data.filters.map((row) =>
        row.key === key ? { ...row, enabled: !row.enabled } : row,
      ),
    );
  };

  return (
    <div className="admin-modal" role="dialog" aria-modal="true" aria-label="Фильтры категории">
      <div className="admin-modal__panel max-w-2xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="admin-h2">Фильтры каталога</h2>
            <p className="sf-small text-[var(--admin-muted)]">{categoryName}</p>
          </div>
          <button type="button" className="admin-btn-ghost" onClick={onClose}>
            Закрыть
          </button>
        </div>

        {error ? <p className="admin-error">{error}</p> : null}

        <div className="flex flex-wrap gap-2">
          {CATALOG_FILTER_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className="admin-btn-ghost text-xs"
              disabled={pending}
              onClick={() => void applyPreset(preset)}
            >
              Пресет {preset}
            </button>
          ))}
        </div>

        <section>
          <h3 className="admin-label mb-2">Показываются на странице категории</h3>
          {!data ? (
            <p className="sf-small text-[var(--admin-muted)]">Загрузка…</p>
          ) : data.filters.length === 0 ? (
            <p className="sf-small text-[var(--admin-muted)]">
              Фильтры не настроены. Выберите пресет или добавьте из пула ниже.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.filters.map((row, index) => (
                <li
                  key={row.key}
                  className="flex flex-wrap items-center gap-2 rounded border border-[var(--admin-border)] px-3 py-2"
                >
                  <span className="min-w-[8rem] font-medium">{row.label}</span>
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      disabled={pending}
                      onChange={() => toggleEnabled(row.key)}
                    />
                    Вкл.
                  </label>
                  <button
                    type="button"
                    className="admin-btn-ghost text-xs"
                    disabled={pending || index === 0}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="admin-btn-ghost text-xs"
                    disabled={pending || index === data.filters.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="admin-btn-ghost text-xs"
                    disabled={pending}
                    onClick={() => removeFilter(row.key)}
                  >
                    Убрать
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="admin-label mb-2">Доступные фильтры</h3>
          {!data || data.available.length === 0 ? (
            <p className="sf-small text-[var(--admin-muted)]">Все фильтры уже добавлены.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.available.map((row) => (
                <button
                  key={row.key}
                  type="button"
                  className="admin-btn-ghost text-xs"
                  disabled={pending}
                  onClick={() => addFilter(row)}
                >
                  + {row.name}
                </button>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="admin-label mb-2">Предпросмотр фильтров</h3>
          {preview.length === 0 ? (
            <p className="sf-small text-[var(--admin-muted)]">Нет включённых фильтров.</p>
          ) : (
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {preview.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

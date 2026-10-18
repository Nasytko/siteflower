'use client';

import { useMemo, useState } from 'react';
import { adminPost, AdminRequestError, errorMessage } from '@/lib/admin-client';
import { adminEndpoints, type TaxonomyKind } from '@/lib/admin-endpoints';

type Option = { id: string; name: string; swatch?: string | null };

type Props = {
  kind: TaxonomyKind;
  options: Option[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onCreated: (item: Option) => void;
  canCreate: boolean;
  canUpdate: boolean;
  legend: string;
};

const KIND_LABEL: Record<TaxonomyKind, string> = {
  occasions: 'повод',
  recipients: 'получателя',
  colors: 'цвет',
};

export function TaxonomyQuickPick({
  kind,
  options,
  selectedIds,
  onChange,
  onCreated,
  canCreate,
  canUpdate,
  legend,
}: Props) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => option.name.toLowerCase().includes(q));
  }, [options, query]);

  const exactMatch = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return options.some((option) => option.name.toLowerCase() === q);
  }, [options, query]);

  function toggleId(id: string) {
    if (!canUpdate) return;
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((item) => item !== id)
        : [...selectedIds, id],
    );
  }

  async function onCreate() {
    if (!canCreate || !canUpdate) return;
    const name = query.trim();
    if (name.length === 0 || exactMatch) return;
    setCreating(true);
    setError(null);
    try {
      const created = await adminPost<Option & { swatch?: string | null }>(
        adminEndpoints.taxonomy(kind),
        { name },
      );
      const item: Option = {
        id: created.id,
        name: created.name,
        ...(kind === 'colors' ? { swatch: created.swatch ?? null } : {}),
      };
      onCreated(item);
      if (!selectedIds.includes(item.id)) {
        onChange([...selectedIds, item.id]);
      }
      setQuery('');
    } catch (err) {
      if (err instanceof AdminRequestError && err.kind === 'conflict') {
        setError(errorMessage(err, 'Такое название или адрес уже есть'));
      } else {
        setError(errorMessage(err, `Не удалось создать ${KIND_LABEL[kind]}`));
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <fieldset className="admin-fieldset">
      <legend>{legend}</legend>
      <label className="admin-field mb-2">
        <span className="sr-only">Поиск</span>
        <input
          className="admin-input"
          value={query}
          disabled={!canUpdate}
          placeholder="Поиск…"
          onChange={(event) => {
            setQuery(event.target.value);
            setError(null);
          }}
        />
      </label>
      {filtered.length > 0 ? (
        <div className="admin-checks">
          {filtered.map((option) => (
            <label key={option.id} className="admin-check">
              <input
                type="checkbox"
                disabled={!canUpdate}
                checked={selectedIds.includes(option.id)}
                onChange={() => toggleId(option.id)}
              />
              {kind === 'colors' ? (
                <span
                  aria-hidden
                  className="admin-swatch admin-swatch--sm"
                  style={option.swatch ? { background: option.swatch } : undefined}
                />
              ) : null}
              {option.name}
            </label>
          ))}
        </div>
      ) : (
        <p className="admin-help">Ничего не найдено.</p>
      )}
      {canCreate && canUpdate && query.trim().length > 0 && !exactMatch ? (
        <button
          type="button"
          className="admin-btn-ghost mt-2 text-sm"
          disabled={creating}
          onClick={() => void onCreate()}
        >
          {creating ? 'Создание…' : `+ Создать «${query.trim()}»`}
        </button>
      ) : null}
      {error ? <p className="admin-field-error mt-2">{error}</p> : null}
    </fieldset>
  );
}

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
  holidays: 'праздник',
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

  const selected = useMemo(
    () => options.filter((option) => selectedIds.includes(option.id)),
    [options, selectedIds],
  );

  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter((option) => {
      if (selectedIds.includes(option.id)) return false;
      if (!q) return true;
      return option.name.toLowerCase().includes(q);
    });
  }, [options, query, selectedIds]);

  const exactMatch = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return options.some((option) => option.name.toLowerCase() === q);
  }, [options, query]);

  function toggleId(id: string) {
    if (!canUpdate) return;
    onChange(
      selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id],
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
    <section className="sf-pe-pick" aria-label={legend}>
      <div className="sf-pe-pick__head">
        <p className="sf-pe-label">{legend}</p>
        <p className="sf-pe-note">{selected.length > 0 ? `Выбрано ${selected.length}` : 'Не выбрано'}</p>
      </div>

      {selected.length > 0 ? (
        <ul className="sf-pe-chips">
          {selected.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                className="sf-pe-chip sf-pe-chip--on"
                disabled={!canUpdate}
                onClick={() => toggleId(option.id)}
              >
                {kind === 'colors' ? <Swatch swatch={option.swatch} /> : null}
                {option.name}
                <span className="sf-pe-chip__x" aria-hidden>
                  ×
                </span>
                <span className="sr-only">Убрать</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <input
        className="sf-pe-input"
        value={query}
        disabled={!canUpdate}
        placeholder={`Найти ${KIND_LABEL[kind]}`}
        onChange={(event) => {
          setQuery(event.target.value);
          setError(null);
        }}
      />

      {available.length > 0 ? (
        <ul className="sf-pe-chips">
          {available.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                className="sf-pe-chip"
                disabled={!canUpdate}
                onClick={() => toggleId(option.id)}
              >
                {kind === 'colors' ? <Swatch swatch={option.swatch} /> : null}
                {option.name}
              </button>
            </li>
          ))}
        </ul>
      ) : query.trim().length > 0 ? (
        <p className="sf-pe-note">Ничего не найдено.</p>
      ) : null}

      {canCreate && canUpdate && query.trim().length > 0 && !exactMatch ? (
        <button
          type="button"
          className="sf-pe-btn sf-pe-btn--quiet"
          disabled={creating}
          onClick={() => void onCreate()}
        >
          {creating ? 'Создание…' : `Добавить «${query.trim()}»`}
        </button>
      ) : null}
      {error ? <p className="admin-field-error">{error}</p> : null}
    </section>
  );
}

function Swatch({ swatch }: { swatch?: string | null }) {
  return (
    <span
      aria-hidden
      className="admin-swatch admin-swatch--sm"
      style={swatch ? { background: swatch } : undefined}
    />
  );
}

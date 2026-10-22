'use client';

import { useEffect, useState } from 'react';
import { flowerItemDisplayName } from '@bouquet-one/contracts';
import { adminGet, adminPost, errorMessage } from '@/lib/admin-client';
import { adminEndpoints } from '@/lib/admin-endpoints';
import type { CompositionHit } from '@/components/admin/product-editor-shared';

type RefOption = { id: string; name: string; flowerTypeId?: string };

type Props = {
  canUpdate: boolean;
  onCreated: (item: CompositionHit) => void;
};

export function ProductEditorInlineFlower({ canUpdate, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [types, setTypes] = useState<RefOption[]>([]);
  const [forms, setForms] = useState<RefOption[]>([]);
  const [varieties, setVarieties] = useState<RefOption[]>([]);
  const [flowerTypeId, setFlowerTypeId] = useState('');
  const [flowerFormId, setFlowerFormId] = useState('');
  const [flowerVarietyId, setFlowerVarietyId] = useState('');
  const [stemLengthCm, setStemLengthCm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void Promise.all([
      adminGet<{ items?: RefOption[] } | RefOption[]>(adminEndpoints.flowerTypes),
      adminGet<{ items?: RefOption[] } | RefOption[]>(adminEndpoints.flowerForms),
      adminGet<{ items?: RefOption[] } | RefOption[]>(adminEndpoints.flowerVarieties),
    ])
      .then(([typeRows, formRows, varietyRows]) => {
        if (cancelled) return;
        setTypes(Array.isArray(typeRows) ? typeRows : (typeRows.items ?? []));
        setForms(Array.isArray(formRows) ? formRows : (formRows.items ?? []));
        setVarieties(Array.isArray(varietyRows) ? varietyRows : (varietyRows.items ?? []));
      })
      .catch(() => {
        if (!cancelled) setError('Не удалось загрузить справочник');
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const typeName = types.find((row) => row.id === flowerTypeId)?.name ?? '';
  const formName = forms.find((row) => row.id === flowerFormId)?.name ?? '';
  const varietyName = varieties.find((row) => row.id === flowerVarietyId)?.name ?? '';
  const stem = stemLengthCm.trim() ? Number(stemLengthCm) : null;
  const preview = typeName
    ? flowerItemDisplayName({
        typeName,
        formName,
        varietyName,
        stemLengthCm: Number.isFinite(stem) ? stem : null,
      })
    : '';

  async function onCreate() {
    if (!canUpdate || !flowerTypeId) return;
    setPending(true);
    setError(null);
    try {
      const created = await adminPost<CompositionHit>(adminEndpoints.flowerItems, {
        flowerTypeId,
        flowerFormId: flowerFormId || null,
        flowerVarietyId: flowerVarietyId || null,
        stemLengthCm: Number.isFinite(stem) ? stem : null,
      });
      onCreated(created);
      setOpen(false);
      setFlowerTypeId('');
      setFlowerFormId('');
      setFlowerVarietyId('');
      setStemLengthCm('');
    } catch (err) {
      setError(errorMessage(err, 'Не удалось создать цветок'));
    } finally {
      setPending(false);
    }
  }

  if (!canUpdate) return null;

  return (
    <div className="space-y-2">
      <button type="button" className="admin-link text-sm" onClick={() => setOpen((value) => !value)}>
        {open ? 'Скрыть создание цветка' : 'Создать цветок здесь'}
      </button>
      {open ? (
        <div className="space-y-3 rounded-xl border border-dashed border-[var(--admin-border)] p-3">
          <label className="admin-field">
            <span>Вид</span>
            <select
              className="admin-select"
              value={flowerTypeId}
              onChange={(event) => {
                setFlowerTypeId(event.target.value);
                setFlowerFormId('');
                setFlowerVarietyId('');
              }}
            >
              <option value="">Выберите вид</option>
              {types.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>Форма</span>
            <select
              className="admin-select"
              value={flowerFormId}
              onChange={(event) => setFlowerFormId(event.target.value)}
            >
              <option value="">Не указана</option>
              {forms
                .filter((row) => !flowerTypeId || row.flowerTypeId === flowerTypeId)
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="admin-field">
            <span>Сорт</span>
            <select
              className="admin-select"
              value={flowerVarietyId}
              onChange={(event) => setFlowerVarietyId(event.target.value)}
            >
              <option value="">Не указан</option>
              {varieties
                .filter((row) => !flowerTypeId || row.flowerTypeId === flowerTypeId)
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="admin-field max-w-[8rem]">
            <span>Высота, см</span>
            <input
              className="admin-input tabular-nums"
              value={stemLengthCm}
              inputMode="numeric"
              onChange={(event) => setStemLengthCm(event.target.value)}
            />
          </label>
          {preview ? <p className="text-sm text-[var(--admin-muted)]">Название: {preview}</p> : null}
          {error ? <p className="admin-field-error">{error}</p> : null}
          <button
            type="button"
            className="admin-btn-ghost"
            disabled={pending || !flowerTypeId}
            onClick={() => void onCreate()}
          >
            {pending ? 'Создание…' : 'Добавить в состав'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

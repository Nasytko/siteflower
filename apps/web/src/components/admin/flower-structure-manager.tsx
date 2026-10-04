'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FlowerOriginDto, FlowerTypeDto, FlowerVarietyDto } from '@bouquet-one/contracts';
import { adminGet, adminPost, AdminRequestError, errorMessage } from '@/lib/admin-client';
import { adminEndpoints } from '@/lib/admin-endpoints';
import { FormSaveStatus, phaseFromAdminError, type FormSavePhase } from '@/components/admin/form-status';

type Props = {
  initialTypes: FlowerTypeDto[];
  initialVarieties: FlowerVarietyDto[];
  initialOrigins: FlowerOriginDto[];
  canCreate: boolean;
};

export function FlowerStructureManager({
  initialTypes,
  initialVarieties,
  initialOrigins,
  canCreate,
}: Props) {
  const router = useRouter();
  const [types, setTypes] = useState(() => [...initialTypes].sort((a, b) => a.sortOrder - b.sortOrder));
  const [varieties, setVarieties] = useState(() =>
    [...initialVarieties].sort((a, b) => a.sortOrder - b.sortOrder),
  );
  const [origins, setOrigins] = useState(() =>
    [...initialOrigins].sort((a, b) => a.sortOrder - b.sortOrder),
  );
  const [filterTypeId, setFilterTypeId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [phase, setPhase] = useState<FormSavePhase>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const typeNameById = useMemo(() => new Map(types.map((row) => [row.id, row.name])), [types]);

  const visibleVarieties = useMemo(() => {
    if (!filterTypeId) return varieties;
    return varieties.filter((row) => row.flowerTypeId === filterTypeId);
  }, [varieties, filterTypeId]);

  async function reload() {
    const [nextTypes, nextVarieties, nextOrigins] = await Promise.all([
      adminGet<FlowerTypeDto[]>(adminEndpoints.flowerTypes),
      adminGet<FlowerVarietyDto[]>(adminEndpoints.flowerVarieties),
      adminGet<FlowerOriginDto[]>(adminEndpoints.flowerOrigins),
    ]);
    setTypes([...nextTypes].sort((a, b) => a.sortOrder - b.sortOrder));
    setVarieties([...nextVarieties].sort((a, b) => a.sortOrder - b.sortOrder));
    setOrigins([...nextOrigins].sort((a, b) => a.sortOrder - b.sortOrder));
  }

  async function run(action: () => Promise<void>, successMessage: string) {
    setPending(true);
    setError(null);
    setRequestId(null);
    setNotice(null);
    setPhase('saving');
    try {
      await action();
      await reload();
      setNotice(successMessage);
      setPhase('saved');
      router.refresh();
    } catch (err) {
      setPhase(err instanceof AdminRequestError ? phaseFromAdminError(err) : 'server');
      setRequestId(err instanceof AdminRequestError ? err.requestId ?? null : null);
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function onCreateType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;
    const form = event.currentTarget;
    const name = String(new FormData(form).get('name') ?? '').trim();
    if (name.length === 0) return;
    await run(async () => {
      await adminPost(adminEndpoints.flowerTypes, {
        name,
        sortOrder: (types.at(-1)?.sortOrder ?? 0) + 10,
      });
      form.reset();
    }, `Вид «${name}» добавлен`);
  }

  async function onCreateVariety(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const flowerTypeId = String(data.get('flowerTypeId') ?? '').trim();
    const name = String(data.get('name') ?? '').trim();
    if (!flowerTypeId || name.length === 0) return;
    await run(async () => {
      await adminPost(adminEndpoints.flowerVarieties, {
        flowerTypeId,
        name,
        sortOrder: (varieties.at(-1)?.sortOrder ?? 0) + 10,
      });
      form.reset();
    }, `Сорт «${name}» добавлен`);
  }

  async function onCreateOrigin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;
    const form = event.currentTarget;
    const name = String(new FormData(form).get('name') ?? '').trim();
    if (name.length === 0) return;
    await run(async () => {
      await adminPost(adminEndpoints.flowerOrigins, {
        name,
        sortOrder: (origins.at(-1)?.sortOrder ?? 0) + 10,
      });
      form.reset();
    }, `Происхождение «${name}» добавлено`);
  }

  return (
    <div className="space-y-8">
      <FormSaveStatus
        phase={phase}
        savedLabel={notice}
        errorMessage={error}
        requestId={requestId}
        onRefresh={() => void reload()}
        onDismiss={() => {
          setError(null);
          setPhase(notice ? 'saved' : 'idle');
        }}
      />

      <section className="admin-section">
        <h2 className="admin-section__title">Виды цветов</h2>
        {canCreate ? (
          <form onSubmit={onCreateType} className="admin-toolbar mb-4">
            <label className="admin-field">
              <span>Новый вид</span>
              <input name="name" required className="admin-input w-56" placeholder="Роза" />
            </label>
            <button type="submit" className="admin-btn" disabled={pending}>
              Добавить
            </button>
          </form>
        ) : null}
        <ul className="admin-checks">
          {types.map((row) => (
            <li key={row.id}>
              {row.name} <span className="text-xs text-[var(--admin-muted)]">/{row.slug}</span>
            </li>
          ))}
          {types.length === 0 ? <li className="admin-empty">Пока пусто</li> : null}
        </ul>
      </section>

      <section className="admin-section">
        <h2 className="admin-section__title">Сорта</h2>
        <label className="admin-field max-w-sm mb-4">
          <span>Фильтр по виду</span>
          <select
            className="admin-select"
            value={filterTypeId}
            onChange={(event) => setFilterTypeId(event.target.value)}
          >
            <option value="">Все сорта</option>
            {types.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        {canCreate ? (
          <form onSubmit={onCreateVariety} className="admin-toolbar mb-4">
            <label className="admin-field">
              <span>Вид</span>
              <select name="flowerTypeId" required className="admin-select w-48" defaultValue="">
                <option value="" disabled>
                  Выберите вид
                </option>
                {types.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span>Сорт</span>
              <input name="name" required className="admin-input w-56" placeholder="Avalanche" />
            </label>
            <button type="submit" className="admin-btn" disabled={pending}>
              Добавить
            </button>
          </form>
        ) : null}
        <ul className="admin-checks">
          {visibleVarieties.map((row) => (
            <li key={row.id}>
              {row.name}{' '}
              <span className="text-xs text-[var(--admin-muted)]">
                · {typeNameById.get(row.flowerTypeId) ?? '—'}
              </span>
            </li>
          ))}
          {visibleVarieties.length === 0 ? <li className="admin-empty">Нет сортов</li> : null}
        </ul>
      </section>

      <section className="admin-section">
        <h2 className="admin-section__title">Происхождение</h2>
        {canCreate ? (
          <form onSubmit={onCreateOrigin} className="admin-toolbar mb-4">
            <label className="admin-field">
              <span>Новое</span>
              <input name="name" required className="admin-input w-56" placeholder="Эквадор" />
            </label>
            <button type="submit" className="admin-btn" disabled={pending}>
              Добавить
            </button>
          </form>
        ) : null}
        <ul className="admin-checks">
          {origins.map((row) => (
            <li key={row.id}>
              {row.name} <span className="text-xs text-[var(--admin-muted)]">/{row.slug}</span>
            </li>
          ))}
          {origins.length === 0 ? <li className="admin-empty">Пока пусто</li> : null}
        </ul>
      </section>
    </div>
  );
}

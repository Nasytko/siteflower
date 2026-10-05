'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  flowerItemDisplayName,
  type FlowerFormAdminDto,
  type FlowerItemAdminDto,
  type FlowerOriginAdminDto,
  type FlowerTypeAdminDto,
  type FlowerVarietyAdminDto,
  type PaginatedResponse,
} from '@bouquet-one/contracts';
import {
  adminDelete,
  adminGet,
  adminPatch,
  adminPost,
  AdminRequestError,
  errorMessage,
} from '@/lib/admin-client';
import { adminEndpoints, withQuery } from '@/lib/admin-endpoints';
import { FormSaveStatus, phaseFromAdminError, type FormSavePhase } from '@/components/admin/form-status';

type Props = {
  initialTypes: FlowerTypeAdminDto[];
  initialVarieties: FlowerVarietyAdminDto[];
  initialOrigins: FlowerOriginAdminDto[];
  initialForms: FlowerFormAdminDto[];
  initialPage: PaginatedResponse<FlowerItemAdminDto>;
  canCreate: boolean;
  canUpdate: boolean;
};

type Draft = {
  flowerTypeId: string;
  flowerFormId: string;
  flowerVarietyId: string;
  flowerOriginId: string;
  stemLengthCm: string;
};

type InlineKind = 'type' | 'form' | 'variety' | 'origin';

const EMPTY_DRAFT: Draft = {
  flowerTypeId: '',
  flowerFormId: '',
  flowerVarietyId: '',
  flowerOriginId: '',
  stemLengthCm: '',
};

function countLabel(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${n} товаров`;
  if (mod10 === 1) return `${n} товар`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} товара`;
  return `${n} товаров`;
}

function previewName(
  draft: Draft,
  types: FlowerTypeAdminDto[],
  forms: FlowerFormAdminDto[],
  varieties: FlowerVarietyAdminDto[],
  origins: FlowerOriginAdminDto[],
): string {
  const typeName = types.find((t) => t.id === draft.flowerTypeId)?.name ?? '';
  if (!typeName) return '';
  const stemRaw = draft.stemLengthCm.trim();
  const stem = stemRaw ? Number(stemRaw) : null;
  return flowerItemDisplayName({
    typeName,
    formName: forms.find((f) => f.id === draft.flowerFormId)?.name ?? null,
    varietyName: varieties.find((v) => v.id === draft.flowerVarietyId)?.name ?? null,
    originName: origins.find((o) => o.id === draft.flowerOriginId)?.name ?? null,
    stemLengthCm: Number.isFinite(stem) ? stem : null,
  });
}

function draftFromItem(item: FlowerItemAdminDto): Draft {
  return {
    flowerTypeId: item.flowerTypeId,
    flowerFormId: item.flowerFormId ?? '',
    flowerVarietyId: item.flowerVarietyId ?? '',
    flowerOriginId: item.flowerOriginId ?? '',
    stemLengthCm: item.stemLengthCm == null ? '' : String(item.stemLengthCm),
  };
}

export function FlowerStructureManager({
  initialTypes,
  initialVarieties,
  initialOrigins,
  initialForms,
  initialPage,
  canCreate,
  canUpdate,
}: Props) {
  const router = useRouter();
  const [types, setTypes] = useState(initialTypes);
  const [varieties, setVarieties] = useState(initialVarieties);
  const [origins, setOrigins] = useState(initialOrigins);
  const [forms, setForms] = useState(initialForms);
  const [items, setItems] = useState(initialPage.items);
  const [total, setTotal] = useState(initialPage.total);
  const [page, setPage] = useState(initialPage.page);
  const [pageSize] = useState(initialPage.pageSize);
  const [listLoading, setListLoading] = useState(false);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterTypeId, setFilterTypeId] = useState('');
  const [filterFormId, setFilterFormId] = useState('');
  const [filterVarietyId, setFilterVarietyId] = useState('');
  const [filterOriginId, setFilterOriginId] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'VISIBLE' | 'HIDDEN'>('ALL');

  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editing, setEditing] = useState<FlowerItemAdminDto | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [usedIn, setUsedIn] = useState<FlowerItemAdminDto['usedIn']>([]);
  const [showUsedIn, setShowUsedIn] = useState(false);

  const [inlineKind, setInlineKind] = useState<InlineKind | null>(null);
  const [inlineName, setInlineName] = useState('');

  const [duplicateExistingId, setDuplicateExistingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [phase, setPhase] = useState<FormSavePhase>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const filterForms = useMemo(
    () =>
      filterTypeId ? forms.filter((f) => f.flowerTypeId === filterTypeId) : forms,
    [forms, filterTypeId],
  );
  const filterVarieties = useMemo(
    () =>
      filterTypeId ? varieties.filter((v) => v.flowerTypeId === filterTypeId) : varieties,
    [varieties, filterTypeId],
  );

  const draftForms = useMemo(
    () =>
      draft.flowerTypeId
        ? forms.filter((f) => f.flowerTypeId === draft.flowerTypeId && f.visibility === 'VISIBLE')
        : [],
    [forms, draft.flowerTypeId],
  );
  const draftVarieties = useMemo(
    () =>
      draft.flowerTypeId
        ? varieties.filter(
            (v) => v.flowerTypeId === draft.flowerTypeId && v.visibility === 'VISIBLE',
          )
        : [],
    [varieties, draft.flowerTypeId],
  );

  const canonicalPreview = useMemo(
    () => previewName(draft, types, forms, varieties, origins),
    [draft, types, forms, varieties, origins],
  );

  async function loadItemsPage(nextPage = page) {
    setListLoading(true);
    try {
      const params: Record<string, string | number | undefined> = {
        includeHidden: '1',
        page: nextPage,
        pageSize,
        q: debouncedSearch || undefined,
        flowerTypeId: filterTypeId || undefined,
        flowerFormId: filterFormId || undefined,
        flowerVarietyId: filterVarietyId || undefined,
        flowerOriginId: filterOriginId || undefined,
        visibility: filterStatus === 'ALL' ? undefined : filterStatus,
      };
      const data = await adminGet<PaginatedResponse<FlowerItemAdminDto>>(
        withQuery(adminEndpoints.flowerItems, params),
      );
      setItems(data.items);
      setTotal(data.total);
      setPage(data.page);
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    void loadItemsPage(1);
  }, [debouncedSearch, filterTypeId, filterFormId, filterVarietyId, filterOriginId, filterStatus]);

  async function reloadRefs() {
    const [nextTypes, nextVarieties, nextOrigins, nextForms] = await Promise.all([
      adminGet<FlowerTypeAdminDto[]>(adminEndpoints.flowerTypes),
      adminGet<FlowerVarietyAdminDto[]>(adminEndpoints.flowerVarieties),
      adminGet<FlowerOriginAdminDto[]>(adminEndpoints.flowerOrigins),
      adminGet<FlowerFormAdminDto[]>(`${adminEndpoints.flowerForms}?includeHidden=1`),
    ]);
    setTypes(nextTypes);
    setVarieties(nextVarieties);
    setOrigins(nextOrigins);
    setForms(nextForms);
  }

  async function reload() {
    await reloadRefs();
    await loadItemsPage(page);
  }

  async function run(action: () => Promise<void>, successMessage: string) {
    setPending(true);
    setError(null);
    setRequestId(null);
    setNotice(null);
    setDuplicateExistingId(null);
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
      if (err instanceof AdminRequestError && err.code === 'FLOWER_ITEM_DUPLICATE' && err.existingId) {
        setDuplicateExistingId(err.existingId);
      }
    } finally {
      setPending(false);
    }
  }

  function openCreate() {
    setMode('create');
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setUsedIn([]);
    setShowUsedIn(false);
    setInlineKind(null);
    setInlineName('');
    setDuplicateExistingId(null);
    setError(null);
  }

  async function openEdit(item: FlowerItemAdminDto) {
    await openEditById(item.id, item);
  }

  async function openEditById(id: string, seed?: FlowerItemAdminDto) {
    setMode('edit');
    if (seed) {
      setEditing(seed);
      setDraft(draftFromItem(seed));
    }
    setInlineKind(null);
    setInlineName('');
    setDuplicateExistingId(null);
    setError(null);
    setShowUsedIn(false);
    try {
      const full = await adminGet<FlowerItemAdminDto>(adminEndpoints.flowerItem(id));
      setEditing(full);
      setDraft(draftFromItem(full));
      setUsedIn(full.usedIn ?? []);
    } catch {
      setUsedIn([]);
    }
  }

  function closeEditor() {
    setMode('list');
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setUsedIn([]);
    setShowUsedIn(false);
    setInlineKind(null);
  }

  function setTypeAndResetChildren(flowerTypeId: string) {
    setDraft((prev) => ({
      ...prev,
      flowerTypeId,
      flowerFormId: '',
      flowerVarietyId: '',
    }));
  }

  async function submitFlower() {
    if (!draft.flowerTypeId) {
      setError('Выберите вид цветка');
      setPhase('server');
      return;
    }
    const stemRaw = draft.stemLengthCm.trim();
    const stemLengthCm = stemRaw ? Number(stemRaw) : null;
    if (stemRaw && (!Number.isFinite(stemLengthCm) || stemLengthCm! < 1 || stemLengthCm! > 300)) {
      setError('Высота стебля должна быть от 1 до 300 см');
      setPhase('server');
      return;
    }

    const payload = {
      flowerTypeId: draft.flowerTypeId,
      flowerFormId: draft.flowerFormId || null,
      flowerVarietyId: draft.flowerVarietyId || null,
      flowerOriginId: draft.flowerOriginId || null,
      stemLengthCm,
    };

    if (mode === 'create') {
      await run(async () => {
        await adminPost(adminEndpoints.flowerItems, payload);
        closeEditor();
      }, `Создан: ${canonicalPreview}`);
      return;
    }

    if (!editing) return;
    await run(async () => {
      const updated = await adminPatch<FlowerItemAdminDto>(adminEndpoints.flowerItem(editing.id), {
        expectedVersion: editing.version,
        ...payload,
      });
      setEditing(updated);
      setDraft(draftFromItem(updated));
    }, `Сохранено: ${canonicalPreview}`);
  }

  async function createInline() {
    const name = inlineName.trim();
    if (!name || !inlineKind) return;

    await run(async () => {
      if (inlineKind === 'type') {
        const created = await adminPost<FlowerTypeAdminDto>(adminEndpoints.flowerTypes, {
          name,
          sortOrder: (types.at(-1)?.sortOrder ?? 0) + 10,
        });
        setDraft((prev) => ({
          ...prev,
          flowerTypeId: created.id,
          flowerFormId: '',
          flowerVarietyId: '',
        }));
      } else if (inlineKind === 'form') {
        if (!draft.flowerTypeId) throw new Error('Сначала выберите вид');
        const created = await adminPost<FlowerFormAdminDto>(adminEndpoints.flowerForms, {
          flowerTypeId: draft.flowerTypeId,
          name,
          sortOrder: (forms.at(-1)?.sortOrder ?? 0) + 10,
        });
        setDraft((prev) => ({ ...prev, flowerFormId: created.id }));
      } else if (inlineKind === 'variety') {
        if (!draft.flowerTypeId) throw new Error('Сначала выберите вид');
        const created = await adminPost<FlowerVarietyAdminDto>(adminEndpoints.flowerVarieties, {
          flowerTypeId: draft.flowerTypeId,
          name,
          sortOrder: (varieties.at(-1)?.sortOrder ?? 0) + 10,
        });
        setDraft((prev) => ({ ...prev, flowerVarietyId: created.id }));
      } else if (inlineKind === 'origin') {
        const created = await adminPost<FlowerOriginAdminDto>(adminEndpoints.flowerOrigins, {
          name,
          sortOrder: (origins.at(-1)?.sortOrder ?? 0) + 10,
        });
        setDraft((prev) => ({ ...prev, flowerOriginId: created.id }));
      }
      setInlineKind(null);
      setInlineName('');
    }, `Добавлено: ${name}`);
  }

  // Keep filter form/variety coherent when type filter changes.
  useEffect(() => {
    if (filterFormId && !filterForms.some((f) => f.id === filterFormId)) {
      setFilterFormId('');
    }
    if (filterVarietyId && !filterVarieties.some((v) => v.id === filterVarietyId)) {
      setFilterVarietyId('');
    }
  }, [filterFormId, filterForms, filterVarietyId, filterVarieties]);

  if (mode === 'create' || mode === 'edit') {
    return (
      <div className="space-y-6">
        <FormSaveStatus
          phase={phase}
          savedLabel={notice}
          errorMessage={error}
          requestId={requestId}
          onRefresh={() => void reload()}
          onDismiss={() => {
            setError(null);
            setDuplicateExistingId(null);
            setPhase(notice ? 'saved' : 'idle');
          }}
        />

        {duplicateExistingId ? (
          <p className="text-sm">
            <button
              type="button"
              className="admin-btn-ghost underline"
              onClick={() => {
                void openEditById(duplicateExistingId);
              }}
            >
              Открыть существующий цветок
            </button>
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="admin-section__title">
            {mode === 'create' ? 'Добавить цветок' : canonicalPreview || editing?.name || 'Цветок'}
          </h2>
          <button type="button" className="admin-btn-ghost" onClick={closeEditor} disabled={pending}>
            ← К списку
          </button>
        </div>

        <div className="admin-panel grid max-w-xl gap-4 p-4">
          <label className="admin-field">
            <span>Вид</span>
            <select
              className="admin-select"
              value={draft.flowerTypeId}
              disabled={pending}
              onChange={(e) => setTypeAndResetChildren(e.target.value)}
            >
              <option value="">Выберите вид</option>
              {types
                .filter((t) => t.visibility === 'VISIBLE' || t.id === draft.flowerTypeId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
            {canCreate ? (
              <button
                type="button"
                className="admin-btn-ghost mt-1 text-xs"
                onClick={() => {
                  setInlineKind('type');
                  setInlineName('');
                }}
              >
                + Добавить вид
              </button>
            ) : null}
          </label>

          <label className="admin-field">
            <span>Форма / тип</span>
            <select
              className="admin-select"
              value={draft.flowerFormId}
              disabled={pending || !draft.flowerTypeId}
              onChange={(e) => setDraft((prev) => ({ ...prev, flowerFormId: e.target.value }))}
            >
              <option value="">Не указана</option>
              {draftForms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            {canCreate && draft.flowerTypeId ? (
              <button
                type="button"
                className="admin-btn-ghost mt-1 text-xs"
                onClick={() => {
                  setInlineKind('form');
                  setInlineName('');
                }}
              >
                + Добавить форму
              </button>
            ) : null}
          </label>

          <label className="admin-field">
            <span>Сорт</span>
            <select
              className="admin-select"
              value={draft.flowerVarietyId}
              disabled={pending || !draft.flowerTypeId}
              onChange={(e) => setDraft((prev) => ({ ...prev, flowerVarietyId: e.target.value }))}
            >
              <option value="">Не указан</option>
              {draftVarieties.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            {canCreate && draft.flowerTypeId ? (
              <button
                type="button"
                className="admin-btn-ghost mt-1 text-xs"
                onClick={() => {
                  setInlineKind('variety');
                  setInlineName('');
                }}
              >
                + Добавить сорт
              </button>
            ) : null}
          </label>

          <label className="admin-field">
            <span>Происхождение</span>
            <select
              className="admin-select"
              value={draft.flowerOriginId}
              disabled={pending}
              onChange={(e) => setDraft((prev) => ({ ...prev, flowerOriginId: e.target.value }))}
            >
              <option value="">Не указано</option>
              {origins
                .filter((o) => o.visibility === 'VISIBLE' || o.id === draft.flowerOriginId)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
            </select>
            {canCreate ? (
              <button
                type="button"
                className="admin-btn-ghost mt-1 text-xs"
                onClick={() => {
                  setInlineKind('origin');
                  setInlineName('');
                }}
              >
                + Добавить происхождение
              </button>
            ) : null}
          </label>

          <label className="admin-field">
            <span>Высота стебля</span>
            <div className="flex items-center gap-2">
              <input
                className="admin-input w-28"
                type="number"
                min={1}
                max={300}
                value={draft.stemLengthCm}
                disabled={pending}
                placeholder="не обяз."
                onChange={(e) => setDraft((prev) => ({ ...prev, stemLengthCm: e.target.value }))}
              />
              <span className="text-sm text-[var(--admin-muted)]">см</span>
            </div>
          </label>

          {inlineKind ? (
            <div className="admin-panel space-y-2 border border-[var(--admin-border)] p-3">
              <p className="text-sm font-medium">
                {inlineKind === 'type'
                  ? 'Новый вид'
                  : inlineKind === 'form'
                    ? 'Новая форма'
                    : inlineKind === 'variety'
                      ? 'Новый сорт'
                      : 'Новое происхождение'}
              </p>
              <input
                className="admin-input"
                value={inlineName}
                autoFocus
                placeholder="Название"
                disabled={pending}
                onChange={(e) => setInlineName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void createInline();
                  }
                }}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  className="admin-btn"
                  disabled={pending || !inlineName.trim()}
                  onClick={() => void createInline()}
                >
                  Создать
                </button>
                <button
                  type="button"
                  className="admin-btn-ghost"
                  disabled={pending}
                  onClick={() => {
                    setInlineKind(null);
                    setInlineName('');
                  }}
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : null}

          <div className="rounded-md bg-[var(--admin-surface-muted,transparent)] p-3">
            <p className="text-xs text-[var(--admin-muted)]">Название</p>
            <p className="text-base font-semibold">
              {canonicalPreview || 'Выберите вид, чтобы увидеть название'}
            </p>
            <p className="mt-1 text-xs text-[var(--admin-muted)]">
              Собирается автоматически. Форма в название не входит (только фильтр/классификация).
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="admin-btn"
              disabled={pending || !draft.flowerTypeId || (!canCreate && mode === 'create')}
              onClick={() => void submitFlower()}
            >
              {mode === 'create' ? 'Создать цветок' : 'Сохранить'}
            </button>
            <button type="button" className="admin-btn-ghost" disabled={pending} onClick={closeEditor}>
              Отмена
            </button>
          </div>
        </div>

        {mode === 'edit' && editing ? (
          <div className="admin-panel max-w-xl space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span>
                Используется в:{' '}
                <strong>{countLabel(editing.componentsCount)}</strong>
              </span>
              {editing.componentsCount > 0 ? (
                <button
                  type="button"
                  className="admin-btn-ghost text-xs"
                  onClick={() => setShowUsedIn((v) => !v)}
                >
                  {showUsedIn ? 'Скрыть список' : 'Показать товары'}
                </button>
              ) : null}
              {editing.visibility === 'HIDDEN' ? (
                <span className="admin-chip">Архив</span>
              ) : null}
            </div>

            {showUsedIn && usedIn && usedIn.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {usedIn.map((row) => (
                  <li key={row.productId}>
                    <Link
                      href={`/admin/catalog/products/${row.productId}`}
                      className="text-[var(--admin-brand)] underline-offset-2 hover:underline"
                    >
                      {row.productName}
                    </Link>
                    {row.quantity != null ? (
                      <span className="text-[var(--admin-muted)]"> × {row.quantity}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            {canUpdate ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="admin-btn-ghost"
                  disabled={pending}
                  onClick={() =>
                    void run(async () => {
                      const updated = await adminPatch<FlowerItemAdminDto>(
                        adminEndpoints.flowerItem(editing.id),
                        {
                          expectedVersion: editing.version,
                          visibility: editing.visibility === 'VISIBLE' ? 'HIDDEN' : 'VISIBLE',
                        },
                      );
                      setEditing(updated);
                    }, editing.visibility === 'VISIBLE' ? 'В архиве' : 'Восстановлен')
                  }
                >
                  {editing.visibility === 'VISIBLE' ? 'Архивировать' : 'Восстановить'}
                </button>
                {editing.componentsCount === 0 ? (
                  <button
                    type="button"
                    className="admin-btn-ghost text-[var(--admin-danger)]"
                    disabled={pending}
                    onClick={() =>
                      void run(async () => {
                        await adminDelete(adminEndpoints.flowerItem(editing.id), {
                          expectedVersion: editing.version,
                        });
                        closeEditor();
                      }, 'Цветок удалён')
                    }
                  >
                    Удалить
                  </button>
                ) : (
                  <p className="text-xs text-[var(--admin-muted)]">
                    Нельзя удалить: используется в {countLabel(editing.componentsCount)}. Можно
                    архивировать.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
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

      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="admin-field min-w-[16rem] flex-1">
          <span>Поиск</span>
          <input
            className="admin-input"
            value={search}
            placeholder="Название, вид, сорт, происхождение…"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {canCreate ? (
          <button type="button" className="admin-btn" onClick={openCreate}>
            + Добавить цветок
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="admin-field">
          <span>Вид</span>
          <select
            className="admin-select w-40"
            value={filterTypeId}
            onChange={(e) => setFilterTypeId(e.target.value)}
          >
            <option value="">Все</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          <span>Форма</span>
          <select
            className="admin-select w-40"
            value={filterFormId}
            onChange={(e) => setFilterFormId(e.target.value)}
          >
            <option value="">Все</option>
            {filterForms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          <span>Сорт</span>
          <select
            className="admin-select w-40"
            value={filterVarietyId}
            onChange={(e) => setFilterVarietyId(e.target.value)}
          >
            <option value="">Все</option>
            {filterVarieties.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          <span>Происхождение</span>
          <select
            className="admin-select w-40"
            value={filterOriginId}
            onChange={(e) => setFilterOriginId(e.target.value)}
          >
            <option value="">Все</option>
            {origins.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          <span>Статус</span>
          <select
            className="admin-select w-36"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'ALL' | 'VISIBLE' | 'HIDDEN')}
          >
            <option value="ALL">Все</option>
            <option value="VISIBLE">Активен</option>
            <option value="HIDDEN">Архив</option>
          </select>
        </label>
      </div>

      <div className="admin-panel overflow-x-auto">
        <table className="admin-table min-w-[880px]">
          <thead>
            <tr>
              <th>Цветок</th>
              <th>Вид</th>
              <th>Форма</th>
              <th>Сорт</th>
              <th>Происхождение</th>
              <th>Высота</th>
              <th>Товаров</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <p className="admin-empty">
                    {listLoading
                      ? 'Загрузка…'
                      : total === 0 && !debouncedSearch && !filterTypeId
                        ? 'Пока нет цветов. Нажмите «+ Добавить цветок».'
                        : 'Ничего не найдено по фильтрам.'}
                  </p>
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <button
                      type="button"
                      className="text-left font-medium text-[var(--admin-brand)] underline-offset-2 hover:underline"
                      onClick={() => void openEdit(item)}
                    >
                      {item.name}
                    </button>
                  </td>
                  <td className="text-sm">{item.flowerType.name}</td>
                  <td className="text-sm">{item.flowerForm?.name ?? '—'}</td>
                  <td className="text-sm">{item.flowerVariety?.name ?? '—'}</td>
                  <td className="text-sm">{item.flowerOrigin?.name ?? '—'}</td>
                  <td className="text-sm tabular-nums">
                    {item.stemLengthCm != null ? `${item.stemLengthCm} см` : '—'}
                  </td>
                  <td className="text-sm tabular-nums">{item.componentsCount}</td>
                  <td className="text-sm">
                    {item.visibility === 'HIDDEN' ? (
                      <span className="admin-chip">Архив</span>
                    ) : (
                      'Активен'
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--admin-muted)]">
          {listLoading ? 'Загрузка…' : `Показано ${items.length} из ${total}.`} Количество в составе
          задаётся в карточке товара, не здесь.
        </p>
        {Math.ceil(total / pageSize) > 1 ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="admin-btn-ghost"
              disabled={listLoading || page <= 1}
              onClick={() => void loadItemsPage(page - 1)}
            >
              ←
            </button>
            <span className="text-sm tabular-nums">
              {page} / {Math.max(1, Math.ceil(total / pageSize))}
            </span>
            <button
              type="button"
              className="admin-btn-ghost"
              disabled={listLoading || page >= Math.ceil(total / pageSize)}
              onClick={() => void loadItemsPage(page + 1)}
            >
              →
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

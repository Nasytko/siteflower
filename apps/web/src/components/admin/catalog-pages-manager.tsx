'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  PRIMARY_PRODUCT_KINDS,
  type CatalogPageDeleteImpactDto,
  type CatalogPageDto,
  type CatalogPageKind,
  type CatalogPageProductMatchDto,
  type FlowerTypeAdminDto,
  type PaginatedResponse,
  type ProductKind,
  type ProductListItemDto,
  type ProductTraitDefinitionDto,
} from '@bouquet-one/contracts';
import { FormSaveStatus, type FormSavePhase } from '@/components/admin/form-status';
import { adminDelete, adminGet, adminPatch, adminPost, errorMessage } from '@/lib/admin-client';
import { adminEndpoints, withQuery } from '@/lib/admin-endpoints';
import { productKindLabel } from '@/lib/admin-labels';
import { isMajorInputValid, majorInputToMinor, minorToMajorInput } from '@/lib/admin-money';

type Props = {
  canCreate: boolean;
  canUpdate: boolean;
  canPublish: boolean;
};

type EditorMode = 'closed' | 'create' | 'edit' | 'view-system';

/** How flower type participates — manager-facing labels. */
type FlowerMatchMode = '' | 'contains' | 'only';

type RulesDraft = {
  productKind: '' | ProductKind;
  flowerTypeId: string;
  flowerMatchMode: FlowerMatchMode;
  compositionKind: '' | 'MONO' | 'MIXED';
  authorial: boolean;
  minMajor: string;
  maxMajor: string;
};

type PageDraft = {
  name: string;
  slug: string;
  h1: string;
  seoTitle: string;
  seoDescription: string;
  body: string;
  rules: RulesDraft;
};

function emptyRules(): RulesDraft {
  return {
    productKind: 'BOUQUET',
    flowerTypeId: '',
    flowerMatchMode: '',
    compositionKind: '',
    authorial: false,
    minMajor: '',
    maxMajor: '',
  };
}

function emptyDraft(): PageDraft {
  return {
    name: '',
    slug: '',
    h1: '',
    seoTitle: '',
    seoDescription: '',
    body: '',
    rules: emptyRules(),
  };
}

function firstString(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0].trim();
  return '';
}

function rulesFromPage(page: CatalogPageDto, flowerTypes: FlowerTypeAdminDto[]): RulesDraft {
  const rules = page.rules ?? {};
  const productKinds = Array.isArray(rules.productKinds) ? rules.productKinds : [];
  const firstKind = typeof productKinds[0] === 'string' ? productKinds[0] : '';
  const composition = Array.isArray(rules.compositionKinds) ? rules.compositionKinds : [];
  const compositionType =
    typeof rules.compositionType === 'string' ? rules.compositionType : '';
  const compositionKindRaw = firstString(composition[0] ?? compositionType);
  const compositionKind =
    compositionKindRaw === 'MONO' || compositionKindRaw === 'MIXED' ? compositionKindRaw : '';

  const traitKeys = Array.isArray(rules.traitKeys) ? rules.traitKeys : [];
  const authorial = traitKeys.includes('AUTHORIAL');

  const onlySlug =
    firstString(rules.onlyFlowerType) || firstString(rules.onlyFlowerTypeSlugs);
  const onlyId = firstString(rules.onlyFlowerTypeIds);
  const containsSlug =
    firstString(rules.containsFlowerType) ||
    firstString(rules.containsFlowerTypeSlugs) ||
    firstString(rules.flowerTypeSlugs);
  const containsId = firstString(rules.flowerTypeIds);

  let flowerTypeId = '';
  let flowerMatchMode: FlowerMatchMode = '';
  if (onlyId || onlySlug) {
    flowerMatchMode = 'only';
    flowerTypeId =
      onlyId ||
      flowerTypes.find((t) => t.slug === onlySlug)?.id ||
      '';
  } else if (containsId || containsSlug) {
    flowerMatchMode = 'contains';
    flowerTypeId =
      containsId ||
      flowerTypes.find((t) => t.slug === containsSlug)?.id ||
      '';
  }

  return {
    productKind: (PRIMARY_PRODUCT_KINDS as readonly string[]).includes(firstKind)
      ? (firstKind as ProductKind)
      : firstKind
        ? (firstKind as ProductKind)
        : '',
    flowerTypeId,
    flowerMatchMode,
    compositionKind,
    authorial,
    minMajor: minorToMajorInput(
      typeof rules.minPriceMinor === 'string' ? rules.minPriceMinor : null,
    ),
    maxMajor: minorToMajorInput(
      typeof rules.maxPriceMinor === 'string' ? rules.maxPriceMinor : null,
    ),
  };
}

function draftFromPage(page: CatalogPageDto, flowerTypes: FlowerTypeAdminDto[]): PageDraft {
  return {
    name: page.name,
    slug: page.slug,
    h1: page.h1 ?? page.name,
    seoTitle: page.seoTitle ?? '',
    seoDescription: page.seoDescription ?? '',
    body: page.body ?? '',
    rules: rulesFromPage(page, flowerTypes),
  };
}

function buildRulesPayload(
  rules: RulesDraft,
  _flowerTypes: FlowerTypeAdminDto[],
): Record<string, unknown> {
  if (!isMajorInputValid(rules.minMajor) || !isMajorInputValid(rules.maxMajor)) {
    throw new Error('Цена указывается в BYN, например 150 или 150,50');
  }
  const payload: Record<string, unknown> = {};
  if (rules.productKind) payload.productKinds = [rules.productKind];

  // Persist stable IDs (page URL slug must never be used as FlowerType identity).
  // Slug aliases remain only as transitional dual-read on the server.
  if (rules.flowerTypeId) {
    if (rules.flowerMatchMode === 'only') {
      payload.onlyFlowerTypeIds = [rules.flowerTypeId];
    } else if (rules.flowerMatchMode === 'contains') {
      payload.flowerTypeIds = [rules.flowerTypeId];
    }
  }

  if (rules.compositionKind) {
    payload.compositionKinds = [rules.compositionKind];
  }
  if (rules.authorial) {
    payload.traitKeys = ['AUTHORIAL'];
  }

  const minMinor = majorInputToMinor(rules.minMajor);
  const maxMinor = majorInputToMinor(rules.maxMajor);
  if (minMinor) payload.minPriceMinor = minMinor;
  if (maxMinor) payload.maxPriceMinor = maxMinor;
  return payload;
}

/** Live human sentence for the rule constructor. */
function describeRulesDraft(
  rules: RulesDraft,
  flowerTypes: FlowerTypeAdminDto[],
): string {
  const parts: string[] = ['Показывать опубликованные'];
  if (rules.productKind) {
    const label = productKindLabel(rules.productKind).toLowerCase();
    if (rules.productKind === 'BOUQUET') parts.push('букеты');
    else if (rules.productKind === 'COMPOSITION') parts.push('композиции');
    else if (rules.productKind === 'STEM') parts.push('цветы поштучно');
    else if (rules.productKind === 'GIFT') parts.push('подарки');
    else parts.push(label);
  } else {
    parts.push('товары');
  }

  const flower = flowerTypes.find((t) => t.id === rules.flowerTypeId);
  if (flower && rules.flowerMatchMode === 'only') {
    parts.push(`, состоящие только из «${flower.name}»`);
    parts.push(' (другие основные цветы не допускаются, зелень — можно)');
  } else if (flower && rules.flowerMatchMode === 'contains') {
    parts.push(`, в составе которых есть «${flower.name}»`);
  }

  if (rules.compositionKind === 'MONO') {
    parts.push(', монобукеты (один основной вид)');
  } else if (rules.compositionKind === 'MIXED') {
    parts.push(', смешанные (два и более основных вида)');
  }

  if (rules.authorial) parts.push(', с признаком «Авторский»');
  if (rules.minMajor.trim()) parts.push(`, цена от ${rules.minMajor.trim()} BYN`);
  if (rules.maxMajor.trim()) parts.push(`, цена до ${rules.maxMajor.trim()} BYN`);

  return parts.join('').replace(/\s+,/g, ',') + '.';
}

function humanRulesSummary(
  page: CatalogPageDto,
  flowerTypes: FlowerTypeAdminDto[],
): string {
  if (page.pageKind === 'SYSTEM_HUB') {
    return `Все товары типа «${page.name}»`;
  }
  if (page.pageKind === 'GIFT_SUBTYPE') {
    return 'Подтип подарка — выбирается в карточке товара';
  }
  return describeRulesDraft(rulesFromPage(page, flowerTypes), flowerTypes);
}

function kindLabel(kind: CatalogPageKind): string {
  switch (kind) {
    case 'SYSTEM_HUB':
      return 'Основной раздел';
    case 'THEMATIC':
      return 'Тематическая';
    case 'GIFT_SUBTYPE':
      return 'Подтип подарка';
    default:
      return kind;
  }
}

function statusLabel(page: CatalogPageDto): string {
  if (page.pageKind === 'SYSTEM_HUB') return 'Системный';
  if (page.status === 'PUBLISHED' || page.status === 'LIVE') return 'Опубликовано';
  if (page.status === 'ARCHIVED') return 'Архив';
  return 'Черновик';
}

export function CatalogPagesManager({ canCreate, canUpdate, canPublish }: Props) {
  const [pages, setPages] = useState<CatalogPageDto[]>([]);
  const [flowerTypes, setFlowerTypes] = useState<FlowerTypeAdminDto[]>([]);
  const [traits, setTraits] = useState<ProductTraitDefinitionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<FormSavePhase>('idle');
  const [q, setQ] = useState('');
  const [kindFilter, setKindFilter] = useState<'' | CatalogPageKind>('');
  const [statusFilter, setStatusFilter] = useState<'' | 'PUBLISHED' | 'DRAFT' | 'ARCHIVED'>('');
  const [mode, setMode] = useState<EditorMode>('closed');
  const [editing, setEditing] = useState<CatalogPageDto | null>(null);
  const [draft, setDraft] = useState<PageDraft>(emptyDraft);
  const [previewItems, setPreviewItems] = useState<ProductListItemDto[]>([]);
  const [previewTotal, setPreviewTotal] = useState<number | null>(null);
  const [diagnoseProductId, setDiagnoseProductId] = useState('');
  const [diagnoseResult, setDiagnoseResult] = useState<CatalogPageProductMatchDto | null>(null);

  async function loadPages() {
    setLoading(true);
    setError(null);
    try {
      const data = await adminGet<CatalogPageDto[]>(
        withQuery(adminEndpoints.catalogPages, {
          q: q.trim() || undefined,
          pageKind: kindFilter || undefined,
          withCounts: '1',
        }),
      );
      setPages(data);
    } catch (err) {
      setError(errorMessage(err, 'Не удалось загрузить страницы'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPages();
    // reload when type filter changes
  }, [kindFilter]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      adminGet<FlowerTypeAdminDto[]>(adminEndpoints.flowerTypes),
      adminGet<ProductTraitDefinitionDto[]>(adminEndpoints.catalogPageTraits),
    ])
      .then(([types, traitDefs]) => {
        if (cancelled) return;
        setFlowerTypes(types);
        setTraits(traitDefs);
      })
      .catch(() => {
        if (!cancelled) {
          setFlowerTypes([]);
          setTraits([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hubs = useMemo(
    () => pages.filter((p) => p.pageKind === 'SYSTEM_HUB'),
    [pages],
  );
  const thematic = useMemo(() => {
    return pages.filter((p) => {
      if (p.pageKind === 'SYSTEM_HUB') return false;
      if (statusFilter === 'PUBLISHED') {
        return p.status === 'PUBLISHED' || p.status === 'LIVE';
      }
      if (statusFilter === 'DRAFT') {
        return p.status !== 'PUBLISHED' && p.status !== 'LIVE' && p.status !== 'ARCHIVED';
      }
      if (statusFilter === 'ARCHIVED') {
        return p.status === 'ARCHIVED';
      }
      return true;
    });
  }, [pages, statusFilter]);

  const rulesPreview = useMemo(
    () => describeRulesDraft(draft.rules, flowerTypes),
    [draft.rules, flowerTypes],
  );

  function openCreate() {
    setMode('create');
    setEditing(null);
    setDraft(emptyDraft());
    setPhase('idle');
  }

  function openEdit(page: CatalogPageDto) {
    if (page.isSystem || page.pageKind === 'SYSTEM_HUB') {
      setMode('view-system');
      setEditing(page);
      setDraft(draftFromPage(page, flowerTypes));
      setPhase('idle');
      return;
    }
    setMode('edit');
    setEditing(page);
    setDraft(draftFromPage(page, flowerTypes));
    setPhase('idle');
  }

  function closeEditor() {
    setMode('closed');
    setEditing(null);
    setDraft(emptyDraft());
  }

  function setRules(patch: Partial<RulesDraft>) {
    setDraft((prev) => ({ ...prev, rules: { ...prev.rules, ...patch } }));
  }

  async function save() {
    if (!canUpdate && mode !== 'create') return;
    if (mode === 'create' && !canCreate) return;
    if (!draft.name.trim()) {
      setError('Укажите название страницы');
      setPhase('validation');
      return;
    }
    let rules: Record<string, unknown>;
    try {
      rules = buildRulesPayload(draft.rules, flowerTypes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Проверьте правила');
      setPhase('validation');
      return;
    }
    if (Object.keys(rules).length === 0) {
      setError('Укажите хотя бы тип товара или другое условие подбора');
      setPhase('validation');
      return;
    }

    setPhase('saving');
    setError(null);
    try {
      if (mode === 'edit' && editing) {
        const updated = await adminPatch<CatalogPageDto>(adminEndpoints.catalogPage(editing.id), {
          expectedVersion: editing.version,
          name: draft.name.trim(),
          slug: draft.slug.trim() || undefined,
          h1: draft.h1.trim() || draft.name.trim(),
          seoTitle: draft.seoTitle.trim() || null,
          seoDescription: draft.seoDescription.trim() || null,
          body: draft.body.trim() || null,
          rules,
        });
        setEditing(updated);
        setDraft(draftFromPage(updated, flowerTypes));
      } else {
        const created = await adminPost<CatalogPageDto>(adminEndpoints.catalogPages, {
          name: draft.name.trim(),
          slug: draft.slug.trim() || undefined,
          h1: draft.h1.trim() || draft.name.trim(),
          seoTitle: draft.seoTitle.trim() || null,
          seoDescription: draft.seoDescription.trim() || null,
          body: draft.body.trim() || null,
          rules,
        });
        setEditing(created);
        setDraft(draftFromPage(created, flowerTypes));
        setMode('edit');
      }
      setPhase('saved');
      await loadPages();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось сохранить'));
      setPhase('server');
    }
  }

  async function publish() {
    if (!editing || !canPublish || editing.isSystem) return;
    setPhase('saving');
    setError(null);
    try {
      const updated = await adminPost<CatalogPageDto>(
        adminEndpoints.catalogPagePublish(editing.id),
        { expectedVersion: editing.version },
      );
      setEditing(updated);
      setDraft(draftFromPage(updated, flowerTypes));
      setPhase('saved');
      await loadPages();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось опубликовать'));
      setPhase('server');
    }
  }

  async function unpublish() {
    if (!editing || !canPublish || editing.isSystem) return;
    setPhase('saving');
    setError(null);
    try {
      const updated = await adminPost<CatalogPageDto>(
        adminEndpoints.catalogPageUnpublish(editing.id),
        { expectedVersion: editing.version },
      );
      setEditing(updated);
      setDraft(draftFromPage(updated, flowerTypes));
      setPhase('saved');
      await loadPages();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось снять с публикации'));
      setPhase('server');
    }
  }

  async function previewRules() {
    setPhase('saving');
    setError(null);
    try {
      const rules = buildRulesPayload(draft.rules, flowerTypes);
      const payload = await adminPost<
        PaginatedResponse<ProductListItemDto> & { blocking?: boolean }
      >(adminEndpoints.catalogPagePreviewRules, {
        rules,
        page: 1,
        pageSize: 12,
      });
      setPreviewItems(payload.items);
      setPreviewTotal(payload.total);
      if (payload.blocking) {
        setError('Правила ссылаются на неизвестный справочник — выдача пустая');
      }
      setPhase('idle');
    } catch (err) {
      setError(errorMessage(err, 'Не удалось выполнить предпросмотр'));
      setPhase('server');
    }
  }

  async function diagnoseProduct() {
    if (!editing) return;
    const id = diagnoseProductId.trim();
    if (!id) {
      setError('Укажите UUID товара для проверки');
      return;
    }
    setPhase('saving');
    setError(null);
    try {
      const result = await adminGet<CatalogPageProductMatchDto>(
        adminEndpoints.catalogPageProductMatch(editing.id, id),
      );
      setDiagnoseResult(result);
      setPhase('idle');
    } catch (err) {
      setDiagnoseResult(null);
      setError(errorMessage(err, 'Не удалось проверить товар'));
      setPhase('server');
    }
  }

  async function removePage() {
    if (!editing || !canUpdate || editing.isSystem) return;
    setPhase('saving');
    setError(null);
    try {
      const impact = await adminGet<CatalogPageDeleteImpactDto>(
        adminEndpoints.catalogPageDeleteImpact(editing.id),
      );
      if (!impact.canDelete) {
        setError(impact.blockers.map((row) => row.message).join(' '));
        setPhase('server');
        return;
      }
      if (!window.confirm(`Удалить страницу «${editing.name}»? Адрес больше не будет открываться.`)) {
        setPhase('idle');
        return;
      }
      await adminDelete(adminEndpoints.catalogPage(editing.id), {
        expectedVersion: editing.version,
      });
      closeEditor();
      setPhase('saved');
      await loadPages();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось удалить страницу'));
      setPhase('server');
    }
  }

  const showEditor = mode !== 'closed';
  const editable = mode === 'create' || (mode === 'edit' && !editing?.isSystem);
  const authorialTrait = traits.find((t) => t.key === 'AUTHORIAL');

  return (
    <div className="space-y-6">
      <FormSaveStatus phase={phase} errorMessage={error} onDismiss={() => setError(null)} />

      <div className="flex flex-wrap items-end gap-3">
        <label className="admin-field min-w-[12rem] flex-1">
          <span>Поиск</span>
          <input
            className="admin-input"
            value={q}
            placeholder="Название или URL…"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void loadPages();
            }}
          />
        </label>
        <label className="admin-field">
          <span>Тип</span>
          <select
            className="admin-select"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as '' | CatalogPageKind)}
          >
            <option value="">Все</option>
            <option value="SYSTEM_HUB">Основные</option>
            <option value="THEMATIC">Тематические</option>
            <option value="GIFT_SUBTYPE">Подарки</option>
          </select>
        </label>
        <label className="admin-field">
          <span>Статус</span>
          <select
            className="admin-select"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as '' | 'PUBLISHED' | 'DRAFT' | 'ARCHIVED')
            }
          >
            <option value="">Все</option>
            <option value="PUBLISHED">Опубликовано</option>
            <option value="DRAFT">Черновики</option>
            <option value="ARCHIVED">Снятые с публикации</option>
          </select>
        </label>
        <button type="button" className="admin-btn-ghost" onClick={() => void loadPages()}>
          Найти
        </button>
        {canCreate ? (
          <button type="button" className="admin-btn" onClick={openCreate}>
            + Тематическая страница
          </button>
        ) : null}
      </div>

      {showEditor ? (
        <div className="admin-panel max-w-2xl space-y-5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">
                {mode === 'create'
                  ? 'Новая тематическая страница'
                  : mode === 'view-system'
                    ? `Основной раздел: ${editing?.name}`
                    : `Изменить: ${editing?.name}`}
              </h2>
              {mode === 'view-system' ? (
                <p className="mt-1 text-sm text-[var(--admin-muted)]">
                  Заполняется автоматически по типу товара. Правила здесь не настраиваются.
                </p>
              ) : (
                <p className="mt-1 text-sm text-[var(--admin-muted)]">
                  Сохраните черновик, проверьте товары, затем опубликуйте — страница появится на
                  сайте.
                </p>
              )}
            </div>
            <button type="button" className="admin-btn-ghost" onClick={closeEditor}>
              К списку
            </button>
          </div>

          {mode === 'view-system' && editing ? (
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-[var(--admin-muted)]">URL: </span>
                <a href={editing.publicPath} className="admin-link" target="_blank" rel="noreferrer">
                  {editing.publicPath}
                </a>
              </p>
              <p>
                <span className="text-[var(--admin-muted)]">Товаров: </span>
                {editing.productsCount ?? '—'}
              </p>
              <p className="text-[var(--admin-muted)]">{humanRulesSummary(editing, flowerTypes)}</p>
            </div>
          ) : (
            <>
              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--admin-muted)]">
                  Основное
                </h3>
                <label className="admin-field">
                  <span>Название</span>
                  <input
                    className="admin-input"
                    value={draft.name}
                    disabled={!editable || (!canUpdate && mode !== 'create')}
                    onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="admin-field">
                    <span>Адрес страницы</span>
                    <input
                      className="admin-input"
                      value={draft.slug}
                      placeholder="bukety-s-rozami"
                      disabled={!editable || (!canUpdate && mode !== 'create')}
                      onChange={(e) => setDraft((p) => ({ ...p, slug: e.target.value }))}
                    />
                    <span className="admin-field__hint">Будет /catalog/…</span>
                  </label>
                  <label className="admin-field">
                    <span>Заголовок H1</span>
                    <input
                      className="admin-input"
                      value={draft.h1}
                      disabled={!editable || (!canUpdate && mode !== 'create')}
                      onChange={(e) => setDraft((p) => ({ ...p, h1: e.target.value }))}
                    />
                  </label>
                </div>
              </section>

              <section className="space-y-3 rounded-md border border-[var(--admin-border)] p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--admin-muted)]">
                  Какие товары показывать
                </h3>
                <p className="rounded-md bg-[var(--admin-surface-muted,rgba(0,0,0,0.04))] px-3 py-2 text-sm">
                  {rulesPreview}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="admin-field">
                    <span>Тип товара</span>
                    <select
                      className="admin-select"
                      value={draft.rules.productKind}
                      disabled={!editable || (!canUpdate && mode !== 'create')}
                      onChange={(e) =>
                        setRules({
                          productKind: e.target.value as RulesDraft['productKind'],
                        })
                      }
                    >
                      <option value="">Любой</option>
                      {PRIMARY_PRODUCT_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {productKindLabel(kind)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="admin-field">
                    <span>Вид цветка</span>
                    <select
                      className="admin-select"
                      value={draft.rules.flowerTypeId}
                      disabled={!editable || (!canUpdate && mode !== 'create')}
                      onChange={(e) => {
                        const id = e.target.value;
                        setRules({
                          flowerTypeId: id,
                          flowerMatchMode: id
                            ? draft.rules.flowerMatchMode || 'contains'
                            : '',
                        });
                      }}
                    >
                      <option value="">Не важно</option>
                      {flowerTypes.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="admin-field sm:col-span-2">
                    <span>Как учитывать цветок</span>
                    <select
                      className="admin-select"
                      value={draft.rules.flowerMatchMode}
                      disabled={
                        !draft.rules.flowerTypeId ||
                        !editable ||
                        (!canUpdate && mode !== 'create')
                      }
                      onChange={(e) =>
                        setRules({
                          flowerMatchMode: e.target.value as FlowerMatchMode,
                        })
                      }
                    >
                      <option value="contains">С этим цветком (могут быть и другие)</option>
                      <option value="only">
                        Только из этого цветка («из роз» — зелень допускается)
                      </option>
                    </select>
                  </label>
                  <label className="admin-field">
                    <span>Состав букета</span>
                    <select
                      className="admin-select"
                      value={draft.rules.compositionKind}
                      disabled={!editable || (!canUpdate && mode !== 'create')}
                      onChange={(e) =>
                        setRules({
                          compositionKind: e.target.value as RulesDraft['compositionKind'],
                        })
                      }
                    >
                      <option value="">Не важно</option>
                      <option value="MONO">Только монобукеты</option>
                      <option value="MIXED">Только смешанные</option>
                    </select>
                  </label>
                  <label className="admin-field">
                    <span className="inline-flex items-center gap-2 pt-6">
                      <input
                        type="checkbox"
                        checked={draft.rules.authorial}
                        disabled={!editable || (!canUpdate && mode !== 'create')}
                        onChange={(e) => setRules({ authorial: e.target.checked })}
                      />
                      {authorialTrait?.name ?? 'Авторский'}
                    </span>
                    {authorialTrait?.description ? (
                      <span className="admin-field__hint">{authorialTrait.description}</span>
                    ) : null}
                  </label>
                  <label className="admin-field">
                    <span>Цена от, BYN</span>
                    <input
                      className="admin-input"
                      value={draft.rules.minMajor}
                      placeholder="0"
                      disabled={!editable || (!canUpdate && mode !== 'create')}
                      onChange={(e) => setRules({ minMajor: e.target.value })}
                    />
                  </label>
                  <label className="admin-field">
                    <span>Цена до, BYN</span>
                    <input
                      className="admin-input"
                      value={draft.rules.maxMajor}
                      placeholder="100"
                      disabled={!editable || (!canUpdate && mode !== 'create')}
                      onChange={(e) => setRules({ maxMajor: e.target.value })}
                    />
                  </label>
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--admin-muted)]">
                  Предпросмотр и диагностика
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    disabled={phase === 'saving'}
                    onClick={() => void previewRules()}
                  >
                    Показать подходящие товары
                  </button>
                  {previewTotal != null ? (
                    <span className="text-sm text-[var(--admin-muted)]">
                      Найдено: {previewTotal}
                    </span>
                  ) : null}
                </div>
                {previewItems.length > 0 ? (
                  <ul className="space-y-1 text-sm">
                    {previewItems.map((item) => (
                      <li key={item.id}>
                        {item.name}{' '}
                        <span className="text-[var(--admin-muted)]">({item.slug})</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {editing && !editing.isSystem ? (
                  <div className="space-y-2 rounded border border-[var(--admin-border)] p-3">
                    <p className="text-sm text-[var(--admin-muted)]">
                      Почему товар не на этой странице?
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <input
                        className="admin-input min-w-[16rem] flex-1"
                        placeholder="UUID товара"
                        value={diagnoseProductId}
                        onChange={(e) => setDiagnoseProductId(e.target.value)}
                      />
                      <button
                        type="button"
                        className="admin-btn-ghost"
                        disabled={phase === 'saving'}
                        onClick={() => void diagnoseProduct()}
                      >
                        Проверить
                      </button>
                    </div>
                    {diagnoseResult ? (
                      <ul className="space-y-1 text-sm">
                        <li>
                          {diagnoseResult.matches
                            ? diagnoseResult.publishedMatches
                              ? 'Попадает в выдачу'
                              : 'Соответствует правилам, но не опубликован'
                            : 'Не попадает на страницу'}
                        </li>
                        {diagnoseResult.reasons.map((reason) => (
                          <li key={`${reason.code}-${reason.message}`}>{reason.message}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </section>

              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--admin-muted)]">
                  SEO
                </h3>
                <label className="admin-field">
                  <span>Title</span>
                  <input
                    className="admin-input"
                    value={draft.seoTitle}
                    disabled={!editable || (!canUpdate && mode !== 'create')}
                    onChange={(e) => setDraft((p) => ({ ...p, seoTitle: e.target.value }))}
                  />
                </label>
                <label className="admin-field">
                  <span>Description</span>
                  <textarea
                    className="admin-input"
                    rows={2}
                    value={draft.seoDescription}
                    disabled={!editable || (!canUpdate && mode !== 'create')}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, seoDescription: e.target.value }))
                    }
                  />
                </label>
                <label className="admin-field">
                  <span>Текст на странице</span>
                  <textarea
                    className="admin-input"
                    rows={4}
                    value={draft.body}
                    disabled={!editable || (!canUpdate && mode !== 'create')}
                    onChange={(e) => setDraft((p) => ({ ...p, body: e.target.value }))}
                  />
                </label>
              </section>

              <div className="flex flex-wrap items-center gap-2">
                {(canUpdate || (mode === 'create' && canCreate)) && editable ? (
                  <button
                    type="button"
                    className="admin-btn"
                    disabled={phase === 'saving'}
                    onClick={() => void save()}
                  >
                    Сохранить
                  </button>
                ) : null}
                {editing &&
                canPublish &&
                editable &&
                editing.status !== 'PUBLISHED' &&
                editing.status !== 'LIVE' ? (
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    disabled={phase === 'saving'}
                    onClick={() => void publish()}
                  >
                    Опубликовать
                  </button>
                ) : null}
                {editing && canPublish && editable && editing.status === 'PUBLISHED' ? (
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    disabled={phase === 'saving'}
                    onClick={() => void unpublish()}
                  >
                    Снять с публикации
                  </button>
                ) : null}
                {editing && canUpdate && editable && !editing.isSystem ? (
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    disabled={phase === 'saving'}
                    onClick={() => void removePage()}
                  >
                    Удалить
                  </button>
                ) : null}
                {editing?.status === 'LIVE' ? (
                  <span className="text-sm text-emerald-700">Системный раздел</span>
                ) : null}
                {editing?.productsCount != null ? (
                  <span className="text-sm text-[var(--admin-muted)]">
                    Сейчас подходит товаров: {editing.productsCount}
                  </span>
                ) : null}
              </div>
            </>
          )}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-[var(--admin-muted)]">Загрузка…</p>
      ) : pages.length === 0 ? (
        <div className="admin-panel space-y-3 p-6">
          <p className="font-medium">Пока нет страниц каталога</p>
          <p className="text-sm text-[var(--admin-muted)]">
            Основные разделы появятся после миграции. Создайте тематическую страницу — например
            «Букеты с розами».
          </p>
          {canCreate ? (
            <button type="button" className="admin-btn" onClick={openCreate}>
              Создать первую страницу
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-6">
          {hubs.length > 0 && !statusFilter ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--admin-muted)]">
                Основные разделы
              </h3>
              <p className="text-sm text-[var(--admin-muted)]">
                Задаются типом товара в карточке. Редактировать правила не нужно.
              </p>
              <PageTable
                pages={hubs}
                flowerTypes={flowerTypes}
                onEdit={openEdit}
                systemOnly
              />
            </section>
          ) : null}
          {thematic.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--admin-muted)]">
                Тематические страницы
              </h3>
              <p className="text-sm text-[var(--admin-muted)]">
                Черновики не видны покупателям. Опубликуйте страницу, когда правила и SEO готовы.
              </p>
              <PageTable pages={thematic} flowerTypes={flowerTypes} onEdit={openEdit} />
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function PageTable({
  pages,
  flowerTypes,
  onEdit,
  systemOnly,
}: {
  pages: CatalogPageDto[];
  flowerTypes: FlowerTypeAdminDto[];
  onEdit: (page: CatalogPageDto) => void;
  systemOnly?: boolean;
}) {
  return (
    <div className="admin-panel admin-table-wrap admin-table-wrap--cards">
      <table className="admin-table admin-table--compact">
        <thead>
          <tr>
            <th>Название</th>
            <th>Тип</th>
            <th>Правило</th>
            <th>Товаров</th>
            <th>Статус</th>
            <th>URL</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {pages.map((page) => (
            <tr key={page.id}>
              <td data-primary className="font-medium">{page.name}</td>
              <td data-label="Тип" className="text-sm">{kindLabel(page.pageKind)}</td>
              <td data-label="Правило" className="max-w-[16rem] text-xs text-[var(--admin-muted)]">
                {humanRulesSummary(page, flowerTypes)}
              </td>
              <td data-label="Товаров" className="text-sm tabular-nums">
                {page.productsCount == null ? '—' : page.productsCount}
              </td>
              <td data-label="Статус" className="text-sm">{statusLabel(page)}</td>
              <td data-label="URL" className="text-xs">
                <a href={page.publicPath} className="admin-link" target="_blank" rel="noreferrer">
                  {page.publicPath}
                </a>
              </td>
              <td data-label="Действия">
                <button
                  type="button"
                  className="admin-btn-ghost text-xs"
                  onClick={() => onEdit(page)}
                >
                  {systemOnly ? 'Подробнее' : 'Изменить'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

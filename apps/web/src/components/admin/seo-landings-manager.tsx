'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  ColorAdminDto,
  FlowerTypeAdminDto,
  PaginatedResponse,
  ProductListItemDto,
  SeoLandingPageDto,
  SeoLandingStatus,
  TaxonomyAdminDto,
} from '@bouquet-one/contracts';
import { Button } from '@bouquet-one/ui';
import { adminDelete, adminGet, adminPatch, adminPost, errorMessage } from '@/lib/admin-client';
import { adminEndpoints, withQuery } from '@/lib/admin-endpoints';
import { isMajorInputValid, majorInputToMinor, minorToMajorInput } from '@/lib/admin-money';

type Props = {
  initial: SeoLandingPageDto[];
  flowerTypes: FlowerTypeAdminDto[];
  colors: ColorAdminDto[];
  occasions: TaxonomyAdminDto[];
  canUpdate: boolean;
};

type RulesDraft = {
  flowerTypeId: string;
  colorId: string;
  occasionId: string;
  compositionKind: '' | 'MONO' | 'MIXED' | 'UNKNOWN';
  minMajor: string;
  maxMajor: string;
};

type EditorDraft = {
  title: string;
  h1: string;
  slug: string;
  seoTitle: string;
  seoDescription: string;
  body: string;
  noIndex: boolean;
  navVisible: boolean;
  sortOrder: string;
  pinnedProductIds: string;
  excludedProductIds: string;
  rules: RulesDraft;
};

const STATUS_LABEL: Record<SeoLandingStatus, string> = {
  DRAFT: 'Черновик',
  PUBLISHED: 'Опубликовано',
  ARCHIVED: 'Архив',
};

function emptyRules(): RulesDraft {
  return {
    flowerTypeId: '',
    colorId: '',
    occasionId: '',
    compositionKind: '',
    minMajor: '',
    maxMajor: '',
  };
}

function rulesFromLanding(landing: SeoLandingPageDto): RulesDraft {
  const rules = landing.rules ?? {};
  const flowerTypeIds = Array.isArray(rules.flowerTypeIds) ? rules.flowerTypeIds : [];
  const colorIds = Array.isArray(rules.colorIds) ? rules.colorIds : [];
  const occasionIds = Array.isArray(rules.occasionIds) ? rules.occasionIds : [];
  const kinds = Array.isArray(rules.compositionKinds) ? rules.compositionKinds : [];
  return {
    flowerTypeId: typeof flowerTypeIds[0] === 'string' ? flowerTypeIds[0] : '',
    colorId: typeof colorIds[0] === 'string' ? colorIds[0] : '',
    occasionId: typeof occasionIds[0] === 'string' ? occasionIds[0] : '',
    compositionKind:
      kinds[0] === 'MONO' || kinds[0] === 'MIXED' || kinds[0] === 'UNKNOWN' ? kinds[0] : '',
    minMajor: minorToMajorInput(
      typeof rules.minPriceMinor === 'string' ? rules.minPriceMinor : null,
    ),
    maxMajor: minorToMajorInput(
      typeof rules.maxPriceMinor === 'string' ? rules.maxPriceMinor : null,
    ),
  };
}

function draftFromLanding(landing: SeoLandingPageDto): EditorDraft {
  return {
    title: landing.title,
    h1: landing.h1,
    slug: landing.slug,
    seoTitle: landing.seoTitle ?? '',
    seoDescription: landing.seoDescription ?? '',
    body: landing.body ?? '',
    noIndex: landing.noIndex,
    navVisible: landing.navVisible,
    sortOrder: String(landing.sortOrder),
    pinnedProductIds: landing.pinnedProductIds.join('\n'),
    excludedProductIds: landing.excludedProductIds.join('\n'),
    rules: rulesFromLanding(landing),
  };
}

function emptyDraft(): EditorDraft {
  return {
    title: '',
    h1: '',
    slug: '',
    seoTitle: '',
    seoDescription: '',
    body: '',
    noIndex: false,
    navVisible: false,
    sortOrder: '0',
    pinnedProductIds: '',
    excludedProductIds: '',
    rules: emptyRules(),
  };
}

function parseIdList(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[\s,;]+/)
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
}

function buildRulesPayload(rules: RulesDraft): Record<string, unknown> {
  if (!isMajorInputValid(rules.minMajor) || !isMajorInputValid(rules.maxMajor)) {
    throw new Error('Цена указывается в BYN, например 150 или 150,50');
  }
  const payload: Record<string, unknown> = {};
  if (rules.flowerTypeId) payload.flowerTypeIds = [rules.flowerTypeId];
  if (rules.colorId) payload.colorIds = [rules.colorId];
  if (rules.occasionId) payload.occasionIds = [rules.occasionId];
  if (rules.compositionKind) payload.compositionKinds = [rules.compositionKind];
  const minMinor = majorInputToMinor(rules.minMajor);
  const maxMinor = majorInputToMinor(rules.maxMajor);
  if (minMinor) payload.minPriceMinor = minMinor;
  if (maxMinor) payload.maxPriceMinor = maxMinor;
  return payload;
}

function buildBody(draft: EditorDraft) {
  const sortOrder = Number(draft.sortOrder);
  if (!Number.isFinite(sortOrder) || sortOrder < 0) {
    throw new Error('Порядок сортировки должен быть числом ≥ 0');
  }
  return {
    title: draft.title.trim(),
    h1: draft.h1.trim() || draft.title.trim(),
    slug: draft.slug.trim() || undefined,
    seoTitle: draft.seoTitle.trim() || null,
    seoDescription: draft.seoDescription.trim() || null,
    body: draft.body.trim() || null,
    noIndex: draft.noIndex,
    navVisible: draft.navVisible,
    sortOrder,
    rules: buildRulesPayload(draft.rules),
    pinnedProductIds: parseIdList(draft.pinnedProductIds),
    excludedProductIds: parseIdList(draft.excludedProductIds),
  };
}

export function SeoLandingsManager({
  initial,
  flowerTypes,
  colors,
  occasions,
  canUpdate,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<EditorDraft | null>(null);
  const [preview, setPreview] = useState<ProductListItemDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const editing = useMemo(
    () => (editingId && editingId !== 'new' ? items.find((item) => item.id === editingId) : null),
    [editingId, items],
  );

  async function reload() {
    const payload = await adminGet<SeoLandingPageDto[]>(adminEndpoints.seoLandings);
    setItems(payload);
  }

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await action();
      await reload();
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  function openCreate() {
    setEditingId('new');
    setDraft(emptyDraft());
    setPreview([]);
    setError(null);
  }

  function openEdit(landing: SeoLandingPageDto) {
    setEditingId(landing.id);
    setDraft(draftFromLanding(landing));
    setPreview([]);
    setError(null);
  }

  function closeEditor() {
    setEditingId(null);
    setDraft(null);
    setPreview([]);
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!canUpdate || !draft) return;
    let body;
    try {
      body = buildBody(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Проверьте поля формы');
      return;
    }
    if (!body.title) {
      setError('Укажите название');
      return;
    }

    await run(async () => {
      if (editingId === 'new') {
        const created = await adminPost<SeoLandingPageDto>(adminEndpoints.seoLandings, body);
        setEditingId(created.id);
        setDraft(draftFromLanding(created));
      } else if (editing) {
        const updated = await adminPatch<SeoLandingPageDto>(adminEndpoints.seoLanding(editing.id), {
          expectedVersion: editing.version,
          ...body,
        });
        setDraft(draftFromLanding(updated));
      }
    });
  }

  async function onPublish() {
    if (!canUpdate || !editing) return;
    await run(async () => {
      const updated = await adminPost<SeoLandingPageDto>(
        adminEndpoints.seoLandingPublish(editing.id),
        { expectedVersion: editing.version },
      );
      setDraft(draftFromLanding(updated));
    });
  }

  async function onArchive() {
    if (!canUpdate || !editing) return;
    await run(async () => {
      const updated = await adminPatch<SeoLandingPageDto>(adminEndpoints.seoLanding(editing.id), {
        expectedVersion: editing.version,
        status: 'ARCHIVED',
      });
      setDraft(draftFromLanding(updated));
    });
  }

  async function onDelete() {
    if (!canUpdate || !editing) return;
    if (!window.confirm(`Удалить подборку «${editing.title}»?`)) return;
    await run(async () => {
      await adminDelete(adminEndpoints.seoLanding(editing.id), {
        expectedVersion: editing.version,
      });
      closeEditor();
    });
  }

  async function onPreview() {
    if (!editing) return;
    setPending(true);
    setError(null);
    try {
      const payload = await adminGet<PaginatedResponse<ProductListItemDto>>(
        withQuery(adminEndpoints.seoLandingPreviewProducts(editing.id), {
          page: 1,
          pageSize: 12,
        }),
      );
      setPreview(payload.items);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      {error ? <p className="admin-form-error">{error}</p> : null}

      {editingId && draft ? (
        <form className="admin-card space-y-4" onSubmit={(event) => void onSave(event)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="admin-section-title">
              {editingId === 'new' ? 'Новая SEO-подборка' : `Редактирование: ${editing?.title}`}
            </h2>
            <Button type="button" variant="outline" onClick={closeEditor} disabled={pending}>
              К списку
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="admin-field">
              <span className="admin-label">Название</span>
              <input
                className="admin-input"
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                required
              />
            </label>
            <label className="admin-field">
              <span className="admin-label">H1</span>
              <input
                className="admin-input"
                value={draft.h1}
                onChange={(event) => setDraft({ ...draft, h1: event.target.value })}
                placeholder="Как на витрине"
              />
            </label>
            <label className="admin-field">
              <span className="admin-label">Slug (/p/…)</span>
              <input
                className="admin-input"
                value={draft.slug}
                onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
              />
            </label>
            <label className="admin-field">
              <span className="admin-label">Порядок</span>
              <input
                className="admin-input"
                value={draft.sortOrder}
                onChange={(event) => setDraft({ ...draft, sortOrder: event.target.value })}
              />
            </label>
            <label className="admin-field">
              <span className="admin-label">SEO title</span>
              <input
                className="admin-input"
                value={draft.seoTitle}
                onChange={(event) => setDraft({ ...draft, seoTitle: event.target.value })}
              />
            </label>
            <label className="admin-field sm:col-span-2">
              <span className="admin-label">SEO description</span>
              <textarea
                className="admin-input min-h-20"
                value={draft.seoDescription}
                onChange={(event) => setDraft({ ...draft, seoDescription: event.target.value })}
              />
            </label>
            <label className="admin-field sm:col-span-2">
              <span className="admin-label">Текст на странице</span>
              <textarea
                className="admin-input min-h-28"
                value={draft.body}
                onChange={(event) => setDraft({ ...draft, body: event.target.value })}
              />
            </label>
          </div>

          <fieldset className="space-y-3 rounded-md border border-[var(--admin-border)] p-3">
            <legend className="admin-label px-1">Правила подбора</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="admin-field">
                <span className="admin-label">Вид цветка</span>
                <select
                  className="admin-input"
                  value={draft.rules.flowerTypeId}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      rules: { ...draft.rules, flowerTypeId: event.target.value },
                    })
                  }
                >
                  <option value="">Любой</option>
                  {flowerTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-field">
                <span className="admin-label">Цвет</span>
                <select
                  className="admin-input"
                  value={draft.rules.colorId}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      rules: { ...draft.rules, colorId: event.target.value },
                    })
                  }
                >
                  <option value="">Любой</option>
                  {colors.map((color) => (
                    <option key={color.id} value={color.id}>
                      {color.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-field">
                <span className="admin-label">Повод</span>
                <select
                  className="admin-input"
                  value={draft.rules.occasionId}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      rules: { ...draft.rules, occasionId: event.target.value },
                    })
                  }
                >
                  <option value="">Любой</option>
                  {occasions.map((occasion) => (
                    <option key={occasion.id} value={occasion.id}>
                      {occasion.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-field">
                <span className="admin-label">Состав</span>
                <select
                  className="admin-input"
                  value={draft.rules.compositionKind}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      rules: {
                        ...draft.rules,
                        compositionKind: event.target.value as RulesDraft['compositionKind'],
                      },
                    })
                  }
                >
                  <option value="">Любой</option>
                  <option value="MONO">Моно</option>
                  <option value="MIXED">Микс</option>
                  <option value="UNKNOWN">Не указан</option>
                </select>
              </label>
              <label className="admin-field">
                <span className="admin-label">Цена от, BYN</span>
                <input
                  className="admin-input"
                  value={draft.rules.minMajor}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      rules: { ...draft.rules, minMajor: event.target.value },
                    })
                  }
                  placeholder="50"
                />
              </label>
              <label className="admin-field">
                <span className="admin-label">Цена до, BYN</span>
                <input
                  className="admin-input"
                  value={draft.rules.maxMajor}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      rules: { ...draft.rules, maxMajor: event.target.value },
                    })
                  }
                  placeholder="200"
                />
              </label>
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="admin-field">
              <span className="admin-label">Закрепить товары (UUID, по одному в строке)</span>
              <textarea
                className="admin-input min-h-24 font-mono text-xs"
                value={draft.pinnedProductIds}
                onChange={(event) => setDraft({ ...draft, pinnedProductIds: event.target.value })}
              />
            </label>
            <label className="admin-field">
              <span className="admin-label">Исключить товары (UUID)</span>
              <textarea
                className="admin-input min-h-24 font-mono text-xs"
                value={draft.excludedProductIds}
                onChange={(event) =>
                  setDraft({ ...draft, excludedProductIds: event.target.value })
                }
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.noIndex}
                onChange={(event) => setDraft({ ...draft, noIndex: event.target.checked })}
              />
              noIndex
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.navVisible}
                onChange={(event) => setDraft({ ...draft, navVisible: event.target.checked })}
              />
              Показывать в навигации
            </label>
          </div>

          {editing ? (
            <p className="sf-small text-muted">
              Статус: {STATUS_LABEL[editing.status]}
              {editing.publishedAt
                ? ` · опубликовано ${new Date(editing.publishedAt).toLocaleString('ru-BY')}`
                : null}
              {' · '}
              <a
                href={`/p/${editing.slug}`}
                className="underline"
                target="_blank"
                rel="noreferrer"
              >
                /p/{editing.slug}
              </a>
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {canUpdate ? (
              <Button type="submit" disabled={pending}>
                Сохранить
              </Button>
            ) : null}
            {canUpdate && editing && editing.status !== 'PUBLISHED' ? (
              <Button type="button" disabled={pending} onClick={() => void onPublish()}>
                Опубликовать
              </Button>
            ) : null}
            {canUpdate && editing && editing.status === 'PUBLISHED' ? (
              <Button type="button" variant="outline" disabled={pending} onClick={() => void onArchive()}>
                В архив
              </Button>
            ) : null}
            {editing ? (
              <Button type="button" variant="outline" disabled={pending} onClick={() => void onPreview()}>
                Превью товаров
              </Button>
            ) : null}
            {canUpdate && editing ? (
              <Button type="button" variant="outline" disabled={pending} onClick={() => void onDelete()}>
                Удалить
              </Button>
            ) : null}
          </div>

          {preview.length > 0 ? (
            <div className="space-y-2">
              <h3 className="admin-label">Превью ({preview.length})</h3>
              <ul className="space-y-1 text-sm">
                {preview.map((product) => (
                  <li key={product.id}>
                    {product.name}{' '}
                    <span className="text-muted font-mono text-xs">{product.id}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </form>
      ) : (
        <>
          <div className="flex justify-end">
            {canUpdate ? (
              <Button type="button" onClick={openCreate}>
                Создать подборку
              </Button>
            ) : null}
          </div>

          {items.length === 0 ? (
            <p className="sf-body text-muted">Пока нет SEO-подборок.</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Название</th>
                    <th>Slug</th>
                    <th>Статус</th>
                    <th>noIndex</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.title}</td>
                      <td className="font-mono text-xs">/p/{item.slug}</td>
                      <td>{STATUS_LABEL[item.status]}</td>
                      <td>{item.noIndex ? 'да' : 'нет'}</td>
                      <td>
                        <Button type="button" variant="outline" onClick={() => openEdit(item)}>
                          Открыть
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

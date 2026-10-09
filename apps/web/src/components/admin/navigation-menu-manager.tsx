'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  NAVIGATION_ICON_KEYS,
  NAVIGATION_PANEL_LAYOUTS,
  NAVIGATION_TARGET_TYPES,
  type NavigationMenuAdminDto,
  type NavigationMenuItemAdminDto,
  type NavigationPanelLayout,
  type NavigationTargetOptionDto,
  type NavigationTargetType,
  type PaginatedResponse,
} from '@bouquet-one/contracts';
import {
  adminDelete,
  adminGet,
  adminPatch,
  adminPost,
  adminUpload,
  AdminRequestError,
  errorMessage,
} from '@/lib/admin-client';
import { adminEndpoints, withQuery } from '@/lib/admin-endpoints';
import { unwrapAdminList } from '@/lib/admin-list';
import { navItemsFromAdminMenu } from '@/lib/storefront-nav';
import { FormSaveStatus, phaseFromAdminError, type FormSavePhase } from '@/components/admin/form-status';
import { PrimaryNav } from '@/components/storefront/primary-nav';
import { NavigationGlyph } from '@/components/storefront/navigation-icons';

type Props = {
  initial: NavigationMenuAdminDto;
  canUpdate: boolean;
};

type Draft = {
  id?: string;
  version?: number;
  label: string;
  targetType: NavigationTargetType;
  targetId: string;
  customHref: string;
  parentId: string;
  iconKey: string;
  panelLayout: NavigationPanelLayout;
  enabled: boolean;
  accent: boolean;
};

type UrlBuilderMode = 'manual' | 'color' | 'occasion';

type TaxonomyOption = { id: string; slug: string; name: string };

const TARGET_LABELS: Record<NavigationTargetType, string> = {
  CATEGORY: 'Категория каталога',
  PROMOTIONS: 'Акции',
  BESTSELLERS: 'Бестселлеры',
  PAGE: 'Страница сайта',
  CUSTOM_URL: 'Своя ссылка',
  GROUP: 'Группа (колонка)',
  PRODUCT: 'Товар',
};

const ICON_LABELS: Record<(typeof NAVIGATION_ICON_KEYS)[number], string> = {
  bouquet: 'Букет',
  flower: 'Цветок',
  leaf: 'Лист',
  heart: 'Сердце',
  gift: 'Подарок',
  sale: 'Скидка',
  size: 'Размер',
  color: 'Цвет',
  arrow: 'Стрелка',
};

function findItem(
  items: NavigationMenuItemAdminDto[],
  id: string,
): NavigationMenuItemAdminDto | null {
  for (const item of items) {
    if (item.id === id) return item;
    const nested = findItem(item.children, id);
    if (nested) return nested;
  }
  return null;
}

function itemDepth(menu: NavigationMenuAdminDto, itemId: string): number {
  for (const root of menu.items) {
    if (root.id === itemId) return 0;
    for (const child of root.children) {
      if (child.id === itemId) return 1;
      if (child.children.some((g) => g.id === itemId)) return 2;
    }
  }
  return 0;
}

function parentOptions(menu: NavigationMenuAdminDto, excludeId?: string) {
  const options: { id: string; label: string; hint: string }[] = [];
  for (const root of menu.items) {
    if (root.id === excludeId) continue;
    options.push({ id: root.id, label: root.label, hint: 'подменю' });
    for (const child of root.children) {
      if (child.id === excludeId) continue;
      if (child.targetType === 'GROUP') {
        options.push({
          id: child.id,
          label: `${root.label} → ${child.label}`,
          hint: 'в колонке',
        });
      }
    }
  }
  return options;
}

export function NavigationMenuManager({ initial, canUpdate }: Props) {
  const router = useRouter();
  const [menu, setMenu] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [targets, setTargets] = useState<NavigationTargetOptionDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<FormSavePhase>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [urlBuilder, setUrlBuilder] = useState<UrlBuilderMode>('manual');
  const [taxonomyOptions, setTaxonomyOptions] = useState<TaxonomyOption[]>([]);
  const [productQuery, setProductQuery] = useState('');

  const parents = useMemo(() => parentOptions(menu, draft?.id), [menu, draft?.id]);
  const previewItems = useMemo(() => navItemsFromAdminMenu(menu.items), [menu.items]);

  const reload = async () => {
    const next = await adminGet<NavigationMenuAdminDto>(adminEndpoints.navigationMain);
    setMenu(next);
    router.refresh();
  };

  const run = async (action: () => Promise<void>, savedLabel: string) => {
    setPending(true);
    setError(null);
    setPhase('saving');
    try {
      await action();
      setNotice(savedLabel);
      setPhase('saved');
      await reload();
    } catch (err) {
      setError(errorMessage(err));
      setPhase(err instanceof AdminRequestError ? phaseFromAdminError(err) : 'server');
    } finally {
      setPending(false);
    }
  };

  const loadTargets = async (type: NavigationTargetType) => {
    if (type === 'CUSTOM_URL' || type === 'PROMOTIONS' || type === 'GROUP') {
      setTargets([]);
      return;
    }
    const rows = await adminGet<NavigationTargetOptionDto[]>(
      `${adminEndpoints.navigationTargets}?type=${encodeURIComponent(type)}`,
    );
    setTargets(rows);
  };

  const loadTaxonomy = async (mode: UrlBuilderMode) => {
    if (mode === 'manual') {
      setTaxonomyOptions([]);
      return;
    }
    const kind = mode === 'color' ? 'colors' : 'occasions';
    const payload = await adminGet<PaginatedResponse<TaxonomyOption>>(
      withQuery(adminEndpoints.taxonomy(kind), { page: 1, pageSize: 200 }),
    );
    setTaxonomyOptions(unwrapAdminList(payload));
  };

  const openCreate = async (parentId = '', preset?: Partial<Draft>) => {
    const parent = parentId ? findItem(menu.items, parentId) : null;
    const defaultType: NavigationTargetType =
      preset?.targetType ??
      (parent?.panelLayout === 'TILES'
        ? 'CATEGORY'
        : parent?.targetType === 'GROUP'
          ? 'CATEGORY'
          : parentId
            ? 'GROUP'
            : 'CATEGORY');
    const draftState: Draft = {
      label: '',
      targetType: defaultType,
      targetId: '',
      customHref: '',
      parentId,
      iconKey: '',
      panelLayout: 'COLUMNS',
      enabled: true,
      accent: false,
      ...preset,
    };
    setDraft(draftState);
    setUrlBuilder('manual');
    setProductQuery('');
    await loadTargets(draftState.targetType);
  };

  const openEdit = async (item: NavigationMenuItemAdminDto) => {
    let targetId = item.targetId ?? '';
    if (item.targetType === 'PAGE') {
      targetId = item.customHref ?? '';
    } else if (item.targetType === 'BESTSELLERS' && !item.targetId) {
      targetId = 'bestsellers';
    }
    setDraft({
      id: item.id,
      version: item.version,
      label: item.label,
      targetType: item.targetType,
      targetId,
      customHref: item.customHref ?? '',
      parentId: item.parentId ?? '',
      iconKey: item.iconKey ?? '',
      panelLayout: item.panelLayout ?? 'COLUMNS',
      enabled: item.enabled,
      accent: item.accent,
    });
    setUrlBuilder('manual');
    setProductQuery('');
    await loadTargets(item.targetType);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || !canUpdate) return;

    const needsTargetId =
      draft.targetType === 'CATEGORY' ||
      draft.targetType === 'PRODUCT' ||
      draft.targetType === 'BESTSELLERS' ||
      draft.targetType === 'PAGE';

    const body = {
      label: draft.label.trim(),
      targetType: draft.targetType,
      targetId: needsTargetId ? draft.targetId || null : null,
      customHref:
        draft.targetType === 'CUSTOM_URL'
          ? draft.customHref.trim()
          : draft.targetType === 'PAGE'
            ? draft.targetId || draft.customHref
            : null,
      parentId: draft.parentId || null,
      iconKey: draft.iconKey || null,
      ...(draft.parentId ? {} : { panelLayout: draft.panelLayout }),
      enabled: draft.enabled,
      accent: draft.accent,
    };

    await run(async () => {
      if (draft.id && draft.version != null) {
        const next = await adminPatch<NavigationMenuAdminDto>(
          adminEndpoints.navigationItem(draft.id),
          { ...body, expectedVersion: draft.version },
        );
        setMenu(next);
      } else {
        const next = await adminPost<NavigationMenuAdminDto>(adminEndpoints.navigationItems, body);
        setMenu(next);
      }
      setDraft(null);
    }, 'Меню сохранено');
  };

  const allowedTargetTypes = (parentId: string): NavigationTargetType[] => {
    if (!parentId) {
      return NAVIGATION_TARGET_TYPES.filter((type) => type !== 'GROUP') as NavigationTargetType[];
    }
    const parent = findItem(menu.items, parentId);
    if (!parent) return NAVIGATION_TARGET_TYPES as unknown as NavigationTargetType[];
    if (parent.panelLayout === 'TILES' || parent.targetType === 'GROUP') {
      return NAVIGATION_TARGET_TYPES.filter((type) => type !== 'GROUP') as NavigationTargetType[];
    }
    // Under a COLUMNS root: GROUP or links (depth 1).
    if (itemDepth(menu, parent.id) === 0) {
      return [...NAVIGATION_TARGET_TYPES] as NavigationTargetType[];
    }
    return NAVIGATION_TARGET_TYPES.filter((type) => type !== 'GROUP') as NavigationTargetType[];
  };

  const uploadTileImage = async (item: NavigationMenuItemAdminDto, file: File) => {
    await run(async () => {
      const form = new FormData();
      form.append('file', file);
      const next = await adminUpload<NavigationMenuAdminDto>(
        adminEndpoints.navigationItemMedia(item.id),
        form,
      );
      setMenu(next);
    }, 'Фото плитки сохранено');
  };

  const removeTileImage = async (item: NavigationMenuItemAdminDto) => {
    await run(async () => {
      const next = await adminDelete<NavigationMenuAdminDto>(
        adminEndpoints.navigationItemMedia(item.id),
        { expectedVersion: item.version },
      );
      setMenu(next);
    }, 'Фото плитки удалено');
  };

  const filteredProducts = useMemo(() => {
    if (draft?.targetType !== 'PRODUCT') return targets;
    const q = productQuery.trim().toLowerCase();
    if (!q) return targets.slice(0, 40);
    return targets.filter((row) => row.label.toLowerCase().includes(q)).slice(0, 40);
  }, [draft?.targetType, productQuery, targets]);

  const renderRow = (item: NavigationMenuItemAdminDto, depth: number) => {
    const parent = item.parentId ? findItem(menu.items, item.parentId) : null;
    const underTiles = parent?.panelLayout === 'TILES';
    const canAddChild =
      depth === 0 || (depth === 1 && item.targetType === 'GROUP');
    const isGroup = item.targetType === 'GROUP';
    const isTilesRoot = depth === 0 && item.panelLayout === 'TILES';

    return (
      <li
        key={item.id}
        className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2.5"
        style={{ marginLeft: depth * 14 }}
      >
        <div className="flex flex-wrap items-start gap-2">
          {underTiles || item.imageUrl ? (
            item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt=""
                className="h-12 w-12 shrink-0 rounded-lg object-cover"
              />
            ) : underTiles ? (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--admin-muted)]/10 text-[0.65rem] text-[var(--admin-muted)]">
                фото
              </span>
            ) : null
          ) : null}
          <div className="min-w-[12rem] flex-1">
            <div className="flex flex-wrap items-center gap-2 font-medium text-[var(--admin-ink)]">
              {item.iconKey ? <NavigationGlyph iconKey={item.iconKey} className="h-4 w-4" /> : null}
              <span>{item.label}</span>
              {isGroup ? (
                <span className="rounded bg-[var(--admin-muted)]/15 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--admin-muted)]">
                  колонка
                </span>
              ) : null}
              {isTilesRoot ? (
                <span className="rounded bg-[var(--admin-brand)]/10 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--admin-brand)]">
                  сетка фото
                </span>
              ) : null}
              {!item.enabled ? (
                <span className="text-xs text-[var(--admin-muted)]">выкл.</span>
              ) : null}
              {item.accent ? (
                <span className="text-xs text-[var(--admin-brand)]">акцент</span>
              ) : null}
            </div>
            <div className="mt-0.5 text-xs text-[var(--admin-muted)]">
              {TARGET_LABELS[item.targetType]}
              {item.targetLabel ? ` · ${item.targetLabel}` : ''}
              {!isGroup && item.href ? ` · ${item.href}` : ''}
            </div>
            {item.unavailable ? (
              <p className="mt-1 text-xs text-[var(--admin-danger,#b42318)]">
                {item.unavailableReason ?? 'Цель недоступна на витрине'}
              </p>
            ) : null}
            {underTiles && canUpdate ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="admin-btn-ghost cursor-pointer text-xs">
                  {item.imageUrl ? 'Заменить фото' : 'Загрузить фото'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    disabled={pending}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) void uploadTileImage(item, file);
                    }}
                  />
                </label>
                {item.mediaAssetId ? (
                  <button
                    type="button"
                    className="admin-btn-ghost text-xs"
                    disabled={pending}
                    onClick={() => void removeTileImage(item)}
                  >
                    Убрать фото
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          {canUpdate ? (
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                className="admin-btn-ghost text-xs"
                disabled={pending}
                onClick={() =>
                  void run(async () => {
                    const next = await adminPost<NavigationMenuAdminDto>(
                      adminEndpoints.navigationItemReorder(item.id),
                      { direction: 'up', expectedVersion: item.version },
                    );
                    setMenu(next);
                  }, 'Порядок обновлён')
                }
              >
                ↑
              </button>
              <button
                type="button"
                className="admin-btn-ghost text-xs"
                disabled={pending}
                onClick={() =>
                  void run(async () => {
                    const next = await adminPost<NavigationMenuAdminDto>(
                      adminEndpoints.navigationItemReorder(item.id),
                      { direction: 'down', expectedVersion: item.version },
                    );
                    setMenu(next);
                  }, 'Порядок обновлён')
                }
              >
                ↓
              </button>
              <button
                type="button"
                className="admin-btn-ghost text-xs"
                onClick={() => void openEdit(item)}
              >
                Изменить
              </button>
              {canAddChild ? (
                <button
                  type="button"
                  className="admin-btn-ghost text-xs"
                  onClick={() =>
                    void openCreate(item.id, {
                      targetType:
                        depth === 0
                          ? item.panelLayout === 'TILES'
                            ? 'CATEGORY'
                            : 'GROUP'
                          : 'CATEGORY',
                    })
                  }
                >
                  {depth === 0
                    ? item.panelLayout === 'TILES'
                      ? '+ Плитка'
                      : '+ Колонка / ссылка'
                    : '+ Ссылка'}
                </button>
              ) : null}
              <button
                type="button"
                className="admin-btn-ghost text-xs"
                disabled={pending}
                onClick={() =>
                  void run(async () => {
                    const next = await adminPatch<NavigationMenuAdminDto>(
                      adminEndpoints.navigationItem(item.id),
                      { expectedVersion: item.version, enabled: !item.enabled },
                    );
                    setMenu(next);
                  }, item.enabled ? 'Пункт выключен' : 'Пункт включён')
                }
              >
                {item.enabled ? 'Выкл.' : 'Вкл.'}
              </button>
              <button
                type="button"
                className="admin-btn-ghost text-xs"
                disabled={pending}
                onClick={() =>
                  void run(async () => {
                    const next = await adminDelete<NavigationMenuAdminDto>(
                      adminEndpoints.navigationItem(item.id),
                      { expectedVersion: item.version },
                    );
                    setMenu(next);
                  }, 'Пункт удалён')
                }
              >
                Удалить
              </button>
            </div>
          ) : null}
        </div>
        {item.children.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {item.children.map((child) => renderRow(child, depth + 1))}
          </ul>
        ) : null}
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <FormSaveStatus
        phase={phase}
        savedLabel={notice}
        errorMessage={error}
        onRefresh={() => void reload()}
        onDismiss={() => {
          setError(null);
          setPhase(notice ? 'saved' : 'idle');
        }}
      />

      <div className="admin-toolbar flex flex-wrap items-center justify-between gap-3">
        <p className="sf-small max-w-2xl text-[var(--admin-muted)]">
          Верхняя строка сайта (О нас, Доставка, Контакты) задаётся отдельно. Здесь — только
          каталожное меню: Букеты, Цветы, Повод, Подарки, Акции и колонки внутри них.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="admin-btn-ghost"
            onClick={() => setShowPreview((value) => !value)}
          >
            {showPreview ? 'Скрыть превью' : 'Превью меню'}
          </button>
          {canUpdate ? (
            <button type="button" className="admin-btn" onClick={() => void openCreate()}>
              + Пункт меню
            </button>
          ) : null}
        </div>
      </div>

      {showPreview ? (
        <div className="overflow-hidden rounded-xl border border-[var(--admin-border)] bg-[color-mix(in_oklab,var(--admin-surface)_92%,#f8f5ef)]">
          <div className="border-b border-[var(--admin-border)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--admin-muted)]">
            Превью шапки (как на витрине)
          </div>
          <div className="bg-[var(--color-background,#f8f5ef)] px-2 py-3">
            {previewItems.length === 0 ? (
              <p className="px-4 text-sm text-[var(--admin-muted)]">Нет включённых пунктов</p>
            ) : (
              <PrimaryNav items={previewItems} />
            )}
          </div>
        </div>
      ) : null}

      <ul className="space-y-2">
        {menu.items.length === 0 ? (
          <li className="admin-empty">Меню пустое. Добавьте первый пункт — например «Букеты».</li>
        ) : (
          menu.items.map((item) => renderRow(item, 0))
        )}
      </ul>

      {draft ? (
        <form
          onSubmit={onSubmit}
          className="admin-panel space-y-4 border border-[var(--admin-brand)]/30 p-4"
        >
          <h2 className="text-base font-semibold">
            {draft.id ? 'Изменить пункт' : 'Новый пункт меню'}
          </h2>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="admin-field">
              <span>Название на сайте</span>
              <input
                className="admin-input"
                required
                value={draft.label}
                onChange={(event) => setDraft({ ...draft, label: event.target.value })}
              />
            </label>

            <label className="admin-field">
              <span>Куда ведёт</span>
              <select
                className="admin-input"
                value={draft.targetType}
                onChange={(event) => {
                  const targetType = event.target.value as NavigationTargetType;
                  setDraft({
                    ...draft,
                    targetType,
                    targetId: '',
                    customHref: '',
                    accent: targetType === 'PROMOTIONS' ? true : draft.accent,
                  });
                  setUrlBuilder('manual');
                  void loadTargets(targetType);
                }}
              >
                {allowedTargetTypes(draft.parentId).map((type) => (
                  <option key={type} value={type}>
                    {TARGET_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>

            {!draft.parentId ? (
              <label className="admin-field md:col-span-2">
                <span>Вид подменю</span>
                <select
                  className="admin-input"
                  value={draft.panelLayout}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      panelLayout: event.target.value as NavigationPanelLayout,
                    })
                  }
                >
                  {NAVIGATION_PANEL_LAYOUTS.map((layout) => (
                    <option key={layout} value={layout}>
                      {layout === 'COLUMNS' ? 'Колонки текстом' : 'Сетка с фото'}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-[var(--admin-muted)]">
                  {draft.panelLayout === 'TILES'
                    ? 'Подменю — сетка плиток с фото. Добавляйте только ссылки (не колонки).'
                    : 'Подменю — текстовые колонки. Можно добавить группы «По стилю / По цвету».'}
                </span>
              </label>
            ) : null}

            {draft.targetType === 'GROUP' ? (
              <p className="sf-small md:col-span-2 text-[var(--admin-muted)]">
                Группа — заголовок колонки в выпадающем меню. Ссылка не нужна; добавьте ссылки
                внутрь колонки.
              </p>
            ) : null}

            {draft.id && draft.parentId
              ? (() => {
                  const parent = findItem(menu.items, draft.parentId);
                  const current = findItem(menu.items, draft.id);
                  if (parent?.panelLayout !== 'TILES' || !current) return null;
                  return (
                    <div className="md:col-span-2 space-y-2 rounded-lg border border-[var(--admin-border)] p-3">
                      <p className="text-sm font-medium text-[var(--admin-ink)]">Фото плитки</p>
                      {current.imageUrl ? (
                        <img
                          src={current.imageUrl}
                          alt=""
                          className="h-24 w-24 rounded-lg object-cover"
                        />
                      ) : (
                        <p className="text-xs text-[var(--admin-muted)]">
                          Нет фото — на витрине будет нейтральный фон (для товара подставится его
                          главное фото).
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <label className="admin-btn-ghost cursor-pointer text-xs">
                          {current.imageUrl ? 'Заменить' : 'Загрузить'}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="sr-only"
                            disabled={pending}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              event.target.value = '';
                              if (file) void uploadTileImage(current, file);
                            }}
                          />
                        </label>
                        {current.mediaAssetId ? (
                          <button
                            type="button"
                            className="admin-btn-ghost text-xs"
                            disabled={pending}
                            onClick={() => void removeTileImage(current)}
                          >
                            Убрать
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })()
              : null}

            {draft.targetType === 'CUSTOM_URL' ? (
              <div className="space-y-3 md:col-span-2">
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['manual', 'Вручную'],
                      ['color', 'Фильтр по цвету'],
                      ['occasion', 'Страница повода'],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      className={`admin-btn-ghost text-xs ${
                        urlBuilder === mode ? 'ring-1 ring-[var(--admin-brand)]' : ''
                      }`}
                      onClick={() => {
                        setUrlBuilder(mode);
                        void loadTaxonomy(mode);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {urlBuilder !== 'manual' ? (
                  <label className="admin-field">
                    <span>{urlBuilder === 'color' ? 'Цвет' : 'Повод'}</span>
                    <select
                      className="admin-input"
                      value=""
                      onChange={(event) => {
                        const slug = event.target.value;
                        if (!slug) return;
                        const option = taxonomyOptions.find((row) => row.slug === slug);
                        const href =
                          urlBuilder === 'color'
                            ? `/bukety?color=${encodeURIComponent(slug)}`
                            : `/povod/${encodeURIComponent(slug)}`;
                        setDraft({
                          ...draft,
                          customHref: href,
                          label: draft.label || option?.name || '',
                        });
                      }}
                    >
                      <option value="">Выберите…</option>
                      {taxonomyOptions.map((row) => (
                        <option key={row.id} value={row.slug}>
                          {row.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className="admin-field">
                  <span>URL</span>
                  <input
                    className="admin-input"
                    required
                    placeholder="/bukety?color=krasnyy или /povod/den-rozhdeniya"
                    value={draft.customHref}
                    onChange={(event) => setDraft({ ...draft, customHref: event.target.value })}
                  />
                </label>
              </div>
            ) : draft.targetType === 'PROMOTIONS' ? (
              <p className="sf-small md:col-span-2 text-[var(--admin-muted)]">
                Ведёт на страницу акций `/akcii`.
              </p>
            ) : draft.targetType === 'GROUP' ? null : draft.targetType === 'PRODUCT' ? (
              <div className="space-y-2 md:col-span-2">
                <label className="admin-field">
                  <span>Найти товар</span>
                  <input
                    className="admin-input"
                    placeholder="Начните вводить название…"
                    value={productQuery}
                    onChange={(event) => setProductQuery(event.target.value)}
                  />
                </label>
                <label className="admin-field">
                  <span>Товар</span>
                  <select
                    className="admin-input"
                    required
                    value={draft.targetId}
                    onChange={(event) => setDraft({ ...draft, targetId: event.target.value })}
                  >
                    <option value="">Выберите…</option>
                    {filteredProducts.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.label} · {row.href}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              <label className="admin-field md:col-span-2">
                <span>Объект</span>
                <select
                  className="admin-input"
                  required={draft.targetType !== 'BESTSELLERS'}
                  value={draft.targetId}
                  onChange={(event) => setDraft({ ...draft, targetId: event.target.value })}
                >
                  <option value="">Выберите…</option>
                  {targets.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label} · {row.href}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="admin-field">
              <span>Родитель</span>
              <select
                className="admin-input"
                value={draft.parentId}
                onChange={(event) => {
                  const parentId = event.target.value;
                  const allowed = allowedTargetTypes(parentId);
                  const targetType = allowed.includes(draft.targetType)
                    ? draft.targetType
                    : allowed[0]!;
                  setDraft({ ...draft, parentId, targetType });
                  void loadTargets(targetType);
                }}
              >
                <option value="">Нет — верхний уровень</option>
                {parents.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label} ({row.hint})
                  </option>
                ))}
              </select>
            </label>

            <label className="admin-field">
              <span>Иконка {draft.targetType === 'GROUP' ? '(для колонки)' : '(опционально)'}</span>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="admin-input flex-1"
                  value={draft.iconKey}
                  onChange={(event) => setDraft({ ...draft, iconKey: event.target.value })}
                >
                  <option value="">Без иконки</option>
                  {NAVIGATION_ICON_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {ICON_LABELS[key]}
                    </option>
                  ))}
                </select>
                <NavigationGlyph iconKey={draft.iconKey || null} className="h-5 w-5" />
              </div>
            </label>

            <div className="flex flex-wrap items-end gap-4 md:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
                />
                Показывать на сайте
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.accent}
                  onChange={(event) => setDraft({ ...draft, accent: event.target.checked })}
                />
                Выделить (как «Акции»)
              </label>
            </div>
          </div>

          {draft.targetType === 'CUSTOM_URL' && draft.customHref ? (
            <p className="sf-small text-[var(--admin-muted)]">Превью: {draft.customHref}</p>
          ) : draft.targetType !== 'GROUP' && draft.targetType !== 'CUSTOM_URL' && draft.targetId ? (
            <p className="sf-small text-[var(--admin-muted)]">
              Превью:{' '}
              {targets.find((row) => row.id === draft.targetId)?.href ??
                (draft.targetType === 'PROMOTIONS' ? '/akcii' : '—')}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button type="submit" className="admin-btn" disabled={pending}>
              Сохранить
            </button>
            <button type="button" className="admin-btn-ghost" onClick={() => setDraft(null)}>
              Отмена
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

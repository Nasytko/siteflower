'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  NAVIGATION_TARGET_TYPES,
  type NavigationMenuAdminDto,
  type NavigationMenuItemAdminDto,
  type NavigationTargetOptionDto,
  type NavigationTargetType,
} from '@bouquet-one/contracts';
import {
  adminDelete,
  adminGet,
  adminPatch,
  adminPost,
  AdminRequestError,
  errorMessage,
} from '@/lib/admin-client';
import { adminEndpoints } from '@/lib/admin-endpoints';
import { FormSaveStatus, phaseFromAdminError, type FormSavePhase } from '@/components/admin/form-status';

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
  enabled: boolean;
  accent: boolean;
};

const TARGET_LABELS: Record<NavigationTargetType, string> = {
  CATEGORY: 'Категория',
  PROMOTIONS: 'Акции',
  BESTSELLERS: 'Бестселлеры',
  PAGE: 'Страница',
  CUSTOM_URL: 'Произвольная ссылка',
};

function flattenItems(items: NavigationMenuItemAdminDto[]): NavigationMenuItemAdminDto[] {
  const out: NavigationMenuItemAdminDto[] = [];
  for (const item of items) {
    out.push(item);
    out.push(...item.children);
  }
  return out;
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

  const flat = useMemo(() => flattenItems(menu.items), [menu.items]);
  const rootOptions = menu.items.map((item) => ({ id: item.id, label: item.label }));

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
    if (type === 'CUSTOM_URL' || type === 'PROMOTIONS') {
      setTargets([]);
      return;
    }
    const rows = await adminGet<NavigationTargetOptionDto[]>(
      `${adminEndpoints.navigationTargets}?type=${encodeURIComponent(type)}`,
    );
    setTargets(rows);
  };

  const openCreate = async (parentId = '') => {
    const draftState: Draft = {
      label: '',
      targetType: 'CATEGORY',
      targetId: '',
      customHref: '',
      parentId,
      enabled: true,
      accent: false,
    };
    setDraft(draftState);
    await loadTargets('CATEGORY');
  };

  const openEdit = async (item: NavigationMenuItemAdminDto) => {
    setDraft({
      id: item.id,
      version: item.version,
      label: item.label,
      targetType: item.targetType,
      targetId: item.targetId ?? (item.targetType === 'PAGE' ? item.customHref ?? '' : ''),
      customHref: item.targetType === 'CUSTOM_URL' ? item.customHref ?? '' : item.customHref ?? '',
      parentId: item.parentId ?? '',
      enabled: item.enabled,
      accent: item.accent,
    });
    await loadTargets(item.targetType);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || !canUpdate) return;
    const body = {
      label: draft.label.trim(),
      targetType: draft.targetType,
      targetId:
        draft.targetType === 'CATEGORY' || draft.targetType === 'BESTSELLERS'
          ? draft.targetId || null
          : null,
      customHref:
        draft.targetType === 'CUSTOM_URL'
          ? draft.customHref.trim()
          : draft.targetType === 'PAGE'
            ? draft.targetId || draft.customHref
            : null,
      parentId: draft.parentId || null,
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

  const renderRow = (item: NavigationMenuItemAdminDto, depth: number) => (
    <li
      key={item.id}
      className="rounded border border-[var(--admin-border)] px-3 py-2"
      style={{ marginLeft: depth * 16 }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[10rem] flex-1">
          <div className="font-medium text-[var(--admin-ink)]">
            {item.label}
            {!item.enabled ? (
              <span className="ml-2 text-xs text-[var(--admin-muted)]">выкл.</span>
            ) : null}
            {item.accent ? (
              <span className="ml-2 text-xs text-[var(--admin-brand)]">акцент</span>
            ) : null}
          </div>
          <div className="text-xs text-[var(--admin-muted)]">
            {item.targetLabel} · {item.href}
          </div>
          {item.unavailable ? (
            <p className="mt-1 text-xs text-[var(--admin-danger,#b42318)]">
              {item.unavailableReason ?? 'Цель недоступна на витрине'}
            </p>
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
            <button type="button" className="admin-btn-ghost text-xs" onClick={() => void openEdit(item)}>
              Изменить
            </button>
            {depth === 0 ? (
              <button
                type="button"
                className="admin-btn-ghost text-xs"
                onClick={() => void openCreate(item.id)}
              >
                + Дочерний
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
        <p className="sf-small text-[var(--admin-muted)]">
          Главное меню не связано с деревом категорий. «Акции» и служебные страницы добавляются
          отдельно.
        </p>
        {canUpdate ? (
          <button type="button" className="admin-btn" onClick={() => void openCreate()}>
            + Добавить пункт
          </button>
        ) : null}
      </div>

      <ul className="space-y-2">
        {menu.items.length === 0 ? (
          <li className="admin-empty">Меню пустое. Добавьте первый пункт.</li>
        ) : (
          menu.items.map((item) => renderRow(item, 0))
        )}
      </ul>

      {draft ? (
        <form onSubmit={onSubmit} className="admin-panel space-y-3 border border-[var(--admin-brand)]/30 p-4">
          <h2 className="text-base font-semibold">
            {draft.id ? 'Изменить пункт меню' : 'Новый пункт меню'}
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="admin-field">
              <span>Название</span>
              <input
                className="admin-input"
                required
                value={draft.label}
                onChange={(event) => setDraft({ ...draft, label: event.target.value })}
              />
            </label>
            <label className="admin-field">
              <span>Тип ссылки</span>
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
                  void loadTargets(targetType);
                }}
              >
                {NAVIGATION_TARGET_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {TARGET_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>

            {draft.targetType === 'CUSTOM_URL' ? (
              <label className="admin-field md:col-span-2">
                <span>URL</span>
                <input
                  className="admin-input"
                  required
                  placeholder="/akcii или https://…"
                  value={draft.customHref}
                  onChange={(event) => setDraft({ ...draft, customHref: event.target.value })}
                />
              </label>
            ) : draft.targetType === 'PROMOTIONS' ? (
              <p className="sf-small md:col-span-2 text-[var(--admin-muted)]">
                Ведёт на страницу акций `/akcii`. Категория «Акции» не нужна.
              </p>
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
              <span>Родитель (подменю)</span>
              <select
                className="admin-input"
                value={draft.parentId}
                onChange={(event) => setDraft({ ...draft, parentId: event.target.value })}
              >
                <option value="">Нет — верхний уровень</option>
                {rootOptions
                  .filter((row) => row.id !== draft.id)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label}
                    </option>
                  ))}
              </select>
            </label>

            <div className="flex flex-wrap items-end gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
                />
                Включён
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.accent}
                  onChange={(event) => setDraft({ ...draft, accent: event.target.checked })}
                />
                Акцент (как «Акции»)
              </label>
            </div>
          </div>

          {draft.targetType !== 'CUSTOM_URL' && draft.targetId ? (
            <p className="sf-small text-[var(--admin-muted)]">
              Preview:{' '}
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
          <p className="sr-only">{flat.length} пунктов</p>
        </form>
      ) : null}
    </div>
  );
}

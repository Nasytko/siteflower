'use client';

import { useMemo, useState, useTransition } from 'react';
import type {
  CatalogPageDto,
  HomepageConfigAdminDto,
  HomepageDiscoveryTileDto,
  TaxonomyAdminDto,
} from '@bouquet-one/contracts';
import { ImagePicker } from '@/components/admin/image-picker';
import { adminGet, adminPatch, errorMessage } from '@/lib/admin-client';
import { adminEndpoints } from '@/lib/admin-endpoints';

export type DiscoveryLinkOption = {
  value: string;
  label: string;
  group: string;
};

type DraftTile = {
  key: string;
  id: string;
  label: string;
  href: string;
  imageUrl: string;
  imageAlt: string;
  enabled: boolean;
  sortOrder: number;
  linkMode: 'page' | 'custom';
};

type Props = {
  initial: HomepageConfigAdminDto;
  linkOptions: DiscoveryLinkOption[];
  canUpdate: boolean;
};

function newKey(): string {
  return `tile-${Math.random().toString(36).slice(2, 10)}`;
}

function toDraft(tile: HomepageDiscoveryTileDto, options: DiscoveryLinkOption[]): DraftTile {
  const href = tile.href?.trim() || '/';
  const known = options.some((option) => option.value === href);
  return {
    key: newKey(),
    id: tile.id,
    label: tile.label,
    href,
    imageUrl: tile.imageUrl ?? '',
    imageAlt: tile.imageAlt || tile.label,
    enabled: tile.enabled,
    sortOrder: tile.sortOrder,
    linkMode: known ? 'page' : 'custom',
  };
}

function slugifyId(label: string, fallback: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || fallback;
}

export function DiscoveryTilesManager({ initial, linkOptions, canUpdate }: Props) {
  const [version, setVersion] = useState(initial.version);
  const [tiles, setTiles] = useState<DraftTile[]>(() =>
    [...initial.discoveryTiles]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
      .map((tile) => toDraft(tile, linkOptions)),
  );
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const groupedOptions = useMemo(() => {
    const map = new Map<string, DiscoveryLinkOption[]>();
    for (const option of linkOptions) {
      const list = map.get(option.group) ?? [];
      list.push(option);
      map.set(option.group, list);
    }
    return [...map.entries()];
  }, [linkOptions]);

  function updateTile(key: string, patch: Partial<DraftTile>) {
    setTiles((prev) => prev.map((tile) => (tile.key === key ? { ...tile, ...patch } : tile)));
  }

  function moveTile(key: string, direction: -1 | 1) {
    setTiles((prev) => {
      const ordered = [...prev].sort((a, b) => a.sortOrder - b.sortOrder);
      const index = ordered.findIndex((tile) => tile.key === key);
      const swapWith = index + direction;
      if (index < 0 || swapWith < 0 || swapWith >= ordered.length) return prev;
      const next = [...ordered];
      [next[index], next[swapWith]] = [next[swapWith]!, next[index]!];
      return next.map((tile, sortOrder) => ({ ...tile, sortOrder: (sortOrder + 1) * 10 }));
    });
  }

  function addTile() {
    setTiles((prev) => [
      ...prev,
      {
        key: newKey(),
        id: `tile-${Date.now().toString(36)}`,
        label: 'Новая плитка',
        href: linkOptions[0]?.value || '/catalog/bouquets',
        imageUrl: '',
        imageAlt: 'Новая плитка',
        enabled: false,
        sortOrder: (prev.length + 1) * 10,
        linkMode: linkOptions[0] ? 'page' : 'custom',
      },
    ]);
  }

  function removeTile(key: string) {
    setTiles((prev) => prev.filter((tile) => tile.key !== key));
  }

  function save() {
    if (!canUpdate) return;
    setError(null);
    startTransition(async () => {
      try {
        const usedIds = new Set<string>();
        const payload: HomepageDiscoveryTileDto[] = [...tiles]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((tile, index) => {
            let id = tile.id.trim() || slugifyId(tile.label, `tile-${index + 1}`);
            if (usedIds.has(id)) id = `${id}-${index + 1}`;
            usedIds.add(id);
            const href = tile.href.trim() || '/';
            return {
              id,
              label: tile.label.trim() || 'Плитка',
              href,
              destination: { kind: 'custom', href },
              imageUrl: tile.imageUrl.trim(),
              imageAlt: (tile.imageAlt.trim() || tile.label.trim() || 'Плитка').slice(0, 200),
              enabled: tile.enabled,
              sortOrder: (index + 1) * 10,
            };
          });

        const updated = await adminPatch<HomepageConfigAdminDto>(
          adminEndpoints.homepageDiscoveryTiles,
          {
            expectedVersion: version,
            discoveryTiles: payload,
          },
        );
        setVersion(updated.version);
        setTiles(
          [...updated.discoveryTiles]
            .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
            .map((tile) => toDraft(tile, linkOptions)),
        );
        setSavedAt(new Date().toISOString());
      } catch (err) {
        setError(errorMessage(err));
        const fresh = await adminGet<HomepageConfigAdminDto>(adminEndpoints.homepage).catch(
          () => null,
        );
        if (fresh) setVersion(fresh.version);
      }
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Плитки на главной под баннером. Фото — из хранилища, ссылка — страница сайта или свой URL.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            disabled={!canUpdate || pending}
            onClick={addTile}
          >
            Добавить плитку
          </button>
          <button
            type="button"
            className="admin-btn"
            disabled={!canUpdate || pending}
            onClick={save}
          >
            {pending ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>

      {savedAt ? (
        <p className="text-xs text-muted">
          Сохранено {new Date(savedAt).toLocaleTimeString('ru-BY')}
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <ul className="space-y-4">
        {[...tiles]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((tile, index) => (
            <li key={tile.key} className="admin-card space-y-4 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="inline-flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={tile.enabled}
                    disabled={!canUpdate || pending}
                    onChange={(event) =>
                      updateTile(tile.key, { enabled: event.target.checked })
                    }
                  />
                  Показывать на главной
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="admin-btn-ghost text-xs"
                    disabled={!canUpdate || pending || index === 0}
                    onClick={() => moveTile(tile.key, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="admin-btn-ghost text-xs"
                    disabled={!canUpdate || pending || index === tiles.length - 1}
                    onClick={() => moveTile(tile.key, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="admin-btn-ghost text-xs"
                    disabled={!canUpdate || pending}
                    onClick={() => removeTile(tile.key)}
                  >
                    Удалить
                  </button>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <ImagePicker
                  label="Фото плитки"
                  value={tile.imageUrl || null}
                  disabled={!canUpdate || pending}
                  onChange={(url) => updateTile(tile.key, { imageUrl: url ?? '' })}
                />

                <div className="space-y-3">
                  <label className="admin-field">
                    <span className="text-xs">Подпись</span>
                    <input
                      className="admin-input"
                      value={tile.label}
                      disabled={!canUpdate || pending}
                      onChange={(event) => {
                        const label = event.target.value;
                        updateTile(tile.key, {
                          label,
                          imageAlt: tile.imageAlt === tile.label ? label : tile.imageAlt,
                        });
                      }}
                    />
                  </label>

                  <fieldset className="space-y-2">
                    <legend className="text-xs font-medium">Ссылка</legend>
                    <div className="flex flex-wrap gap-3 text-sm">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          name={`link-mode-${tile.key}`}
                          checked={tile.linkMode === 'page'}
                          disabled={!canUpdate || pending}
                          onChange={() =>
                            updateTile(tile.key, {
                              linkMode: 'page',
                              href: linkOptions[0]?.value || tile.href,
                            })
                          }
                        />
                        Страница сайта
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          name={`link-mode-${tile.key}`}
                          checked={tile.linkMode === 'custom'}
                          disabled={!canUpdate || pending}
                          onChange={() => updateTile(tile.key, { linkMode: 'custom' })}
                        />
                        Свой URL
                      </label>
                    </div>

                    {tile.linkMode === 'page' ? (
                      <select
                        className="admin-input"
                        value={
                          linkOptions.some((option) => option.value === tile.href)
                            ? tile.href
                            : ''
                        }
                        disabled={!canUpdate || pending}
                        onChange={(event) =>
                          updateTile(tile.key, { href: event.target.value, linkMode: 'page' })
                        }
                      >
                        <option value="" disabled>
                          Выберите страницу
                        </option>
                        {groupedOptions.map(([group, options]) => (
                          <optgroup key={group} label={group}>
                            {options.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="admin-input"
                        value={tile.href}
                        disabled={!canUpdate || pending}
                        placeholder="/catalog/… или https://…"
                        onChange={(event) =>
                          updateTile(tile.key, { href: event.target.value, linkMode: 'custom' })
                        }
                      />
                    )}
                  </fieldset>

                  <label className="admin-field">
                    <span className="text-xs">Alt изображения</span>
                    <input
                      className="admin-input"
                      value={tile.imageAlt}
                      disabled={!canUpdate || pending}
                      onChange={(event) =>
                        updateTile(tile.key, { imageAlt: event.target.value })
                      }
                    />
                  </label>
                </div>
              </div>

              {tile.enabled && !tile.imageUrl.trim() ? (
                <p className="text-xs text-amber-800">
                  Включённой плитке нужно фото — иначе сохранение не пройдёт.
                </p>
              ) : null}
            </li>
          ))}
      </ul>
    </section>
  );
}

export function buildDiscoveryLinkOptions(input: {
  catalogPages: CatalogPageDto[];
  occasions: TaxonomyAdminDto[];
  recipients: TaxonomyAdminDto[];
}): DiscoveryLinkOption[] {
  const options: DiscoveryLinkOption[] = [
    { group: 'Основные', value: '/catalog/bouquets', label: 'Букеты' },
    { group: 'Основные', value: '/catalog/stems', label: 'Цветы поштучно' },
    { group: 'Основные', value: '/akcii', label: 'Акции' },
    { group: 'Основные', value: '/dostavka', label: 'Доставка' },
    { group: 'Основные', value: '/kontakty', label: 'Контакты' },
    { group: 'Основные', value: '/povod', label: 'Поводы' },
  ];

  for (const page of input.catalogPages) {
    if (page.status !== 'PUBLISHED' && page.status !== 'LIVE') continue;
    if (page.visibility === 'HIDDEN') continue;
    const path = page.publicPath?.startsWith('/')
      ? page.publicPath
      : `/catalog/${page.slug}`;
    options.push({
      group: 'Страницы каталога',
      value: path,
      label: `${page.name} (${path})`,
    });
  }

  for (const occasion of input.occasions) {
    if (occasion.visibility === 'HIDDEN') continue;
    options.push({
      group: 'Поводы',
      value: `/povod/${occasion.slug}`,
      label: occasion.name,
    });
  }

  for (const recipient of input.recipients) {
    if (recipient.visibility === 'HIDDEN') continue;
    options.push({
      group: 'Кому',
      value: `/komu/${recipient.slug}`,
      label: recipient.name,
    });
  }

  return options;
}

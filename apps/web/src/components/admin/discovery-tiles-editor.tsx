'use client';

import { FormEvent, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type {
  HomepageConfigAdminDto,
  HomepageDiscoveryTileDto,
} from '@bouquet-one/contracts';
import { Button } from '@bouquet-one/ui';
import {
  adminGet,
  adminPatch,
  AdminRequestError,
  errorMessage,
} from '@/lib/admin-client';
import { adminEndpoints } from '@/lib/admin-endpoints';
import {
  FormSaveStatus,
  phaseFromAdminError,
  type FormSavePhase,
} from '@/components/admin/form-status';

type Props = {
  initial: HomepageConfigAdminDto;
  canUpdate: boolean;
};

type DraftTile = HomepageDiscoveryTileDto;

function sortTiles(tiles: DraftTile[]): DraftTile[] {
  return [...tiles].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

function newTileId(): string {
  return `tile-${Date.now().toString(36)}`;
}

export function DiscoveryTilesEditor({ initial, canUpdate }: Props) {
  const router = useRouter();
  const [version, setVersion] = useState(initial.version);
  const [hero, setHero] = useState(initial.hero);
  const [sections, setSections] = useState(initial.sections);
  const [tiles, setTiles] = useState<DraftTile[]>(() => sortTiles(initial.discoveryTiles ?? []));
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [phase, setPhase] = useState<FormSavePhase>('idle');
  const [pending, setPending] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  function markDirty() {
    setSavedAt(null);
    if (phase === 'saved' || phase === 'idle') setPhase('dirty');
  }

  function updateTile(index: number, patch: Partial<DraftTile>) {
    setTiles((prev) => prev.map((tile, i) => (i === index ? { ...tile, ...patch } : tile)));
    markDirty();
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= tiles.length) return;
    setTiles((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved!);
      return next;
    });
    markDirty();
  }

  function addTile() {
    setTiles((prev) => [
      ...prev,
      {
        id: newTileId(),
        label: 'Новая плитка',
        href: '/bukety',
        imageUrl: '/categories/discovery-sbornye.png',
        imageAlt: 'Новая плитка',
        enabled: true,
        sortOrder: (prev.length + 1) * 10,
      },
    ]);
    markDirty();
  }

  function removeTile(index: number) {
    setTiles((prev) => prev.filter((_, i) => i !== index));
    markDirty();
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!canUpdate) return;
    setPending(true);
    setError(null);
    setRequestId(null);
    setSavedAt(null);
    setPhase('saving');
    try {
      const updated = await adminPatch<HomepageConfigAdminDto>(adminEndpoints.homepage, {
        expectedVersion: version,
        hero,
        sections,
        discoveryTiles: tiles.map((tile, index) => ({
          id: tile.id.trim(),
          label: tile.label.trim(),
          href: tile.href.trim(),
          imageUrl: tile.imageUrl.trim(),
          imageAlt: tile.imageAlt.trim() || tile.label.trim(),
          enabled: tile.enabled,
          sortOrder: (index + 1) * 10,
        })),
      });
      setVersion(updated.version);
      setTiles(sortTiles(updated.discoveryTiles ?? []));
      setSavedAt(new Date().toLocaleString('ru-BY'));
      setPhase('saved');
      router.refresh();
    } catch (err) {
      if (err instanceof AdminRequestError) {
        setPhase(phaseFromAdminError(err));
        setRequestId(err.requestId ?? null);
        setError(errorMessage(err, 'Не удалось сохранить плитки'));
      } else {
        setPhase('server');
        setError(errorMessage(err, 'Не удалось сохранить плитки'));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={onSave}>
      <FormSaveStatus
        phase={phase === 'idle' && savedAt ? 'saved' : phase}
        savedLabel={savedAt ? `Плитки сохранены · ${savedAt}` : null}
        errorMessage={error}
        requestId={requestId}
        onRetry={() => {
          const formEl = document.querySelector('form');
          formEl?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }}
        onRefresh={() => {
          void (async () => {
            try {
              const fresh = await adminGet<HomepageConfigAdminDto>(adminEndpoints.homepage);
              setVersion(fresh.version);
              setHero(fresh.hero);
              setSections(fresh.sections);
              setTiles(sortTiles(fresh.discoveryTiles ?? []));
              setError(null);
              setRequestId(null);
              setPhase('idle');
              router.refresh();
            } catch (err) {
              setPhase('server');
              setError(errorMessage(err, 'Не удалось обновить данные'));
            }
          })();
        }}
        onDismiss={() => {
          setError(null);
          setPhase(savedAt ? 'saved' : 'idle');
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--admin-muted)] max-w-2xl">
          Плитки под героем на главной: название, ссылка и фото. Заголовок блока на витрине не
          показывается.
        </p>
        {canUpdate ? (
          <button type="button" className="admin-btn-ghost" disabled={pending} onClick={addTile}>
            Добавить плитку
          </button>
        ) : null}
      </div>

      <ul className="space-y-4">
        {tiles.map((tile, index) => (
          <li key={tile.id} className="admin-card p-4">
            <div className="flex flex-col gap-4 md:flex-row">
              <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-md border border-[var(--admin-border)] bg-[var(--admin-bg)]">
                {tile.imageUrl ? (
                  <Image
                    src={tile.imageUrl}
                    alt={tile.imageAlt || tile.label}
                    fill
                    className="object-cover"
                    sizes="112px"
                    unoptimized={tile.imageUrl.startsWith('http')}
                  />
                ) : (
                  <span className="flex h-full items-center justify-center text-xs text-[var(--admin-muted)]">
                    Нет фото
                  </span>
                )}
              </div>

              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <label className="admin-field">
                  <span>Название</span>
                  <input
                    className="admin-input"
                    value={tile.label}
                    disabled={!canUpdate || pending}
                    onChange={(event) => updateTile(index, { label: event.target.value })}
                  />
                </label>
                <label className="admin-field">
                  <span>Ссылка</span>
                  <input
                    className="admin-input"
                    value={tile.href}
                    disabled={!canUpdate || pending}
                    placeholder="/bukety"
                    onChange={(event) => updateTile(index, { href: event.target.value })}
                  />
                </label>
                <label className="admin-field sm:col-span-2">
                  <span>Фото (URL или путь)</span>
                  <input
                    className="admin-input"
                    value={tile.imageUrl}
                    disabled={!canUpdate || pending}
                    placeholder="/categories/discovery-roza.png"
                    onChange={(event) => updateTile(index, { imageUrl: event.target.value })}
                  />
                </label>
                <label className="admin-field">
                  <span>Подпись к фото</span>
                  <input
                    className="admin-input"
                    value={tile.imageAlt}
                    disabled={!canUpdate || pending}
                    onChange={(event) => updateTile(index, { imageAlt: event.target.value })}
                  />
                </label>
                <label className="flex items-center gap-2 self-end pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={tile.enabled}
                    disabled={!canUpdate || pending}
                    onChange={(event) => updateTile(index, { enabled: event.target.checked })}
                  />
                  <span>Показывать на витрине</span>
                </label>
              </div>
            </div>

            {canUpdate ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="admin-btn-ghost text-xs"
                  disabled={pending || index === 0}
                  onClick={() => move(index, -1)}
                >
                  Вверх
                </button>
                <button
                  type="button"
                  className="admin-btn-ghost text-xs"
                  disabled={pending || index === tiles.length - 1}
                  onClick={() => move(index, 1)}
                >
                  Вниз
                </button>
                <button
                  type="button"
                  className="admin-btn-ghost text-xs"
                  disabled={pending}
                  onClick={() => removeTile(index)}
                >
                  Удалить
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {tiles.length === 0 ? (
        <p className="text-sm text-[var(--admin-muted)]">
          Плиток пока нет. Добавьте хотя бы одну — иначе ряд на главной скрыт.
        </p>
      ) : null}

      <div className="admin-savebar">
        {canUpdate ? (
          <Button type="submit" disabled={pending} className="!rounded-lg !bg-[var(--admin-brand)]">
            {pending ? 'Сохранение…' : 'Сохранить'}
          </Button>
        ) : (
          <p className="admin-help">Только просмотр: нет прав на изменение контента.</p>
        )}
      </div>
    </form>
  );
}

'use client';

import { FormEvent, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type {
  HomepageConfigAdminDto,
  HomepageDiscoveryTileDto,
  HomepageHeroSlideDto,
  HomepagePerkDto,
  HomepageSectionDto,
  HomepageSectionKind,
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

type TabId = 'banners' | 'tiles' | 'shelves' | 'extras';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'banners', label: 'Баннеры' },
  { id: 'tiles', label: 'Быстрые категории' },
  { id: 'shelves', label: 'Товарные секции' },
  { id: 'extras', label: 'Преимущества и помощь' },
];

const SHELF_KINDS: HomepageSectionKind[] = [
  'promotions',
  'autumn',
  'popular',
  'bestsellers',
  'roses',
];

const HELP_KINDS: HomepageSectionKind[] = ['help'];

const SECTION_HINTS: Partial<Record<HomepageSectionKind, string>> = {
  promotions:
    'Товары с действующей акцией. Если акций нет — секция скрыта на витрине.',
  autumn: 'Сезонная полка: товары из страницы каталога (slug) или группы бестселлеров.',
  popular: 'Популярные букеты: slug группы/страницы или автоподбор по продажам.',
  bestsellers: 'Устаревший дубль «Популярных» — лучше выключить.',
  roses: 'Розы поштучно: страница каталога или фильтр вида «роза».',
  help: 'Блок консультации: фото, текст и кнопки на витрине.',
};

function sortByOrder<T extends { sortOrder: number; id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`;
}

function primaryHeroFromSlides(slides: HomepageHeroSlideDto[]) {
  const sorted = sortByOrder(slides);
  const live = sorted.find((s) => s.enabled) ?? sorted[0];
  if (!live) {
    return {
      title: 'Букеты',
      subtitle: '',
      imageUrl: null as string | null,
      ctaLabel: 'Смотреть',
      ctaHref: '/catalog/bouquets',
    };
  }
  return {
    title: live.title,
    subtitle: live.subtitle,
    imageUrl: live.imageUrl,
    ctaLabel: live.ctaLabel,
    ctaHref: live.ctaHref,
  };
}

export function HomepageManager({ initial, canUpdate }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>('banners');
  const [version, setVersion] = useState(initial.version);
  const [slides, setSlides] = useState<HomepageHeroSlideDto[]>(() =>
    sortByOrder(initial.heroSlides?.length ? initial.heroSlides : []),
  );
  const [tiles, setTiles] = useState<HomepageDiscoveryTileDto[]>(() =>
    sortByOrder(initial.discoveryTiles ?? []),
  );
  const [sections, setSections] = useState<HomepageSectionDto[]>(() =>
    sortByOrder(initial.sections ?? []),
  );
  const [perks, setPerks] = useState<HomepagePerkDto[]>(() =>
    sortByOrder(initial.perks ?? []),
  );
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [phase, setPhase] = useState<FormSavePhase>('idle');
  const [pending, setPending] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const shelfSections = useMemo(
    () => sections.filter((s) => SHELF_KINDS.includes(s.kind)),
    [sections],
  );
  const helpSections = useMemo(
    () => sections.filter((s) => HELP_KINDS.includes(s.kind)),
    [sections],
  );

  function markDirty() {
    setSavedAt(null);
    if (phase === 'saved' || phase === 'idle') setPhase('dirty');
  }

  function applyServer(next: HomepageConfigAdminDto) {
    setVersion(next.version);
    setSlides(sortByOrder(next.heroSlides ?? []));
    setTiles(sortByOrder(next.discoveryTiles ?? []));
    setSections(sortByOrder(next.sections ?? []));
    setPerks(sortByOrder(next.perks ?? []));
  }

  function moveItem<T>(list: T[], index: number, direction: -1 | 1): T[] {
    const target = index + direction;
    if (target < 0 || target >= list.length) return list;
    const next = [...list];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    return next;
  }

  function updateSlide(index: number, patch: Partial<HomepageHeroSlideDto>) {
    setSlides((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
    markDirty();
  }

  function updateTile(index: number, patch: Partial<HomepageDiscoveryTileDto>) {
    setTiles((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
    markDirty();
  }

  function updatePerk(index: number, patch: Partial<HomepagePerkDto>) {
    setPerks((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
    markDirty();
  }

  function updateSection(id: string, patch: Partial<HomepageSectionDto>) {
    setSections((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    markDirty();
  }

  function addSlide() {
    setSlides((prev) => [
      ...prev,
      {
        id: newId('slide'),
        title: 'Новый баннер',
        subtitle: '',
        imageUrl: null,
        mobileImageUrl: null,
        ctaLabel: 'Смотреть',
        ctaHref: '/catalog/bouquets',
        enabled: false,
        sortOrder: (prev.length + 1) * 10,
        startsAt: null,
        endsAt: null,
      },
    ]);
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

    const orderedSlides = slides.map((slide, index) => ({
      ...slide,
      title: slide.title.trim(),
      subtitle: slide.subtitle.trim(),
      imageUrl: slide.imageUrl?.trim() || null,
      mobileImageUrl: slide.mobileImageUrl?.trim() || null,
      ctaLabel: slide.ctaLabel.trim() || 'Смотреть',
      ctaHref: slide.ctaHref.trim() || '/catalog/bouquets',
      sortOrder: (index + 1) * 10,
      startsAt: slide.startsAt?.trim() || null,
      endsAt: slide.endsAt?.trim() || null,
    }));

    const orderedTiles = tiles.map((tile, index) => ({
      ...tile,
      label: tile.label.trim(),
      href: tile.href.trim(),
      imageUrl: tile.imageUrl.trim(),
      imageAlt: tile.imageAlt.trim() || tile.label.trim(),
      sortOrder: (index + 1) * 10,
    }));

    const orderedPerks = perks.map((perk, index) => ({
      ...perk,
      title: perk.title.trim(),
      sortOrder: (index + 1) * 10,
    }));

    try {
      const updated = await adminPatch<HomepageConfigAdminDto>(adminEndpoints.homepage, {
        expectedVersion: version,
        hero: primaryHeroFromSlides(orderedSlides),
        heroSlides: orderedSlides,
        sections: sections.map((section) => ({
          ...section,
          heading: section.heading.trim(),
          body: section.body?.trim() || null,
          viewAllHref: section.viewAllHref?.trim() || null,
          sourceSlug: section.sourceSlug?.trim() || null,
          imageUrl: section.imageUrl?.trim() || null,
          limit: section.limit ?? null,
          theme: section.theme ?? null,
        })),
        discoveryTiles: orderedTiles,
        perks: orderedPerks,
      });
      applyServer(updated);
      setSavedAt(new Date().toLocaleString('ru-BY'));
      setPhase('saved');
      router.refresh();
    } catch (err) {
      if (err instanceof AdminRequestError) {
        setPhase(phaseFromAdminError(err));
        setRequestId(err.requestId ?? null);
        setError(errorMessage(err, 'Не удалось сохранить главную'));
      } else {
        setPhase('server');
        setError(errorMessage(err, 'Не удалось сохранить главную'));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={onSave}>
      <FormSaveStatus
        phase={phase === 'idle' && savedAt ? 'saved' : phase}
        savedLabel={savedAt ? `Сохранено · ${savedAt}` : null}
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
              applyServer(fresh);
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

      <div className="flex flex-wrap gap-2 border-b border-[var(--admin-border)] pb-3">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`admin-btn-ghost ${tab === item.id ? '!bg-[var(--admin-brand)] !text-white' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'banners' ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-sm text-[var(--admin-muted)]">
              Слайды героя на главной. Достаточно фото, заголовка и ссылки. Публикуйте только
              готовые слайды.
            </p>
            {canUpdate ? (
              <button type="button" className="admin-btn-ghost" disabled={pending} onClick={addSlide}>
                Добавить слайд
              </button>
            ) : null}
          </div>

          {slides.length === 0 ? (
            <p className="text-sm text-[var(--admin-muted)]">
              Слайдов нет — на витрине герой скрыт. Добавьте хотя бы один.
            </p>
          ) : null}

          <ul className="space-y-4">
            {slides.map((slide, index) => (
              <li key={slide.id} className="admin-card space-y-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    Слайд {index + 1}
                    {!slide.enabled ? (
                      <span className="ml-2 text-[var(--admin-muted)]">(скрыт)</span>
                    ) : null}
                  </p>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={slide.enabled}
                      disabled={!canUpdate || pending}
                      onChange={(e) => updateSlide(index, { enabled: e.target.checked })}
                    />
                    Опубликован
                  </label>
                </div>

                <div className="flex flex-col gap-4 md:flex-row">
                  <div className="relative h-36 w-full shrink-0 overflow-hidden rounded-md border border-[var(--admin-border)] bg-[var(--admin-bg)] md:w-56">
                    {slide.imageUrl ? (
                      <Image
                        src={slide.imageUrl}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="224px"
                        unoptimized={slide.imageUrl.startsWith('http')}
                      />
                    ) : (
                      <span className="flex h-full items-center justify-center text-xs text-[var(--admin-muted)]">
                        Нет фото
                      </span>
                    )}
                  </div>
                  <div className="grid flex-1 gap-3 sm:grid-cols-2">
                    <label className="admin-field sm:col-span-2">
                      <span>Заголовок</span>
                      <input
                        className="admin-input"
                        value={slide.title}
                        disabled={!canUpdate || pending}
                        onChange={(e) => updateSlide(index, { title: e.target.value })}
                      />
                    </label>
                    <label className="admin-field sm:col-span-2">
                      <span>Подзаголовок</span>
                      <input
                        className="admin-input"
                        value={slide.subtitle}
                        disabled={!canUpdate || pending}
                        onChange={(e) => updateSlide(index, { subtitle: e.target.value })}
                      />
                    </label>
                    <label className="admin-field sm:col-span-2">
                      <span>Фото (desktop)</span>
                      <input
                        className="admin-input"
                        value={slide.imageUrl ?? ''}
                        disabled={!canUpdate || pending}
                        placeholder="/categories/… или URL медиа"
                        onChange={(e) => updateSlide(index, { imageUrl: e.target.value || null })}
                      />
                    </label>
                    <label className="admin-field sm:col-span-2">
                      <span>Фото (mobile, необязательно)</span>
                      <input
                        className="admin-input"
                        value={slide.mobileImageUrl ?? ''}
                        disabled={!canUpdate || pending}
                        onChange={(e) =>
                          updateSlide(index, { mobileImageUrl: e.target.value || null })
                        }
                      />
                    </label>
                    <label className="admin-field">
                      <span>Текст кнопки</span>
                      <input
                        className="admin-input"
                        value={slide.ctaLabel}
                        disabled={!canUpdate || pending}
                        onChange={(e) => updateSlide(index, { ctaLabel: e.target.value })}
                      />
                    </label>
                    <label className="admin-field">
                      <span>Ссылка кнопки</span>
                      <input
                        className="admin-input"
                        value={slide.ctaHref}
                        disabled={!canUpdate || pending}
                        onChange={(e) => updateSlide(index, { ctaHref: e.target.value })}
                      />
                    </label>
                    <label className="admin-field">
                      <span>Показ с (ISO, необяз.)</span>
                      <input
                        className="admin-input"
                        value={slide.startsAt ?? ''}
                        disabled={!canUpdate || pending}
                        placeholder="2026-10-01"
                        onChange={(e) => updateSlide(index, { startsAt: e.target.value || null })}
                      />
                    </label>
                    <label className="admin-field">
                      <span>Показ до (ISO, необяз.)</span>
                      <input
                        className="admin-input"
                        value={slide.endsAt ?? ''}
                        disabled={!canUpdate || pending}
                        placeholder="2026-11-01"
                        onChange={(e) => updateSlide(index, { endsAt: e.target.value || null })}
                      />
                    </label>
                  </div>
                </div>

                {canUpdate ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="admin-btn-ghost text-xs"
                      disabled={pending || index === 0}
                      onClick={() => {
                        setSlides((prev) => moveItem(prev, index, -1));
                        markDirty();
                      }}
                    >
                      Вверх
                    </button>
                    <button
                      type="button"
                      className="admin-btn-ghost text-xs"
                      disabled={pending || index === slides.length - 1}
                      onClick={() => {
                        setSlides((prev) => moveItem(prev, index, 1));
                        markDirty();
                      }}
                    >
                      Вниз
                    </button>
                    <button
                      type="button"
                      className="admin-btn-ghost text-xs"
                      disabled={pending}
                      onClick={() => {
                        if (!window.confirm('Удалить слайд?')) return;
                        setSlides((prev) => prev.filter((_, i) => i !== index));
                        markDirty();
                      }}
                    >
                      Удалить
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab === 'tiles' ? (
        <section className="space-y-4">
          <p className="max-w-2xl text-sm text-[var(--admin-muted)]">
            Семь плиток под героем. Ссылка должна вести на существующую страницу каталога — иначе
            плитка может скрыться на витрине.
          </p>
          {tiles.length !== 7 ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Рекомендуется ровно 7 плиток (сейчас {tiles.length}).
            </p>
          ) : null}
          {canUpdate ? (
            <button
              type="button"
              className="admin-btn-ghost"
              disabled={pending}
              onClick={() => {
                setTiles((prev) => [
                  ...prev,
                  {
                    id: newId('tile'),
                    label: 'Новая плитка',
                    href: '/catalog/bouquets',
                    imageUrl: '/categories/discovery-sbornye.png',
                    imageAlt: 'Новая плитка',
                    enabled: true,
                    sortOrder: (prev.length + 1) * 10,
                  },
                ]);
                markDirty();
              }}
            >
              Добавить плитку
            </button>
          ) : null}

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
                        onChange={(e) => updateTile(index, { label: e.target.value })}
                      />
                    </label>
                    <label className="admin-field">
                      <span>Ссылка</span>
                      <input
                        className="admin-input"
                        value={tile.href}
                        disabled={!canUpdate || pending}
                        onChange={(e) => updateTile(index, { href: e.target.value })}
                      />
                    </label>
                    <label className="admin-field sm:col-span-2">
                      <span>Фото</span>
                      <input
                        className="admin-input"
                        value={tile.imageUrl}
                        disabled={!canUpdate || pending}
                        onChange={(e) => updateTile(index, { imageUrl: e.target.value })}
                      />
                    </label>
                    <label className="admin-field">
                      <span>Подпись к фото</span>
                      <input
                        className="admin-input"
                        value={tile.imageAlt}
                        disabled={!canUpdate || pending}
                        onChange={(e) => updateTile(index, { imageAlt: e.target.value })}
                      />
                    </label>
                    <label className="flex items-center gap-2 self-end pb-2 text-sm">
                      <input
                        type="checkbox"
                        checked={tile.enabled}
                        disabled={!canUpdate || pending}
                        onChange={(e) => updateTile(index, { enabled: e.target.checked })}
                      />
                      Показывать
                    </label>
                  </div>
                </div>
                {canUpdate ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="admin-btn-ghost text-xs"
                      disabled={pending || index === 0}
                      onClick={() => {
                        setTiles((prev) => moveItem(prev, index, -1));
                        markDirty();
                      }}
                    >
                      Вверх
                    </button>
                    <button
                      type="button"
                      className="admin-btn-ghost text-xs"
                      disabled={pending || index === tiles.length - 1}
                      onClick={() => {
                        setTiles((prev) => moveItem(prev, index, 1));
                        markDirty();
                      }}
                    >
                      Вниз
                    </button>
                    <button
                      type="button"
                      className="admin-btn-ghost text-xs"
                      disabled={pending}
                      onClick={() => {
                        if (!window.confirm('Удалить плитку?')) return;
                        setTiles((prev) => prev.filter((_, i) => i !== index));
                        markDirty();
                      }}
                    >
                      Удалить
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="text-sm text-[var(--admin-muted)]">
            Страницы каталога:{' '}
            <Link href="/admin/catalog/pages" className="text-[var(--admin-brand)] underline">
              Управление страницами
            </Link>
          </p>
        </section>
      ) : null}

      {tab === 'shelves' ? (
        <section className="space-y-4">
          <p className="max-w-2xl text-sm text-[var(--admin-muted)]">
            Источник товаров — существующая страница каталога или группа бестселлеров. Акции
            берутся из раздела «Акции», а не назначаются вручную здесь.
          </p>
          <ul className="space-y-4">
            {shelfSections.map((section) => (
              <li key={section.id} className="admin-card space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{section.heading || section.kind}</p>
                    <p className="text-xs text-[var(--admin-muted)]">
                      {SECTION_HINTS[section.kind] ?? section.kind}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={section.enabled}
                      disabled={!canUpdate || pending}
                      onChange={(e) => updateSection(section.id, { enabled: e.target.checked })}
                    />
                    Включена
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="admin-field">
                    <span>Заголовок</span>
                    <input
                      className="admin-input"
                      value={section.heading}
                      disabled={!canUpdate || pending}
                      onChange={(e) => updateSection(section.id, { heading: e.target.value })}
                    />
                  </label>
                  <label className="admin-field">
                    <span>Лимит карточек</span>
                    <input
                      className="admin-input"
                      type="number"
                      min={1}
                      max={48}
                      value={section.limit ?? ''}
                      disabled={!canUpdate || pending}
                      onChange={(e) =>
                        updateSection(section.id, {
                          limit: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                  </label>
                  {section.kind !== 'promotions' ? (
                    <label className="admin-field">
                      <span>Источник (slug страницы / группы)</span>
                      <input
                        className="admin-input"
                        value={section.sourceSlug ?? ''}
                        disabled={!canUpdate || pending}
                        placeholder={section.kind === 'roses' ? 'rozy' : 'bukety'}
                        onChange={(e) =>
                          updateSection(section.id, { sourceSlug: e.target.value || null })
                        }
                      />
                    </label>
                  ) : (
                    <p className="admin-help self-end sm:col-span-1">
                      Источник: действующие акции.{' '}
                      <Link href="/admin/promotions" className="underline">
                        Открыть акции
                      </Link>
                    </p>
                  )}
                  <label className="admin-field">
                    <span>Ссылка «Смотреть все»</span>
                    <input
                      className="admin-input"
                      value={section.viewAllHref ?? ''}
                      disabled={!canUpdate || pending}
                      onChange={(e) =>
                        updateSection(section.id, { viewAllHref: e.target.value || null })
                      }
                    />
                  </label>
                  {section.kind === 'autumn' ? (
                    <>
                      <label className="admin-field sm:col-span-2">
                        <span>Подпись</span>
                        <input
                          className="admin-input"
                          value={section.body ?? ''}
                          disabled={!canUpdate || pending}
                          onChange={(e) =>
                            updateSection(section.id, { body: e.target.value || null })
                          }
                        />
                      </label>
                      <label className="admin-field">
                        <span>Оформление</span>
                        <select
                          className="admin-input"
                          value={section.theme ?? 'autumn'}
                          disabled={!canUpdate || pending}
                          onChange={(e) =>
                            updateSection(section.id, {
                              theme: e.target.value === 'default' ? 'default' : 'autumn',
                            })
                          }
                        >
                          <option value="autumn">Осеннее</option>
                          <option value="default">Обычное</option>
                        </select>
                      </label>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab === 'extras' ? (
        <section className="space-y-6">
          <div className="space-y-4">
            <h2 className="text-base font-semibold">Преимущества</h2>
            <ul className="space-y-3">
              {perks.map((perk, index) => (
                <li key={perk.id} className="admin-card flex flex-wrap items-center gap-3 p-3">
                  <input
                    className="admin-input min-w-[16rem] flex-1"
                    value={perk.title}
                    disabled={!canUpdate || pending}
                    onChange={(e) => updatePerk(index, { title: e.target.value })}
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={perk.enabled}
                      disabled={!canUpdate || pending}
                      onChange={(e) => updatePerk(index, { enabled: e.target.checked })}
                    />
                    Показывать
                  </label>
                  {canUpdate ? (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="admin-btn-ghost text-xs"
                        disabled={pending || index === 0}
                        onClick={() => {
                          setPerks((prev) => moveItem(prev, index, -1));
                          markDirty();
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="admin-btn-ghost text-xs"
                        disabled={pending || index === perks.length - 1}
                        onClick={() => {
                          setPerks((prev) => moveItem(prev, index, 1));
                          markDirty();
                        }}
                      >
                        ↓
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-4">
            <h2 className="text-base font-semibold">Помощь с выбором</h2>
            {helpSections.map((section) => (
              <div key={section.id} className="admin-card space-y-3 p-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={section.enabled}
                    disabled={!canUpdate || pending}
                    onChange={(e) => updateSection(section.id, { enabled: e.target.checked })}
                  />
                  Показывать блок
                </label>
                <label className="admin-field">
                  <span>Заголовок</span>
                  <input
                    className="admin-input"
                    value={section.heading}
                    disabled={!canUpdate || pending}
                    onChange={(e) => updateSection(section.id, { heading: e.target.value })}
                  />
                </label>
                <label className="admin-field">
                  <span>Текст</span>
                  <textarea
                    className="admin-input min-h-[4.5rem]"
                    value={section.body ?? ''}
                    disabled={!canUpdate || pending}
                    onChange={(e) => updateSection(section.id, { body: e.target.value || null })}
                  />
                </label>
                <label className="admin-field">
                  <span>Фото</span>
                  <input
                    className="admin-input"
                    value={section.imageUrl ?? ''}
                    disabled={!canUpdate || pending}
                    onChange={(e) =>
                      updateSection(section.id, { imageUrl: e.target.value || null })
                    }
                  />
                </label>
              </div>
            ))}
          </div>

          <div className="rounded-md border border-[var(--admin-border)] bg-[var(--admin-bg)] p-4 text-sm text-[var(--admin-muted)]">
            <p className="font-medium text-[var(--admin-ink)]">Меню и подвал</p>
            <p className="mt-1">
              Навигация и контакты магазина настраиваются отдельно — без дублирования здесь.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/admin/storefront/navigation" className="admin-btn-ghost">
                Меню сайта
              </Link>
              <Link href="/admin/storefront/settings" className="admin-btn-ghost">
                Настройки магазина
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      <div className="admin-savebar">
        {canUpdate ? (
          <Button type="submit" disabled={pending} className="!rounded-lg !bg-[var(--admin-brand)]">
            {pending ? 'Сохранение…' : 'Сохранить изменения'}
          </Button>
        ) : (
          <p className="admin-help">Только просмотр: нет прав на изменение контента.</p>
        )}
      </div>
    </form>
  );
}

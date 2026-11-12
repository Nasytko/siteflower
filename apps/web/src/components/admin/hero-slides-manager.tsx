'use client';

import { useState, useTransition } from 'react';
import {
  homepageHeroSlidesForDisplay,
  type HomepageConfigAdminDto,
  type HomepageHeroSlideDto,
} from '@bouquet-one/contracts';
import { ImagePicker } from '@/components/admin/image-picker';
import { adminGet, adminPatch, errorMessage } from '@/lib/admin-client';
import { adminEndpoints } from '@/lib/admin-endpoints';

const LINK_OPTIONS = [
  { href: '/catalog/bouquets', label: 'Букеты' },
  { href: '/akcii', label: 'Акции' },
  { href: '/catalog/stems', label: 'Цветы поштучно' },
  { href: '/catalog/gifts', label: 'Подарки' },
  { href: '/povod', label: 'Повод' },
] as const;

type DraftSlide = {
  key: string;
  id: string;
  kicker: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  mobileImageUrl: string;
  ctaLabel: string;
  ctaHref: string;
  enabled: boolean;
  sortOrder: number;
};

type Props = {
  initial: HomepageConfigAdminDto;
  canUpdate: boolean;
};

function newKey(): string {
  return `slide-${Math.random().toString(36).slice(2, 10)}`;
}

function toDraft(slide: HomepageHeroSlideDto): DraftSlide {
  return {
    key: newKey(),
    id: slide.id,
    kicker: slide.kicker ?? '',
    title: slide.title,
    subtitle: slide.subtitle ?? '',
    imageUrl: slide.imageUrl ?? '',
    mobileImageUrl: slide.mobileImageUrl ?? '',
    ctaLabel: slide.ctaLabel,
    ctaHref: slide.ctaHref,
    enabled: slide.enabled,
    sortOrder: slide.sortOrder,
  };
}

export function HeroSlidesManager({ initial, canUpdate }: Props) {
  const [version, setVersion] = useState(initial.version);
  const [slides, setSlides] = useState<DraftSlide[]>(() =>
    homepageHeroSlidesForDisplay(initial.heroSlides).map(toDraft),
  );
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ordered = [...slides].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));

  function updateSlide(key: string, patch: Partial<DraftSlide>) {
    setSlides((prev) => prev.map((slide) => (slide.key === key ? { ...slide, ...patch } : slide)));
  }

  function move(key: string, direction: -1 | 1) {
    const list = [...ordered];
    const index = list.findIndex((slide) => slide.key === key);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= list.length) return;
    const reordered = [...list];
    const [item] = reordered.splice(index, 1);
    reordered.splice(next, 0, item!);
    setSlides(
      reordered.map((slide, order) => ({
        ...slide,
        sortOrder: (order + 1) * 10,
      })),
    );
  }

  function addSlide() {
    if (slides.length >= 3) return;
    setSlides((prev) => [
      ...prev,
      {
        key: newKey(),
        id: newKey(),
        kicker: 'Скидка',
        title: 'Новый кадр',
        subtitle: 'Коротко напишите, зачем перейти.',
        imageUrl: '',
        mobileImageUrl: '',
        ctaLabel: 'Смотреть',
        ctaHref: '/akcii',
        enabled: true,
        sortOrder: (prev.length + 1) * 10,
      },
    ]);
  }

  function removeSlide(key: string) {
    if (slides.length <= 2) return;
    setSlides((prev) => prev.filter((slide) => slide.key !== key));
  }

  function save() {
    const missing = ordered.find((slide) => slide.enabled && !slide.imageUrl.trim());
    if (missing) {
      setError(`У кадра «${missing.title || 'без названия'}» нет фото.`);
      return;
    }
    const emptyTitle = ordered.find((slide) => !slide.title.trim() || !slide.ctaLabel.trim());
    if (emptyTitle) {
      setError('У каждого кадра нужны заголовок и текст кнопки.');
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const updated = await adminPatch<HomepageConfigAdminDto>(adminEndpoints.homepageHeroSlides, {
          expectedVersion: version,
          heroSlides: ordered.map((slide, index) => ({
            id: slide.id,
            kicker: slide.kicker.trim() || null,
            title: slide.title.trim(),
            subtitle: slide.subtitle.trim(),
            imageUrl: slide.imageUrl.trim() || null,
            mobileImageUrl: slide.mobileImageUrl.trim() || null,
            ctaLabel: slide.ctaLabel.trim(),
            ctaHref: slide.ctaHref.trim() || '/catalog/bouquets',
            enabled: slide.enabled,
            sortOrder: (index + 1) * 10,
          })),
        });
        setVersion(updated.version);
        setSlides(homepageHeroSlidesForDisplay(updated.heroSlides).map(toDraft));
        setSavedAt(new Date().toISOString());
      } catch (err) {
        const fresh = await adminGet<HomepageConfigAdminDto>(adminEndpoints.homepage).catch(
          () => null,
        );
        if (fresh) setVersion(fresh.version);
        setError(errorMessage(err));
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm text-[var(--admin-muted)]">
          Два или три широких фото. На снимке — короткая надпись, заголовок и кнопка. Для акции
          напишите «Скидка» и ведите на страницу акций.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            disabled={!canUpdate || pending || slides.length >= 3}
            onClick={addSlide}
          >
            Добавить кадр
          </button>
          <button type="button" className="admin-btn" disabled={!canUpdate || pending} onClick={save}>
            {pending ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>

      {savedAt ? (
        <p className="text-xs text-muted">Сохранено {new Date(savedAt).toLocaleTimeString('ru-BY')}</p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <ol className="space-y-4">
        {ordered.map((slide, index) => {
          const knownLink = LINK_OPTIONS.some((option) => option.href === slide.ctaHref);
          return (
            <li key={slide.key} className="admin-card space-y-4 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">Кадр {index + 1}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={slide.enabled}
                      disabled={!canUpdate || pending}
                      onChange={(event) => updateSlide(slide.key, { enabled: event.target.checked })}
                    />
                    Показывать
                  </label>
                  <button
                    type="button"
                    className="admin-btn admin-btn--ghost"
                    disabled={!canUpdate || pending || index === 0}
                    onClick={() => move(slide.key, -1)}
                  >
                    Выше
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn--ghost"
                    disabled={!canUpdate || pending || index === ordered.length - 1}
                    onClick={() => move(slide.key, 1)}
                  >
                    Ниже
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn--ghost"
                    disabled={!canUpdate || pending || slides.length <= 2}
                    onClick={() => removeSlide(slide.key)}
                  >
                    Удалить
                  </button>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
                <div className="space-y-3">
                  <ImagePicker
                    label="Фото кадра"
                    value={slide.imageUrl || null}
                    disabled={!canUpdate || pending}
                    onChange={(url) => updateSlide(slide.key, { imageUrl: url ?? '' })}
                  />
                  <ImagePicker
                    label="Фото для телефона, если нужно другое"
                    value={slide.mobileImageUrl || null}
                    disabled={!canUpdate || pending}
                    onChange={(url) => updateSlide(slide.key, { mobileImageUrl: url ?? '' })}
                  />
                </div>

                <div className="grid gap-3">
                  <label className="grid gap-1 text-sm">
                    <span>Надпись на фото</span>
                    <input
                      className="admin-input"
                      value={slide.kicker}
                      maxLength={80}
                      disabled={!canUpdate || pending}
                      placeholder="Скидка"
                      onChange={(event) => updateSlide(slide.key, { kicker: event.target.value })}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span>Заголовок</span>
                    <input
                      className="admin-input"
                      value={slide.title}
                      maxLength={200}
                      disabled={!canUpdate || pending}
                      onChange={(event) => updateSlide(slide.key, { title: event.target.value })}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span>Короткий текст</span>
                    <textarea
                      className="admin-input min-h-16"
                      value={slide.subtitle}
                      maxLength={500}
                      disabled={!canUpdate || pending}
                      onChange={(event) => updateSlide(slide.key, { subtitle: event.target.value })}
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-sm">
                      <span>Текст кнопки</span>
                      <input
                        className="admin-input"
                        value={slide.ctaLabel}
                        maxLength={80}
                        disabled={!canUpdate || pending}
                        onChange={(event) => updateSlide(slide.key, { ctaLabel: event.target.value })}
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span>Куда ведёт кнопка</span>
                      <select
                        className="admin-input"
                        value={knownLink ? slide.ctaHref : 'custom'}
                        disabled={!canUpdate || pending}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (value !== 'custom') updateSlide(slide.key, { ctaHref: value });
                          else if (knownLink) updateSlide(slide.key, { ctaHref: '/' });
                        }}
                      >
                        {LINK_OPTIONS.map((option) => (
                          <option key={option.href} value={option.href}>
                            {option.label}
                          </option>
                        ))}
                        <option value="custom">Своя ссылка</option>
                      </select>
                    </label>
                  </div>
                  {knownLink ? null : (
                    <label className="grid gap-1 text-sm">
                      <span>Своя ссылка</span>
                      <input
                        className="admin-input"
                        value={slide.ctaHref}
                        maxLength={500}
                        disabled={!canUpdate || pending}
                        placeholder="/akcii"
                        onChange={(event) => updateSlide(slide.key, { ctaHref: event.target.value })}
                      />
                    </label>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  HOMEPAGE_SECTION_KINDS,
  type HomepageConfigAdminDto,
  type HomepageSectionDto,
  type HomepageSectionKind,
} from '@bouquet-one/contracts';
import { Button } from '@bouquet-one/ui';
import { adminPatch, errorMessage } from '@/lib/admin-client';
import { adminEndpoints } from '@/lib/admin-endpoints';
import { homepageSectionLabel } from '@/lib/admin-labels';

type Props = {
  initial: HomepageConfigAdminDto;
  canUpdate: boolean;
};

const SECTION_HINTS: Record<HomepageSectionKind, string> = {
  bestsellers: 'Товары из подборок раздела «Бестселлеры»',
  promotions: 'Товары с активной акцией',
  gifts: 'Блок главной: товары из группы «Подарки» (Бестселлеры → slug podarki)',
  instagram: 'Кураторская лента из раздела «Instagram»',
  occasions: 'Плитка поводов для подбора',
  recipients: 'Плитка «кому» для подбора',
  discovery: 'Подбор по бюджету, цвету и размеру',
  help: 'Блок «не знаете, что выбрать»',
  delivery: 'Условия доставки по Гродно',
};

function sortSections(sections: HomepageSectionDto[]): HomepageSectionDto[] {
  return [...sections].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

export function HomepageEditor({ initial, canUpdate }: Props) {
  const router = useRouter();
  const [version, setVersion] = useState(initial.version);
  const [hero, setHero] = useState(initial.hero);
  const [sections, setSections] = useState<HomepageSectionDto[]>(() =>
    sortSections(initial.sections),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const unusedKinds = HOMEPAGE_SECTION_KINDS.filter(
    (kind) => !sections.some((section) => section.kind === kind),
  );

  function updateSection(index: number, patch: Partial<HomepageSectionDto>) {
    setSections((prev) =>
      prev.map((section, i) => (i === index ? { ...section, ...patch } : section)),
    );
    setSavedAt(null);
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;
    setSections((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved!);
      return next;
    });
    setSavedAt(null);
  }

  function addSection(kind: HomepageSectionKind) {
    setSections((prev) => [
      ...prev,
      {
        id: kind,
        kind,
        enabled: true,
        heading: homepageSectionLabel(kind),
        sortOrder: (prev.length + 1) * 10,
      },
    ]);
    setSavedAt(null);
  }

  function removeSection(index: number) {
    setSections((prev) => prev.filter((_, i) => i !== index));
    setSavedAt(null);
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!canUpdate) return;
    setPending(true);
    setError(null);
    setSavedAt(null);
    try {
      const updated = await adminPatch<HomepageConfigAdminDto>(adminEndpoints.homepage, {
        expectedVersion: version,
        hero: {
          title: hero.title.trim(),
          subtitle: hero.subtitle.trim(),
          imageUrl: hero.imageUrl?.trim() ? hero.imageUrl.trim() : null,
          ctaLabel: hero.ctaLabel.trim(),
          ctaHref: hero.ctaHref.trim(),
        },
        sections: sections.map((section, index) => ({
          id: section.id.trim(),
          kind: section.kind,
          enabled: section.enabled,
          heading: section.heading.trim(),
          sortOrder: (index + 1) * 10,
        })),
      });
      setVersion(updated.version);
      setHero(updated.hero);
      setSections(sortSections(updated.sections));
      setSavedAt(new Date().toLocaleTimeString('ru-BY'));
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось сохранить главную'));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSave} className="space-y-8">
      {error ? (
        <p role="alert" className="admin-error">
          {error}
        </p>
      ) : null}

      <section className="admin-section">
        <h2 className="admin-section__title">Первый экран</h2>
        <div className="grid max-w-3xl gap-4 md:grid-cols-2">
          <label className="admin-field md:col-span-2">
            <span>Заголовок</span>
            <input
              required
              className="admin-input"
              disabled={!canUpdate}
              value={hero.title}
              onChange={(event) => setHero((prev) => ({ ...prev, title: event.target.value }))}
            />
          </label>
          <label className="admin-field md:col-span-2">
            <span>Подзаголовок</span>
            <textarea
              required
              rows={2}
              className="admin-input"
              disabled={!canUpdate}
              value={hero.subtitle}
              onChange={(event) => setHero((prev) => ({ ...prev, subtitle: event.target.value }))}
            />
          </label>
          <label className="admin-field md:col-span-2">
            <span>Фоновое изображение</span>
            <input
              className="admin-input"
              disabled={!canUpdate}
              value={hero.imageUrl ?? ''}
              placeholder="/media/… или https://…"
              onChange={(event) =>
                setHero((prev) => ({
                  ...prev,
                  imageUrl: event.target.value.length > 0 ? event.target.value : null,
                }))
              }
            />
          </label>
          <label className="admin-field">
            <span>Надпись на кнопке</span>
            <input
              required
              className="admin-input"
              disabled={!canUpdate}
              value={hero.ctaLabel}
              onChange={(event) => setHero((prev) => ({ ...prev, ctaLabel: event.target.value }))}
            />
          </label>
          <label className="admin-field">
            <span>Ссылка кнопки</span>
            <input
              required
              className="admin-input"
              disabled={!canUpdate}
              value={hero.ctaHref}
              onChange={(event) => setHero((prev) => ({ ...prev, ctaHref: event.target.value }))}
            />
          </label>
        </div>
      </section>

      <section className="admin-section">
        <h2 className="admin-section__title">Блоки главной</h2>
        <p className="admin-section__lead">
          Порядок блоков сверху вниз повторяет порядок на витрине.
        </p>

        <div className="admin-panel overflow-x-auto">
          <table className="admin-table min-w-[820px]">
            <thead>
              <tr>
                <th className="w-24">Порядок</th>
                <th className="w-56">Блок</th>
                <th>Заголовок на витрине</th>
                <th className="w-28">Показывать</th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody>
              {sections.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <p className="admin-empty">Блоки не выбраны</p>
                  </td>
                </tr>
              ) : (
                sections.map((section, index) => (
                  <tr key={section.id} className={section.enabled ? '' : 'admin-row--muted'}>
                    <td>
                      <div className="admin-row-actions">
                        <button
                          type="button"
                          className="admin-icon-btn"
                          aria-label="Выше"
                          disabled={!canUpdate || index === 0}
                          onClick={() => move(index, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="admin-icon-btn"
                          aria-label="Ниже"
                          disabled={!canUpdate || index === sections.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          ↓
                        </button>
                      </div>
                    </td>
                    <td>
                      <p className="font-semibold text-[var(--admin-ink)]">
                        {homepageSectionLabel(section.kind)}
                      </p>
                      <p className="text-xs text-[var(--admin-muted)]">
                        {SECTION_HINTS[section.kind]}
                      </p>
                    </td>
                    <td>
                      <input
                        required
                        className="admin-input"
                        aria-label="Заголовок блока"
                        disabled={!canUpdate}
                        value={section.heading}
                        onChange={(event) => updateSection(index, { heading: event.target.value })}
                      />
                    </td>
                    <td>
                      <label className="admin-check">
                        <input
                          type="checkbox"
                          disabled={!canUpdate}
                          checked={section.enabled}
                          onChange={(event) =>
                            updateSection(index, { enabled: event.target.checked })
                          }
                        />
                        {section.enabled ? 'Да' : 'Нет'}
                      </label>
                    </td>
                    <td>
                      {canUpdate ? (
                        <button
                          type="button"
                          className="admin-btn-ghost"
                          onClick={() => removeSection(index)}
                        >
                          Убрать
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {canUpdate && unusedKinds.length > 0 ? (
          <div className="admin-toolbar">
            <label className="admin-field">
              <span>Добавить блок</span>
              <select
                className="admin-select"
                value=""
                onChange={(event) => {
                  const kind = event.target.value as HomepageSectionKind;
                  if (kind) addSection(kind);
                }}
              >
                <option value="">Выберите блок</option>
                {unusedKinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {homepageSectionLabel(kind)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </section>

      <div className="admin-savebar">
        {canUpdate ? (
          <Button type="submit" disabled={pending} className="!rounded-lg !bg-[var(--admin-brand)]">
            {pending ? 'Сохранение…' : 'Сохранить'}
          </Button>
        ) : (
          <p className="admin-help">Только просмотр: нет прав на изменение витрины.</p>
        )}
        {savedAt ? (
          <span className="text-sm text-[var(--admin-muted)]">Сохранено в {savedAt}</span>
        ) : null}
      </div>
    </form>
  );
}

'use client';

import {
  COMMERCIAL_AVAILABILITIES,
  DEFAULT_PRODUCT_VARIANT_NAME,
  normalizeSlug,
  suggestProductNameFromComposition,
  type CommercialAvailability,
  type ProductAdminDto,
} from '@bouquet-one/contracts';
import { availabilityLabel, lifecycleLabel } from '@/lib/admin-labels';
import { availabilityChipClass, lifecycleChipClass } from '@/lib/admin-status';
import type { ComponentDraft, VariantDraft } from '@/components/admin/product-editor-shared';

export type {
  ComponentDraft,
  CompositionHit,
  VariantDraft,
} from '@/components/admin/product-editor-shared';

type Props = {
  server: ProductAdminDto;
  canUpdate: boolean;
  canPublish: boolean;
  pending: boolean;
  basic: {
    name: string;
    slug: string;
    shortDescription: string;
    description: string;
    heightCm: string;
    diameterCm: string;
  };
  setBasic: React.Dispatch<
    React.SetStateAction<{
      name: string;
      slug: string;
      shortDescription: string;
      description: string;
      heightCm: string;
      diameterCm: string;
    }>
  >;
  slugManual: boolean;
  setSlugManual: (value: boolean) => void;
  components: ComponentDraft[];
  variants: VariantDraft[];
  setVariants: React.Dispatch<React.SetStateAction<VariantDraft[]>>;
  publication: {
    availability: CommercialAvailability;
    publishAt: string;
    unpublishAt: string;
  };
  setPublication: React.Dispatch<
    React.SetStateAction<{
      availability: CommercialAvailability;
      publishAt: string;
      unpublishAt: string;
    }>
  >;
  hasPrimaryImage: boolean;
  mediaCount: number;
  onGoPhotos: () => void;
  onGoExtraVariants: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onArchive: () => void;
  touch: () => void;
};

export function ProductEditorMainTab(props: Props) {
  const {
    server,
    canUpdate,
    canPublish,
    pending,
    basic,
    setBasic,
    slugManual,
    setSlugManual,
    components,
    variants,
    setVariants,
    publication,
    setPublication,
    hasPrimaryImage,
    mediaCount,
    onGoPhotos,
    onGoExtraVariants,
    onPublish,
    onUnpublish,
    onArchive,
    touch,
  } = props;

  const commercialNamePreview = suggestProductNameFromComposition(
    components.map((row) => ({
      displayName: row.displayName,
      quantity: row.quantity.trim() ? Number(row.quantity) : null,
      typeName: row.typeName,
      varietyName: row.varietyName,
    })),
  );

  const simplePrice = variants[0];
  const multiSize = variants.length > 1;

  return (
    <section className="admin-section space-y-6">
      <div>
        <h2 className="admin-section__title">Основное</h2>
        <p className="admin-section__lead">
          Название, цена и статус. Состав, подбор и расширенные настройки — в соседних вкладках.
        </p>
      </div>

      <div className="grid max-w-2xl gap-4">
        <label className="admin-field">
          <span>Название</span>
          <input
            className="admin-input"
            value={basic.name}
            disabled={!canUpdate}
            onChange={(event) => {
              const name = event.target.value;
              setBasic((prev) => ({
                ...prev,
                name,
                ...(slugManual ? {} : { slug: normalizeSlug(name) }),
              }));
              touch();
            }}
          />
          {commercialNamePreview.length > 0 && commercialNamePreview !== basic.name.trim() ? (
            <span className="admin-field__hint flex flex-wrap items-center gap-2">
              Предложение из состава:{' '}
              <strong className="text-[var(--admin-ink)]">{commercialNamePreview}</strong>
              {canUpdate ? (
                <button
                  type="button"
                  className="admin-btn-ghost px-2 py-0.5 text-xs"
                  onClick={() => {
                    setBasic((prev) => ({
                      ...prev,
                      name: commercialNamePreview,
                      ...(slugManual ? {} : { slug: normalizeSlug(commercialNamePreview) }),
                    }));
                    touch();
                  }}
                >
                  Подставить
                </button>
              ) : null}
            </span>
          ) : null}
        </label>

        <label className="admin-field">
          <span>Адрес в ссылке</span>
          <input
            className="admin-input"
            value={basic.slug}
            disabled={!canUpdate}
            onChange={(event) => {
              setSlugManual(true);
              setBasic((prev) => ({ ...prev, slug: event.target.value }));
              touch();
            }}
          />
          <span className="admin-field__hint">/bukety/{basic.slug || '…'}</span>
        </label>

        <div className="admin-subsection space-y-3">
          <h3 className="admin-subsection__title">
            {multiSize ? 'Цена (несколько размеров)' : 'Цена товара'}
          </h3>
          {multiSize ? (
            <div className="space-y-2">
              <ul className="space-y-1 text-sm">
                {variants.map((variant) => (
                  <li key={variant.key}>
                    {variant.name || DEFAULT_PRODUCT_VARIANT_NAME}:{' '}
                    {variant.priceMajor.trim() ? `${variant.priceMajor} BYN` : 'цена не указана'}
                  </li>
                ))}
              </ul>
              <button type="button" className="admin-link text-sm" onClick={onGoExtraVariants}>
                Изменить размеры и цены
              </button>
            </div>
          ) : (
            <label className="admin-field max-w-xs">
              <span>{simplePrice?.name || DEFAULT_PRODUCT_VARIANT_NAME}</span>
              <input
                className="admin-input tabular-nums"
                value={simplePrice?.priceMajor ?? ''}
                disabled={!canUpdate}
                inputMode="decimal"
                placeholder="Укажите цену"
                onChange={(event) => {
                  const value = event.target.value;
                  setVariants((prev) =>
                    prev.map((item, i) => (i === 0 ? { ...item, priceMajor: value } : item)),
                  );
                  touch();
                }}
              />
              <span className="admin-field__hint">BYN</span>
            </label>
          )}
          {canUpdate && !multiSize ? (
            <button type="button" className="admin-btn-ghost" onClick={onGoExtraVariants}>
              + Несколько размеров (7 шт / 15 шт)
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-[var(--admin-muted)]">Фото:</span>
          {hasPrimaryImage ? (
            <span>
              ✓ основное · {mediaCount} из 12
            </span>
          ) : (
            <span className="text-amber-800">
              нет основного фото{mediaCount > 0 ? ` · ${mediaCount} загружено` : ''}
            </span>
          )}
          <button type="button" className="admin-link" onClick={onGoPhotos}>
            {hasPrimaryImage ? 'Управление фото' : 'Добавить'}
          </button>
        </div>

        <div className="admin-subsection space-y-3">
          <h3 className="admin-subsection__title">Статус</h3>
          <p className="admin-status-row text-sm">
            <span className={lifecycleChipClass(server.lifecycle)}>
              {lifecycleLabel(server.lifecycle)}
            </span>
            <span className={availabilityChipClass(publication.availability)}>
              {availabilityLabel(publication.availability)}
            </span>
          </p>
          <label className="admin-field max-w-sm">
            <span>Наличие</span>
            <select
              className="admin-select"
              value={publication.availability}
              disabled={!canUpdate}
              onChange={(event) => {
                setPublication((prev) => ({
                  ...prev,
                  availability: event.target.value as CommercialAvailability,
                }));
                touch();
              }}
            >
              {COMMERCIAL_AVAILABILITIES.map((value) => (
                <option key={value} value={value}>
                  {availabilityLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {canPublish ? (
              <>
                <button
                  type="button"
                  className="admin-btn"
                  disabled={pending || server.lifecycle === 'PUBLISHED'}
                  onClick={onPublish}
                >
                  Опубликовать
                </button>
                <button
                  type="button"
                  className="admin-btn-ghost"
                  disabled={pending || server.lifecycle !== 'PUBLISHED'}
                  onClick={onUnpublish}
                >
                  Снять с витрины
                </button>
                <button
                  type="button"
                  className="admin-btn-ghost"
                  disabled={pending || server.lifecycle === 'ARCHIVED'}
                  onClick={onArchive}
                >
                  В архив
                </button>
              </>
            ) : (
              <p className="admin-help">Публикацией управляет роль с правом публикации.</p>
            )}
          </div>
        </div>

        <label className="admin-field">
          <span>Короткое описание</span>
          <textarea
            className="admin-input"
            rows={2}
            value={basic.shortDescription}
            disabled={!canUpdate}
            onChange={(event) => {
              setBasic((prev) => ({ ...prev, shortDescription: event.target.value }));
              touch();
            }}
          />
        </label>
      </div>
    </section>
  );
}

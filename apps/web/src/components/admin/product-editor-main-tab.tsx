'use client';

import {
  COMMERCIAL_AVAILABILITIES,
  DEFAULT_PRODUCT_VARIANT_NAME,
  PRIMARY_PRODUCT_KINDS,
  PRODUCT_KINDS,
  normalizeSlug,
  productKindNeedsGiftSubtype,
  suggestProductNameFromComposition,
  type CommercialAvailability,
  type ProductAdminDto,
  type ProductKind,
} from '@bouquet-one/contracts';
import { ProductPlacementPanel } from '@/components/admin/product-placement-panel';
import { TaxonomyQuickPick } from '@/components/admin/taxonomy-quick-pick';
import type { ComponentDraft, PickerOption, VariantDraft } from '@/components/admin/product-editor-shared';
import type { CategoryPickerOption } from '@/lib/admin-catalog-picker-labels';
import { giftSubtypeOptions } from '@/lib/admin-catalog-picker-labels';
import { availabilityLabel, lifecycleLabel, productKindLabel } from '@/lib/admin-labels';
import { availabilityChipClass, lifecycleChipClass } from '@/lib/admin-status';

export type {
  ComponentDraft,
  CompositionHit,
  VariantDraft,
} from '@/components/admin/product-editor-shared';

type ColorOption = PickerOption & { swatch?: string | null };

type Props = {
  server: ProductAdminDto;
  canUpdate: boolean;
  canCreate: boolean;
  canPublish: boolean;
  pending: boolean;
  productKind: ProductKind;
  setProductKind: (value: ProductKind) => void;
  basic: {
    name: string;
    slug: string;
    shortDescription: string;
    badgeLabel: string;
    description: string;
    heightCm: string;
  };
  setBasic: React.Dispatch<
    React.SetStateAction<{
      name: string;
      slug: string;
      shortDescription: string;
      badgeLabel: string;
      description: string;
      heightCm: string;
    }>
  >;
  slugManual: boolean;
  components: ComponentDraft[];
  variants: VariantDraft[];
  setVariants: React.Dispatch<React.SetStateAction<VariantDraft[]>>;
  catalogCategoryId: string;
  setCatalogCategoryId: (value: string) => void;
  categories: CategoryPickerOption[];
  discovery: {
    occasionIds: string[];
    recipientIds: string[];
    colorIds: string[];
    traitKeys: string[];
  };
  setDiscovery: React.Dispatch<
    React.SetStateAction<{
      occasionIds: string[];
      recipientIds: string[];
      colorIds: string[];
      traitKeys: string[];
    }>
  >;
  occasions: PickerOption[];
  recipients: PickerOption[];
  colors: ColorOption[];
  traitOptions: Array<{ key: string; name: string; description: string | null }>;
  onTaxonomyCreated: (
    kind: 'occasions' | 'recipients' | 'colors',
    item: ColorOption,
  ) => void;
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
    canCreate,
    canPublish,
    pending,
    productKind,
    setProductKind,
    basic,
    setBasic,
    slugManual,
    components,
    variants,
    setVariants,
    catalogCategoryId,
    setCatalogCategoryId,
    categories,
    discovery,
    setDiscovery,
    occasions,
    recipients,
    colors,
    traitOptions,
    onTaxonomyCreated,
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
          Что продаём, название, цена и описание. Раздел каталога определяется типом автоматически —
          категорию «Розы» выбирать не нужно.
        </p>
      </div>

      <div className="grid max-w-2xl gap-4">
        <label className="admin-field" data-section="productKind">
          <span>Что продаём?</span>
          <select
            className="admin-select"
            value={productKind}
            disabled={!canUpdate}
            onChange={(event) => setProductKind(event.target.value as ProductKind)}
          >
            {PRIMARY_PRODUCT_KINDS.map((value) => (
              <option key={value} value={value}>
                {productKindLabel(value)}
              </option>
            ))}
            {(PRODUCT_KINDS as readonly ProductKind[])
              .filter((value) => !(PRIMARY_PRODUCT_KINDS as readonly string[]).includes(value))
              .map((value) => (
                <option key={value} value={value}>
                  {productKindLabel(value)}
                </option>
              ))}
          </select>
          <span className="admin-field__hint">
            Букет / композиция / поштучно / подарок. Характеристики состава и разделы «Розы»,
            «Монобукеты» считаются сами.
          </span>
        </label>

        <label className="admin-field" data-section="name">
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

        {productKindNeedsGiftSubtype(productKind) ? (
          <label className="admin-field" data-section="category">
            <span>Подтип подарка</span>
            <select
              className="admin-select"
              value={
                giftSubtypeOptions(categories).some((option) => option.id === catalogCategoryId)
                  ? catalogCategoryId
                  : ''
              }
              disabled={!canUpdate}
              onChange={(event) => {
                setCatalogCategoryId(event.target.value);
                touch();
              }}
            >
              <option value="">Без подтипа (раздел «Подарки»)</option>
              {giftSubtypeOptions(categories).map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
            <span className="admin-field__hint">
              Опционально: открытки, свечи и другие ветки раздела «Подарки». Тип товара уже
              «Подарок».
            </span>
          </label>
        ) : null}

        <div className="admin-subsection space-y-3" data-section="price">
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

        <div className="flex flex-wrap items-center gap-3 text-sm" data-section="photo">
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

        <label className="admin-field" data-section="shortDescription">
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

        <label className="admin-field" data-section="badgeLabel">
          <span>Бейдж на карточке товара</span>
          <input
            className="admin-input"
            maxLength={40}
            placeholder="Например: Хит сезона"
            value={basic.badgeLabel}
            disabled={!canUpdate}
            onChange={(event) => {
              setBasic((prev) => ({ ...prev, badgeLabel: event.target.value }));
              touch();
            }}
          />
          <small className="admin-help">Рядом с «В наличии». Пусто — бейдж не показывается.</small>
        </label>

        <label className="admin-field" data-section="description">
          <span>Полное описание</span>
          <textarea
            className="admin-input"
            rows={5}
            value={basic.description}
            disabled={!canUpdate}
            onChange={(event) => {
              setBasic((prev) => ({ ...prev, description: event.target.value }));
              touch();
            }}
          />
        </label>

        <div className="grid gap-4 lg:grid-cols-2">
          <TaxonomyQuickPick
            kind="occasions"
            legend="Повод"
            options={occasions}
            selectedIds={discovery.occasionIds}
            canCreate={canCreate}
            canUpdate={canUpdate}
            onChange={(ids) => {
              setDiscovery((prev) => ({ ...prev, occasionIds: ids }));
              touch();
            }}
            onCreated={(item) => onTaxonomyCreated('occasions', item)}
          />
          <TaxonomyQuickPick
            kind="recipients"
            legend="Кому"
            options={recipients}
            selectedIds={discovery.recipientIds}
            canCreate={canCreate}
            canUpdate={canUpdate}
            onChange={(ids) => {
              setDiscovery((prev) => ({ ...prev, recipientIds: ids }));
              touch();
            }}
            onCreated={(item) => onTaxonomyCreated('recipients', item)}
          />
        </div>

        <div className="admin-subsection space-y-3" data-section="traits">
          <h3 className="admin-subsection__title">Особенности</h3>
          <p className="text-xs text-[var(--admin-muted)]">
            Признаки, которые нельзя вывести из состава. Отметьте один раз — товар попадёт на
            все опубликованные страницы с этим правилом.
          </p>
          {traitOptions.length === 0 ? (
            <p className="text-sm text-[var(--admin-muted)]">Справочник признаков пока пуст.</p>
          ) : (
            <ul className="space-y-2">
              {traitOptions.map((trait) => {
                const checked = discovery.traitKeys.includes(trait.key);
                return (
                  <li key={trait.key}>
                    <label className="flex cursor-pointer items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={checked}
                        disabled={!canUpdate}
                        onChange={() => {
                          setDiscovery((prev) => ({
                            ...prev,
                            traitKeys: checked
                              ? prev.traitKeys.filter((k) => k !== trait.key)
                              : [...prev.traitKeys, trait.key],
                          }));
                          touch();
                        }}
                      />
                      <span>
                        <span className="font-medium">{trait.name}</span>
                        {trait.description ? (
                          <span className="block text-xs text-[var(--admin-muted)]">
                            {trait.description}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <details className="admin-subsection space-y-3">
          <summary className="cursor-pointer text-sm font-medium text-[var(--admin-ink)]">
            Цветовая гамма букета (необязательно)
          </summary>
          <p className="text-xs text-[var(--admin-muted)]">
            Основной цвет задаётся у каждого цветка в справочнике и составе. Здесь — только
            расширенная гамма для SEO-фильтров и подборок, если нужна точнее.
          </p>
          <TaxonomyQuickPick
            kind="colors"
            legend="Гамма для фильтров"
            options={colors}
            selectedIds={discovery.colorIds}
            canCreate={canCreate}
            canUpdate={canUpdate}
            onChange={(ids) => {
              setDiscovery((prev) => ({ ...prev, colorIds: ids }));
              touch();
            }}
            onCreated={(item) => onTaxonomyCreated('colors', item)}
          />
        </details>

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
      </div>

      <ProductPlacementPanel productId={server.id} refreshKey={server.version} />
    </section>
  );
}

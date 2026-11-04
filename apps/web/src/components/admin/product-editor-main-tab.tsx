'use client';

import {
  COMMERCIAL_AVAILABILITIES,
  PRIMARY_PRODUCT_KINDS,
  PRODUCT_KINDS,
  normalizeSlug,
  productKindNeedsGiftSubtype,
  suggestProductNameFromComposition,
  type CommercialAvailability,
  type ProductAdminDto,
  type ProductKind,
} from '@bouquet-one/contracts';
import { TaxonomyQuickPick } from '@/components/admin/taxonomy-quick-pick';
import type { ComponentDraft, PickerOption, VariantDraft } from '@/components/admin/product-editor-shared';
import type { CategoryPickerOption } from '@/lib/admin-catalog-picker-labels';
import { giftSubtypeOptions } from '@/lib/admin-catalog-picker-labels';
import { availabilityLabel, productKindLabel } from '@/lib/admin-labels';

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
    erpSku: string;
    shortDescription: string;
    badgeLabel: string;
    description: string;
    heightCm: string;
  };
  setBasic: React.Dispatch<
    React.SetStateAction<{
      name: string;
      slug: string;
      erpSku: string;
      shortDescription: string;
      badgeLabel: string;
      description: string;
      heightCm: string;
    }>
  >;
  slugManual: boolean;
  nameManual?: boolean;
  onNameTyped?: () => void;
  blocks?: Array<'kind' | 'identity' | 'copy' | 'audience'>;
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
  /** Legacy DB `description` differs from the editable short field — do not auto-merge. */
  legacyDescriptionConflict?: boolean;
};

export function ProductEditorMainTab(props: Props) {
  const {
    server: _server,
    canUpdate,
    canCreate,
    canPublish: _canPublish,
    pending: _pending,
    productKind,
    setProductKind,
    basic,
    setBasic,
    slugManual,
    onNameTyped,
    blocks = ['kind', 'identity', 'copy', 'audience'],
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
    legacyDescriptionConflict = false,
    onPublish: _onPublish,
    onUnpublish: _onUnpublish,
    onArchive: _onArchive,
    touch,
  } = props;

  const commercialNamePreview = suggestProductNameFromComposition(
    components.map((row) => ({
      displayName: row.displayName,
      typeName: row.typeName,
      varietyName: row.varietyName,
    })),
  );

  const simplePrice = variants[0];
  const multiSize = variants.length > 1;
  const show = (block: (typeof blocks)[number]) => blocks.includes(block);

  return (
    <div className="space-y-4">
      {show('kind') ? (
        <section className="sf-pe-card">
          <div className="sf-pe-card__head">
            <div>
              <h2>Тип товара</h2>
            </div>
          </div>
          <div className="sf-pe-card__body">
            <div className="sf-pe-kind sf-pe-kind--compact" role="group" aria-label="Тип товара">
              {PRIMARY_PRODUCT_KINDS.filter((value) => value === 'BOUQUET' || value === 'STEM').map(
                (value) => (
                  <button
                    key={value}
                    type="button"
                    className={`sf-pe-kind__chip ${productKind === value ? 'sf-pe-kind__chip--active' : ''}`}
                    disabled={!canUpdate}
                    aria-pressed={productKind === value}
                    onClick={() => setProductKind(value)}
                  >
                    {productKindLabel(value)}
                  </button>
                ),
              )}
            </div>
            <label className="admin-field mt-3 max-w-xs">
              <span>Другой тип</span>
              <select
                className="admin-select"
                value={productKind === 'BOUQUET' || productKind === 'STEM' ? '' : productKind}
                disabled={!canUpdate}
                onChange={(event) => {
                  const next = event.target.value as ProductKind | '';
                  if (next) setProductKind(next);
                }}
              >
                <option value="">—</option>
                {(PRODUCT_KINDS as readonly ProductKind[])
                  .filter((value) => value !== 'BOUQUET' && value !== 'STEM')
                  .map((value) => (
                    <option key={value} value={value}>
                      {productKindLabel(value)}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        </section>
      ) : null}

      {show('identity') ? (
      <section className="sf-pe-card">
        <div className="sf-pe-card__head">
          <div>
            <h2>Название и цена</h2>
            <p className="sf-pe-card__lead">
              {productKind === 'STEM' ? 'Цена за одну ветку.' : 'Можно поправить название вручную.'}
            </p>
          </div>
        </div>
        <div className="sf-pe-card__body grid max-w-2xl gap-4">
        <label className="admin-field" data-section="name">
          <span>Название</span>
          <input
            className="admin-input"
            value={basic.name}
            disabled={!canUpdate}
            onChange={(event) => {
              const name = event.target.value;
              onNameTyped?.();
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

        <label className="admin-field" data-section="erpSku">
          <span>Артикул ERP</span>
          <input
            className="admin-input"
            value={basic.erpSku}
            disabled={!canUpdate}
            placeholder="Например: BQ-1042"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setBasic((prev) => ({ ...prev, erpSku: event.target.value }));
              touch();
            }}
          />
          <span className="admin-field__hint">Из ERP, вручную. Без артикула публиковать можно.</span>
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
            <span className="admin-field__hint">Открытки, свечи и другие ветки «Подарков».</span>
          </label>
        ) : null}

        <div className="admin-subsection space-y-3" data-section="price">
          <h3 className="admin-subsection__title">
            {multiSize ? 'Цена (несколько размеров)' : 'Цена товара'}
          </h3>
          {multiSize ? (
            <p className="admin-help">
              У этого товара несколько размеров из старой системы. На витрине действует первая
              активная цена. Новые размеры создавайте отдельными связанными товарами.
            </p>
          ) : null}
            <label className="admin-field max-w-xs">
              <span>{productKind === 'STEM' ? 'Цена за 1 ветку, BYN' : 'Цена, BYN'}</span>
              <input
                className="admin-input tabular-nums"
                value={simplePrice?.priceMajor ?? ''}
                disabled={!canUpdate}
                inputMode="decimal"
                placeholder="0,00"
                onChange={(event) => {
                  const value = event.target.value;
                  setVariants((prev) =>
                    prev.map((item, i) => (i === 0 ? { ...item, priceMajor: value } : item)),
                  );
                  touch();
                }}
              />
            </label>
            <label className="admin-field max-w-xs">
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
        </div>
        </div>
      </section>
      ) : null}

      {show('copy') ? (
      <section className="sf-pe-card">
        <div className="sf-pe-card__head">
          <div>
            <h2>Описание</h2>
            <p className="sf-pe-card__lead">Текст на карточке товара и в поиске (если SEO не задано вручную).</p>
          </div>
        </div>
        <div className="sf-pe-card__body grid max-w-2xl gap-4">
        <label className="admin-field" data-section="shortDescription">
          <span>Описание товара</span>
          <textarea
            className="admin-input"
            rows={4}
            value={basic.shortDescription}
            disabled={!canUpdate}
            onChange={(event) => {
              setBasic((prev) => ({ ...prev, shortDescription: event.target.value }));
              touch();
            }}
          />
        </label>

        {legacyDescriptionConflict ? (
          <p className="admin-help" role="status">
            В базе есть старое «полное описание» с другим текстом — оно не удаляется при сохранении.
            Перенесите нужные фразы сюда вручную.
          </p>
        ) : null}

        <label className="admin-field" data-section="badgeLabel">
          <span>Бейдж (необязательно)</span>
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
        </label>
        </div>
      </section>
      ) : null}

      {show('audience') ? (
      <section className="sf-pe-card">
        <div className="sf-pe-card__head">
          <div>
            <h2>Повод и кому</h2>
          </div>
        </div>
        <div className="sf-pe-card__body grid gap-4 lg:grid-cols-2">
        <div className="contents">
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
            Цвета для фильтров
          </summary>
          <TaxonomyQuickPick
            kind="colors"
            legend="Гамма"
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
        </div>
      </section>
      ) : null}
    </div>
  );
}

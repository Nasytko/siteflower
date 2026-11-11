'use client';

import {
  COMMERCIAL_AVAILABILITIES,
  PRIMARY_PRODUCT_KINDS,
  normalizeSlug,
  productKindNeedsGiftSubtype,
  PRODUCT_CARD_LEAD_MAX_LENGTH,
  suggestProductNameFromComposition,
  type CommercialAvailability,
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
  canUpdate: boolean;
  canCreate: boolean;
  productKind: ProductKind;
  setProductKind: (value: ProductKind) => void;
  basic: {
    name: string;
    slug: string;
    erpSku: string;
    shortDescription: string;
    description: string;
    heightCm: string;
  };
  setBasic: React.Dispatch<
    React.SetStateAction<{
      name: string;
      slug: string;
      erpSku: string;
      shortDescription: string;
      description: string;
      heightCm: string;
    }>
  >;
  slugManual: boolean;
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
  holidays: PickerOption[];
  recipients: PickerOption[];
  colors: ColorOption[];
  traitOptions: Array<{ key: string; name: string; description: string | null }>;
  onTaxonomyCreated: (
    kind: 'occasions' | 'holidays' | 'recipients' | 'colors',
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
  touch: () => void;
  /** Legacy DB `description` differs from the editable short field — do not auto-merge. */
  legacyDescriptionConflict?: boolean;
};

export function ProductEditorMainTab(props: Props) {
  const {
    canUpdate,
    canCreate,
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
    holidays,
    recipients,
    colors,
    traitOptions,
    onTaxonomyCreated,
    publication,
    setPublication,
    legacyDescriptionConflict = false,
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
  const kindHint: Partial<Record<ProductKind, string>> = {
    BOUQUET: 'Состав из цветов, одна цена за весь букет.',
    COMPOSITION: 'Цветы в корзине, коробке или шляпной коробке.',
    STEM: 'Один цветок, цена за ветку.',
    GIFT: 'Открытка, свеча и всё, что не букет.',
  };

  return (
    <div className="space-y-4">
      {show('kind') ? (
        <section className="sf-pe-card sf-pe-card--quiet">
          <div className="sf-pe-card__body">
            <p className="sf-pe-label">Что это</p>
            <div className="sf-pe-seg" role="group" aria-label="Тип товара">
              {PRIMARY_PRODUCT_KINDS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`sf-pe-seg__btn ${productKind === value ? 'sf-pe-seg__btn--on' : ''}`}
                  disabled={!canUpdate}
                  aria-pressed={productKind === value}
                  onClick={() => setProductKind(value)}
                >
                  {productKindLabel(value)}
                </button>
              ))}
            </div>
            {kindHint[productKind] ? (
              <p className="sf-pe-note mt-2">{kindHint[productKind]}</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {show('identity') ? (
      <section className="sf-pe-card">
        <div className="sf-pe-card__head">
          <div>
            <h2>Название и цена</h2>
            <p className="sf-pe-card__lead">Так товар называется в каталоге и сколько он стоит.</p>
          </div>
        </div>
        <div className="sf-pe-card__body sf-pe-form">
        <label className="sf-pe-field" data-section="name">
          <span>Название</span>
          <input
            className="sf-pe-input"
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
            <span className="sf-pe-suggest">
              Из состава: <em>{commercialNamePreview}</em>
              {canUpdate ? (
                <button
                  type="button"
                  className="sf-pe-linkbtn"
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

        <div className="sf-pe-form__row sf-pe-form__row--price" data-section="price">
          <label className="sf-pe-field">
            <span>{productKind === 'STEM' ? 'Цена за ветку, BYN' : 'Цена, BYN'}</span>
            <input
              className="sf-pe-input sf-pe-input--num"
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
          <label className="sf-pe-field" data-section="erpSku">
            <span>Артикул ERP</span>
            <input
              className="sf-pe-input"
              value={basic.erpSku}
              disabled={!canUpdate}
              placeholder="BQ-1042"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setBasic((prev) => ({ ...prev, erpSku: event.target.value }));
                touch();
              }}
            />
          </label>
        </div>

        {multiSize ? (
          <p className="sf-pe-note">
            Несколько размеров из старой системы — на витрине первая активная цена.
          </p>
        ) : null}

        <div className="sf-pe-field">
          <span>Наличие</span>
          <div className="sf-pe-seg sf-pe-seg--wrap" role="group" aria-label="Наличие">
            {COMMERCIAL_AVAILABILITIES.map((value) => (
              <button
                key={value}
                type="button"
                className={`sf-pe-seg__btn ${publication.availability === value ? 'sf-pe-seg__btn--on' : ''}`}
                disabled={!canUpdate}
                aria-pressed={publication.availability === value}
                onClick={() => {
                  setPublication((prev) => ({ ...prev, availability: value }));
                  touch();
                }}
              >
                {availabilityLabel(value)}
              </button>
            ))}
          </div>
        </div>

        {productKindNeedsGiftSubtype(productKind) ? (
          <label className="sf-pe-field" data-section="category">
            <span>Подтип подарка</span>
            <select
              className="sf-pe-input"
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
              <option value="">Без подтипа</option>
              {giftSubtypeOptions(categories).map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        </div>
      </section>
      ) : null}

      {show('copy') ? (
      <section className="sf-pe-card">
        <div className="sf-pe-card__head">
          <div>
            <h2>Описание</h2>
            <p className="sf-pe-card__lead">
              Текст на карточке товара, не длиннее четырёх строк. Без него опубликовать нельзя.
            </p>
          </div>
        </div>
        <div className="sf-pe-card__body">
        <label className="sf-pe-field" data-section="shortDescription">
          <span>Текст на карточке и в поиске</span>
          <textarea
            className="sf-pe-input"
            rows={4}
            maxLength={
              basic.shortDescription.length > PRODUCT_CARD_LEAD_MAX_LENGTH
                ? undefined
                : PRODUCT_CARD_LEAD_MAX_LENGTH
            }
            value={basic.shortDescription}
            disabled={!canUpdate}
            onChange={(event) => {
              const raw = event.target.value;
              const previous = basic.shortDescription;
              const next =
                raw.length <= PRODUCT_CARD_LEAD_MAX_LENGTH
                  ? raw
                  : raw.length < previous.length
                    ? raw
                    : previous.length > PRODUCT_CARD_LEAD_MAX_LENGTH
                      ? previous
                      : raw.slice(0, PRODUCT_CARD_LEAD_MAX_LENGTH);
              setBasic((prev) => ({ ...prev, shortDescription: next }));
              touch();
            }}
          />
          <p className="sf-pe-note">
            {basic.shortDescription.length} из {PRODUCT_CARD_LEAD_MAX_LENGTH}. На карточке четыре строки
            {basic.shortDescription.length > PRODUCT_CARD_LEAD_MAX_LENGTH
              ? ' — сократите текст.'
              : '.'}
          </p>
        </label>

        {legacyDescriptionConflict ? (
          <p className="sf-pe-note" role="status">
            В базе есть старое полное описание с другим текстом — перенесите нужное сюда вручную.
          </p>
        ) : null}
        </div>
      </section>
      ) : null}

      {show('audience') ? (
      <section className="sf-pe-card">
        <div className="sf-pe-card__head">
          <div>
            <h2>Кому и к какому поводу</h2>
            <p className="sf-pe-card__lead">
              Для фильтров на сайте. На публикацию не влияет — можно заполнить позже.
            </p>
          </div>
        </div>
        <div className="sf-pe-card__body sf-pe-picks">
          <TaxonomyQuickPick
            kind="occasions"
            legend="Повод"
            options={occasions}
            selectedIds={discovery.occasionIds.filter((id) =>
              occasions.some((item) => item.id === id),
            )}
            canCreate={canCreate}
            canUpdate={canUpdate}
            onChange={(ids) => {
              const holidayIds = new Set(holidays.map((item) => item.id));
              setDiscovery((prev) => ({
                ...prev,
                occasionIds: [
                  ...ids,
                  ...prev.occasionIds.filter((id) => holidayIds.has(id)),
                ],
              }));
              touch();
            }}
            onCreated={(item) => onTaxonomyCreated('occasions', item)}
          />
          <TaxonomyQuickPick
            kind="holidays"
            legend="К празднику"
            options={holidays}
            selectedIds={discovery.occasionIds.filter((id) =>
              holidays.some((item) => item.id === id),
            )}
            canCreate={canCreate}
            canUpdate={canUpdate}
            onChange={(ids) => {
              const occasionOnlyIds = new Set(occasions.map((item) => item.id));
              setDiscovery((prev) => ({
                ...prev,
                occasionIds: [
                  ...prev.occasionIds.filter((id) => occasionOnlyIds.has(id)),
                  ...ids,
                ],
              }));
              touch();
            }}
            onCreated={(item) => onTaxonomyCreated('holidays', item)}
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

        {traitOptions.length > 0 ? (
          <div className="sf-pe-block sf-pe-picks__wide" data-section="traits">
            <p className="sf-pe-label">Особенности</p>
            <ul className="sf-pe-chips">
              {traitOptions.map((trait) => {
                const checked = discovery.traitKeys.includes(trait.key);
                return (
                  <li key={trait.key}>
                    <button
                      type="button"
                      className={`sf-pe-chip${checked ? ' sf-pe-chip--on' : ''}`}
                      aria-pressed={checked}
                      disabled={!canUpdate}
                      title={trait.description ?? undefined}
                      onClick={() => {
                        setDiscovery((prev) => ({
                          ...prev,
                          traitKeys: checked
                            ? prev.traitKeys.filter((k) => k !== trait.key)
                            : [...prev.traitKeys, trait.key],
                        }));
                        touch();
                      }}
                    >
                      {trait.name}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div className="sf-pe-block sf-pe-picks__wide">
          <TaxonomyQuickPick
            kind="colors"
            legend="Цвета"
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
        </div>
        </div>
      </section>
      ) : null}
    </div>
  );
}

'use client';

import {
  DEFAULT_PRODUCT_VARIANT_NAME,
  PROMOTION_TYPES,
  defaultProductSeoDescription,
  defaultProductSeoTitle,
  seoStatusEmoji,
  seoStatusLabel,
  type ProductAdminDto,
  type ProductFamilyMemberDto,
  type PromotionType,
  type SeoHealthStatus,
  type VariantStatus,
} from '@bouquet-one/contracts';
import { FieldError } from '@/components/admin/form-status';
import type { PickerOption, VariantDraft } from '@/components/admin/product-editor-shared';
import {
  formatAdminDateTime,
  lifecycleLabel,
  promotionTypeLabel,
} from '@/lib/admin-labels';
import { lifecycleChipClass } from '@/lib/admin-status';

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
  };
  setBasic: React.Dispatch<
    React.SetStateAction<{
      name: string;
      slug: string;
      shortDescription: string;
      description: string;
      heightCm: string;
    }>
  >;
  setSlugManual: (value: boolean) => void;
  variants: VariantDraft[];
  setVariants: React.Dispatch<React.SetStateAction<VariantDraft[]>>;
  familyId: string;
  setFamilyId: (value: string) => void;
  familyPanelOpen: boolean;
  setFamilyPanelOpen: (open: boolean) => void;
  familyOptions: Array<{ id: string; name: string }>;
  familyMembers: ProductFamilyMemberDto[];
  newFamilyName: string;
  setNewFamilyName: (value: string) => void;
  creatingFamily: boolean;
  onCreateFamily: () => void;
  familyReorderPending: boolean;
  onReorderFamilyMember: (productId: string, direction: -1 | 1) => void;
  onAddProductToLine?: () => void;
  addingFamilyProduct?: boolean;
  promotion: {
    enabled: boolean;
    type: PromotionType;
    percentOff: string;
    startsAt: string;
    endsAt: string;
  };
  setPromotion: React.Dispatch<
    React.SetStateAction<{
      enabled: boolean;
      type: PromotionType;
      percentOff: string;
      startsAt: string;
      endsAt: string;
    }>
  >;
  promotionPreview: Array<{
    key: string;
    name: string;
    regular: string;
    sale: string;
    note: string | null;
  }>;
  groupIds: string[];
  setGroupIds: React.Dispatch<React.SetStateAction<string[]>>;
  bestsellerGroups: PickerOption[];
  seo: { seoTitle: string; seoDescription: string; noIndex: boolean };
  setSeo: React.Dispatch<
    React.SetStateAction<{ seoTitle: string; seoDescription: string; noIndex: boolean }>
  >;
  seoManualOpen: boolean;
  setSeoManualOpen: (open: boolean) => void;
  seoHealth: { status: SeoHealthStatus };
  previewTitle: string;
  previewDescription: string;
  titleIsAutomatic: boolean;
  descriptionIsAutomatic: boolean;
  publication: { availability: string; publishAt: string; unpublishAt: string };
  setPublication: React.Dispatch<
    React.SetStateAction<{
      availability: import('@bouquet-one/contracts').CommercialAvailability;
      publishAt: string;
      unpublishAt: string;
    }>
  >;
  fieldErrors: Record<string, string>;
  onPublish: () => void;
  onUnpublish: () => void;
  onArchive: () => void;
  touch: () => void;
  toggleId: (list: string[], id: string) => string[];
  nextVariantKey: () => string;
};

export function ProductEditorExtraTab(props: Props) {
  const {
    server,
    canUpdate,
    canPublish,
    pending,
    basic,
    setBasic,
    setSlugManual,
    variants,
    setVariants,
    familyId,
    setFamilyId,
    familyPanelOpen,
    setFamilyPanelOpen,
    familyOptions,
    familyMembers,
    newFamilyName,
    setNewFamilyName,
    creatingFamily,
    onCreateFamily,
    familyReorderPending,
    onReorderFamilyMember,
    onAddProductToLine,
    addingFamilyProduct = false,
    promotion,
    setPromotion,
    promotionPreview,
    groupIds,
    setGroupIds,
    bestsellerGroups,
    seo,
    setSeo,
    seoManualOpen,
    setSeoManualOpen,
    seoHealth,
    previewTitle,
    previewDescription,
    titleIsAutomatic,
    descriptionIsAutomatic,
    publication,
    setPublication,
    fieldErrors,
    onPublish,
    onUnpublish,
    onArchive,
    touch,
    toggleId,
    nextVariantKey,
  } = props;

  const multiSize = variants.length > 1;

  function addSizeRow() {
    setVariants((prev) => {
      if (prev.length === 1) {
        const only = prev[0]!;
        const isDefault =
          only.name.trim() === '' ||
          only.name.trim().toLowerCase() === DEFAULT_PRODUCT_VARIANT_NAME.toLowerCase();
        if (isDefault) {
          return [
            { ...only, name: '7 шт' },
            {
              key: nextVariantKey(),
              id: null,
              name: '15 шт',
              priceMajor: '',
              status: 'ACTIVE' as VariantStatus,
              salePriceMajor: '',
            },
          ];
        }
      }
      const taken = new Set(prev.map((row) => row.name.trim().toLowerCase()));
      const nextLabel =
        ['7 шт', '15 шт', '25 шт', '51 шт'].find((label) => !taken.has(label.toLowerCase())) ?? '';
      return [
        ...prev,
        {
          key: nextVariantKey(),
          id: null,
          name: nextLabel,
          priceMajor: '',
          status: 'ACTIVE' as VariantStatus,
          salePriceMajor: '',
        },
      ];
    });
    touch();
  }

  return (
    <section className="admin-section space-y-6">
      <div>
        <h2 className="admin-section__title">Дополнительно</h2>
        <p className="admin-section__lead">
          Размеры, высота, линейка, SEO, акции и расписание публикации.
        </p>
      </div>

      <div className="admin-subsection space-y-3" data-section="variants">
        <h3 className="admin-subsection__title">
          {multiSize ? 'Размеры и цены' : 'Несколько размеров'}
        </h3>
        {multiSize ? (
          <div className="space-y-2">
            {variants.map((variant, index) => (
              <div key={variant.key} className="flex flex-wrap items-end gap-2">
                <label className="admin-field">
                  <span>Размер</span>
                  <input
                    className="admin-input w-32"
                    value={variant.name}
                    disabled={!canUpdate}
                    placeholder="7 шт"
                    onChange={(event) => {
                      const value = event.target.value;
                      setVariants((prev) =>
                        prev.map((item, i) => (i === index ? { ...item, name: value } : item)),
                      );
                      touch();
                    }}
                  />
                </label>
                <label className="admin-field">
                  <span>Цена, BYN</span>
                  <input
                    className="admin-input w-32 tabular-nums"
                    value={variant.priceMajor}
                    disabled={!canUpdate}
                    inputMode="decimal"
                    placeholder="Укажите цену"
                    onChange={(event) => {
                      const value = event.target.value;
                      setVariants((prev) =>
                        prev.map((item, i) =>
                          i === index ? { ...item, priceMajor: value } : item,
                        ),
                      );
                      touch();
                    }}
                  />
                </label>
                {canUpdate ? (
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    onClick={() => {
                      setVariants((prev) => prev.filter((_, i) => i !== index));
                      touch();
                    }}
                  >
                    Удалить
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="admin-help">
            Цена одной карточки задаётся во вкладке «Основное». Здесь можно добавить размеры (7 шт /
            15 шт).
          </p>
        )}
        {canUpdate ? (
          <button type="button" className="admin-btn-ghost" onClick={addSizeRow}>
            + Добавить размер (7 шт / 15 шт)
          </button>
        ) : null}
      </div>

      <label className="admin-field max-w-xs">
        <span>Высота букета, см</span>
        <input
          className="admin-input"
          type="number"
          min={15}
          max={250}
          value={basic.heightCm}
          disabled={!canUpdate}
          placeholder="не указана"
          onChange={(event) => {
            setBasic((prev) => ({ ...prev, heightCm: event.target.value }));
            touch();
          }}
        />
        <span className="admin-field__hint">Высота готового букета, не стебля.</span>
      </label>

      <label className="admin-field max-w-2xl" data-section="slug">
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

      <div className="admin-subsection space-y-2">
        {!familyPanelOpen ? (
          <button type="button" className="admin-btn-ghost" onClick={() => setFamilyPanelOpen(true)}>
            Связать с другими товарами (линейка)
          </button>
        ) : (
          <div className="space-y-3">
            <h3 className="admin-subsection__title">Линейка товаров</h3>
            <p className="text-xs text-[var(--admin-muted)]">
              Отдельные карточки одного товара (40 / 50 / 60 см). Не путать с размерами «7 шт /
              15 шт» в одной карточке.
            </p>
            <label className="admin-field max-w-md">
              <span>Линейка</span>
              <select
                className="admin-select"
                value={familyId}
                disabled={!canUpdate}
                onChange={(event) => {
                  setFamilyId(event.target.value);
                  touch();
                }}
              >
                <option value="">Не в линейке</option>
                {familyOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            {canUpdate ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="admin-field">
                  <span>Новая линейка</span>
                  <input
                    className="admin-input w-56"
                    value={newFamilyName}
                    disabled={creatingFamily}
                    placeholder="Например: Роза Мондиаль"
                    onChange={(event) => setNewFamilyName(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="admin-btn-ghost"
                  disabled={creatingFamily || newFamilyName.trim().length === 0}
                  onClick={onCreateFamily}
                >
                  {creatingFamily ? 'Создание…' : 'Создать'}
                </button>
              </div>
            ) : null}
            {familyId && Array.isArray(familyMembers) && familyMembers.length > 0 ? (
              <ul className="space-y-2">
                {familyMembers.map((member, index) => {
                  const isCurrent = member.productId === server.id;
                  return (
                    <li
                      key={member.productId}
                      className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${
                        isCurrent
                          ? 'border-[var(--admin-brand)] bg-[var(--admin-brand)]/5'
                          : 'border-[var(--admin-border)]'
                      }`}
                    >
                      <a
                        href={`/admin/catalog/products/${member.productId}`}
                        className="admin-link font-medium"
                      >
                        {member.name}
                        {isCurrent ? ' · этот товар' : ''}
                        {member.heightCm != null ? ` · ${member.heightCm} см` : ''}
                      </a>
                      {canUpdate ? (
                        <div className="admin-row-actions ml-auto">
                          <button
                            type="button"
                            className="admin-icon-btn"
                            aria-label="Выше"
                            disabled={familyReorderPending || index === 0}
                            onClick={() => onReorderFamilyMember(member.productId, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="admin-icon-btn"
                            aria-label="Ниже"
                            disabled={familyReorderPending || index === familyMembers.length - 1}
                            onClick={() => onReorderFamilyMember(member.productId, 1)}
                          >
                            ↓
                          </button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : familyId ? (
              <p className="admin-help">
                В линейке пока только этот товар. Сохраните изменения, затем добавьте другие
                карточки.
              </p>
            ) : null}
            {canUpdate && familyId && onAddProductToLine ? (
              <button
                type="button"
                className="admin-btn-ghost"
                disabled={addingFamilyProduct}
                onClick={onAddProductToLine}
              >
                {addingFamilyProduct ? 'Создание…' : '+ Добавить карточку в линейку'}
              </button>
            ) : null}
          </div>
        )}
      </div>

      <div className="admin-subsection space-y-3">
        <h3 className="admin-subsection__title">Акция и витрины</h3>
        <label className="admin-check">
          <input
            type="checkbox"
            disabled={!canUpdate}
            checked={promotion.enabled}
            onChange={(event) => {
              setPromotion((prev) => ({ ...prev, enabled: event.target.checked }));
              touch();
            }}
          />
          Товар участвует в акции
        </label>
        {promotion.enabled ? (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="admin-field">
              <span>Тип скидки</span>
              <select
                className="admin-select"
                value={promotion.type}
                disabled={!canUpdate}
                onChange={(event) => {
                  setPromotion((prev) => ({
                    ...prev,
                    type: event.target.value as PromotionType,
                  }));
                  touch();
                }}
              >
                {PROMOTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {promotionTypeLabel(type)}
                  </option>
                ))}
              </select>
            </label>
            {promotion.type === 'PERCENT' ? (
              <label className="admin-field">
                <span>Скидка, %</span>
                <input
                  className="admin-input w-28 tabular-nums"
                  type="number"
                  min={1}
                  max={99}
                  value={promotion.percentOff}
                  disabled={!canUpdate}
                  onChange={(event) => {
                    setPromotion((prev) => ({ ...prev, percentOff: event.target.value }));
                    touch();
                  }}
                />
                <FieldError message={fieldErrors.percentOff} />
              </label>
            ) : null}
            <label className="admin-field">
              <span>Начало акции</span>
              <input
                className="admin-input"
                type="datetime-local"
                value={promotion.startsAt}
                disabled={!canUpdate}
                onChange={(event) => {
                  setPromotion((prev) => ({ ...prev, startsAt: event.target.value }));
                  touch();
                }}
              />
            </label>
            <label className="admin-field">
              <span>Окончание акции</span>
              <input
                className="admin-input"
                type="datetime-local"
                value={promotion.endsAt}
                disabled={!canUpdate}
                onChange={(event) => {
                  setPromotion((prev) => ({ ...prev, endsAt: event.target.value }));
                  touch();
                }}
              />
            </label>
          </div>
        ) : null}
        {promotion.enabled && promotionPreview.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {promotionPreview.map((row) => (
              <li key={row.key}>
                {row.name}: {row.regular}
                {row.sale !== '—' ? ` → ${row.sale}` : ''}
                {row.note ? ` (${row.note})` : ''}
              </li>
            ))}
          </ul>
        ) : null}
        {bestsellerGroups.length > 0 ? (
          <div className="admin-checks">
            {bestsellerGroups.map((group) => (
              <label key={group.id} className="admin-check">
                <input
                  type="checkbox"
                  disabled={!canUpdate}
                  checked={groupIds.includes(group.id)}
                  onChange={() => {
                    setGroupIds((prev) => toggleId(prev, group.id));
                    touch();
                  }}
                />
                {group.name}
              </label>
            ))}
          </div>
        ) : null}
      </div>

      <div className="admin-subsection space-y-3">
        <h3 className="admin-subsection__title">Поиск (SEO)</h3>
        <p className="text-sm text-[var(--admin-muted)]">
          {seoStatusEmoji(seoHealth.status)} {seoStatusLabel(seoHealth.status)} · {previewTitle}
        </p>
        <p className="text-sm text-[var(--admin-muted)] line-clamp-2">{previewDescription}</p>
        <button
          type="button"
          className="admin-btn-ghost text-sm"
          disabled={!canUpdate}
          onClick={() => setSeoManualOpen(!seoManualOpen)}
        >
          {seoManualOpen ? 'Свернуть ручные поля SEO' : 'Настроить заголовок и описание для поиска'}
        </button>
        {seoManualOpen ? (
          <div className="grid max-w-2xl gap-4">
            <label className="admin-field">
              <span>Заголовок в поиске {titleIsAutomatic ? '(авто)' : ''}</span>
              <input
                className="admin-input"
                value={seo.seoTitle}
                disabled={!canUpdate}
                onChange={(event) => {
                  setSeo((prev) => ({ ...prev, seoTitle: event.target.value }));
                  touch();
                }}
                placeholder={defaultProductSeoTitle(basic.name.trim() || server.name)}
              />
            </label>
            <label className="admin-field">
              <span>Описание в поиске {descriptionIsAutomatic ? '(авто)' : ''}</span>
              <textarea
                className="admin-textarea"
                rows={3}
                value={seo.seoDescription}
                disabled={!canUpdate}
                onChange={(event) => {
                  setSeo((prev) => ({ ...prev, seoDescription: event.target.value }));
                  touch();
                }}
                placeholder={defaultProductSeoDescription(
                  basic.name.trim() || server.name,
                  basic.shortDescription.trim() || server.shortDescription,
                )}
              />
            </label>
          </div>
        ) : null}
        <label className="admin-check">
          <input
            type="checkbox"
            disabled={!canUpdate}
            checked={seo.noIndex}
            onChange={(event) => {
              setSeo((prev) => ({ ...prev, noIndex: event.target.checked }));
              touch();
            }}
          />
          Скрыть страницу от поисковых систем
        </label>
      </div>

      <div className="admin-subsection space-y-3">
        <h3 className="admin-subsection__title">Расписание публикации</h3>
        <p className="admin-status-row text-sm text-[var(--admin-muted)]">
          <span>Состояние:</span>
          <span className={lifecycleChipClass(server.lifecycle)}>
            {lifecycleLabel(server.lifecycle)}
          </span>
          {server.publishedAt ? ` · опубликован ${formatAdminDateTime(server.publishedAt)}` : ''}
        </p>
        <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
          <label className="admin-field">
            <span>Опубликовать позже</span>
            <input
              className="admin-input"
              type="datetime-local"
              value={publication.publishAt}
              disabled={!canUpdate}
              onChange={(event) => {
                setPublication((prev) => ({ ...prev, publishAt: event.target.value }));
                touch();
              }}
            />
            <span className="admin-field__hint">По времени Минска (Europe/Minsk)</span>
          </label>
          <label className="admin-field">
            <span>Снять с витрины</span>
            <input
              className="admin-input"
              type="datetime-local"
              value={publication.unpublishAt}
              disabled={!canUpdate}
              onChange={(event) => {
                setPublication((prev) => ({ ...prev, unpublishAt: event.target.value }));
                touch();
              }}
            />
            <span className="admin-field__hint">По времени Минска (Europe/Minsk)</span>
          </label>
        </div>
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
          ) : null}
          <a className="admin-btn-ghost" href={`/admin/catalog/products/${server.id}/preview`}>
            Предпросмотр
          </a>
        </div>
        <p className="admin-help">
          «Черновик» не виден покупателям. «В архиве» убирает товар из каталога, но сохраняет
          историю заказов.
        </p>
      </div>
    </section>
  );
}

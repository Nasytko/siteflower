'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  applyPercentOff,
  COMMERCIAL_AVAILABILITIES,
  COMPONENT_UNITS,
  formatPriceFromMinor,
  PROMOTION_TYPES,
  type ComponentUnit,
  type CommercialAvailability,
  type ProductAdminDto,
  type PromotionType,
  type VariantStatus,
} from '@bouquet-one/contracts';
import { Button } from '@bouquet-one/ui';
import {
  adminDelete,
  adminPatch,
  adminPost,
  adminPut,
  adminUpload,
  errorMessage,
} from '@/lib/admin-client';
import { adminEndpoints } from '@/lib/admin-endpoints';
import {
  availabilityLabel,
  componentUnitLabel,
  formatAdminDateTime,
  fromDateTimeLocalValue,
  lifecycleLabel,
  promotionTypeLabel,
  toDateTimeLocalValue,
  variantStatusLabel,
} from '@/lib/admin-labels';
import { majorInputToMinor, minorToMajorInput } from '@/lib/admin-money';
import { toSameOriginMediaUrl } from '@/lib/media';

export type PickerOption = { id: string; name: string };

type Props = {
  product: ProductAdminDto;
  options: {
    occasions: PickerOption[];
    recipients: PickerOption[];
    colors: Array<PickerOption & { swatch?: string | null }>;
    flowers: PickerOption[];
    bouquetSizes: PickerOption[];
    productLines: PickerOption[];
  };
  bestsellerGroups: PickerOption[];
  canUpdate: boolean;
  canPublish: boolean;
};

type SectionId =
  | 'basic'
  | 'pricing'
  | 'photos'
  | 'composition'
  | 'discovery'
  | 'promotion'
  | 'seo'
  | 'publication';

const SECTIONS: Array<[SectionId, string]> = [
  ['basic', 'Основное'],
  ['pricing', 'Цена и варианты'],
  ['photos', 'Фото'],
  ['composition', 'Состав'],
  ['discovery', 'Подбор'],
  ['promotion', 'Акция и витрины'],
  ['seo', 'SEO'],
  ['publication', 'Публикация'],
];

type VariantDraft = {
  key: string;
  id: string | null;
  name: string;
  priceMajor: string;
  status: VariantStatus;
  /** Sale price for FIXED promotions, major BYN. */
  salePriceMajor: string;
};

type ComponentDraft = {
  key: string;
  displayName: string;
  quantity: string;
  unit: ComponentUnit;
  flowerId: string;
};

type PromotionDraft = {
  enabled: boolean;
  type: PromotionType;
  percentOff: string;
  startsAt: string;
  endsAt: string;
};

let keySeed = 0;
function nextKey(prefix: string): string {
  keySeed += 1;
  return `${prefix}-${keySeed}`;
}

function toVariantDrafts(product: ProductAdminDto): VariantDraft[] {
  const salePrices = new Map(
    (product.promotion?.variantSalePrices ?? []).map((entry) => [
      entry.variantId,
      entry.salePriceMinor,
    ]),
  );
  return [...product.variants]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((variant) => ({
      key: nextKey('variant'),
      id: variant.id,
      name: variant.name,
      priceMajor: minorToMajorInput(variant.priceMinor),
      status: variant.status,
      salePriceMajor: minorToMajorInput(salePrices.get(variant.id) ?? null),
    }));
}

function toComponentDrafts(product: ProductAdminDto): ComponentDraft[] {
  return [...product.components]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((component) => ({
      key: nextKey('component'),
      displayName: component.displayName,
      quantity: component.quantity === null ? '' : String(component.quantity),
      unit: component.unit,
      flowerId: component.flowerId ?? '',
    }));
}

function toPromotionDraft(product: ProductAdminDto): PromotionDraft {
  const promotion = product.promotion;
  return {
    enabled: promotion?.enabled ?? false,
    type: promotion?.type ?? 'PERCENT',
    percentOff: promotion?.percentOff === null || promotion?.percentOff === undefined ? '' : String(promotion.percentOff),
    startsAt: toDateTimeLocalValue(promotion?.startsAt ?? null),
    endsAt: toDateTimeLocalValue(promotion?.endsAt ?? null),
  };
}

export function ProductEditor({
  product,
  options,
  bestsellerGroups,
  canUpdate,
  canPublish,
}: Props) {
  const router = useRouter();
  const [section, setSection] = useState<SectionId>('basic');
  const [server, setServer] = useState(product);
  const [version, setVersion] = useState(product.version);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const [basic, setBasic] = useState({
    name: product.name,
    slug: product.slug,
    shortDescription: product.shortDescription ?? '',
    description: product.description ?? '',
    heightCm: product.heightCm === null ? '' : String(product.heightCm),
  });
  const [variants, setVariants] = useState<VariantDraft[]>(() => toVariantDrafts(product));
  const [components, setComponents] = useState<ComponentDraft[]>(() => toComponentDrafts(product));
  const [discovery, setDiscovery] = useState({
    bouquetSizeId: product.bouquetSizeId ?? '',
    occasionIds: product.occasions.map((item) => item.id),
    recipientIds: product.recipients.map((item) => item.id),
    colorIds: product.colors.map((item) => item.id),
    productLineIds: product.productLines.map((item) => item.id),
  });
  const [promotion, setPromotion] = useState<PromotionDraft>(() => toPromotionDraft(product));
  const [groupIds, setGroupIds] = useState<string[]>(product.bestsellerGroupIds);
  const [seo, setSeo] = useState({
    seoTitle: product.seoTitle ?? '',
    seoDescription: product.seoDescription ?? '',
    noIndex: product.noIndex,
  });
  const [publication, setPublication] = useState({
    availability: product.availability,
    publishAt: toDateTimeLocalValue(product.publishAt),
    unpublishAt: toDateTimeLocalValue(product.unpublishAt),
  });

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  function resync(updated: ProductAdminDto) {
    setServer(updated);
    setVersion(updated.version);
    setBasic({
      name: updated.name,
      slug: updated.slug,
      shortDescription: updated.shortDescription ?? '',
      description: updated.description ?? '',
      heightCm: updated.heightCm === null ? '' : String(updated.heightCm),
    });
    setVariants(toVariantDrafts(updated));
    setComponents(toComponentDrafts(updated));
    setDiscovery({
      bouquetSizeId: updated.bouquetSizeId ?? '',
      occasionIds: updated.occasions.map((item) => item.id),
      recipientIds: updated.recipients.map((item) => item.id),
      colorIds: updated.colors.map((item) => item.id),
      productLineIds: updated.productLines.map((item) => item.id),
    });
    setPromotion(toPromotionDraft(updated));
    setGroupIds(updated.bestsellerGroupIds);
    setSeo({
      seoTitle: updated.seoTitle ?? '',
      seoDescription: updated.seoDescription ?? '',
      noIndex: updated.noIndex,
    });
    setPublication({
      availability: updated.availability,
      publishAt: toDateTimeLocalValue(updated.publishAt),
      unpublishAt: toDateTimeLocalValue(updated.unpublishAt),
    });
    setDirty(false);
  }

  function touch() {
    setDirty(true);
    setSavedAt(null);
  }

  function toggleId(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
  }

  const activeVariants = variants.filter((variant) => variant.status === 'ACTIVE');

  const promotionPreview = useMemo(() => {
    if (!promotion.enabled) return [];
    return activeVariants.map((variant) => {
      const regularMinor = majorInputToMinor(variant.priceMajor);
      if (regularMinor === null) {
        return { key: variant.key, name: variant.name, regular: '—', sale: '—', note: 'Проверьте цену' };
      }
      const regular = formatPriceFromMinor(regularMinor, server.currency);
      if (promotion.type === 'PERCENT') {
        const percent = Number(promotion.percentOff);
        if (!Number.isInteger(percent) || percent < 1 || percent > 99) {
          return { key: variant.key, name: variant.name, regular, sale: '—', note: 'Укажите скидку 1–99%' };
        }
        const saleMinor = applyPercentOff(BigInt(regularMinor), percent);
        return {
          key: variant.key,
          name: variant.name,
          regular,
          sale: formatPriceFromMinor(saleMinor.toString(), server.currency),
          note: null as string | null,
        };
      }
      const saleMinor = majorInputToMinor(variant.salePriceMajor);
      if (saleMinor === null) {
        return { key: variant.key, name: variant.name, regular, sale: '—', note: 'Укажите цену по акции' };
      }
      return {
        key: variant.key,
        name: variant.name,
        regular,
        sale: formatPriceFromMinor(saleMinor, server.currency),
        note:
          BigInt(saleMinor) >= BigInt(regularMinor)
            ? 'Цена по акции должна быть ниже обычной'
            : null,
      };
    });
  }, [promotion, activeVariants, server.currency]);

  const seoWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (!server.seo.resolvedTitle) warnings.push('Нет заголовка для поиска');
    if (server.seo.resolvedTitle.length > 70) warnings.push('Заголовок длиннее 70 символов');
    if (!server.seo.resolvedDescription) warnings.push('Нет описания для поиска');
    if (server.media.length === 0) warnings.push('Нет фото');
    else if (!server.media.some((item) => item.isPrimary)) warnings.push('Не выбрано главное фото');
    if (server.media.some((item) => !item.alt)) warnings.push('Есть фото без описания (alt)');
    return warnings;
  }, [server]);

  function validate(): string | null {
    if (basic.name.trim().length === 0) return 'Укажите название товара';
    if (basic.slug.trim().length === 0) return 'Укажите адрес в ссылке';
    if (variants.length === 0) return 'Добавьте хотя бы один вариант с ценой';
    for (const variant of variants) {
      if (variant.name.trim().length === 0) return 'У каждого варианта должно быть название';
      if (majorInputToMinor(variant.priceMajor) === null) {
        return `Проверьте цену варианта «${variant.name || '—'}»`;
      }
    }
    for (const component of components) {
      if (component.displayName.trim().length === 0) {
        return 'В составе есть строка без названия';
      }
    }
    if (promotion.enabled) {
      if (promotion.type === 'PERCENT') {
        const percent = Number(promotion.percentOff);
        if (!Number.isInteger(percent) || percent < 1 || percent > 99) {
          return 'Скидка должна быть целым числом от 1 до 99%';
        }
      } else {
        for (const variant of activeVariants) {
          const sale = majorInputToMinor(variant.salePriceMajor);
          const regular = majorInputToMinor(variant.priceMajor);
          if (sale === null) return `Укажите цену по акции для варианта «${variant.name}»`;
          if (regular !== null && BigInt(sale) >= BigInt(regular)) {
            return `Цена по акции для «${variant.name}» должна быть ниже обычной`;
          }
        }
      }
      if (promotion.startsAt && promotion.endsAt && promotion.startsAt >= promotion.endsAt) {
        return 'Начало акции должно быть раньше окончания';
      }
    }
    return null;
  }

  async function onSave() {
    if (!canUpdate) return;
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setPending(true);
    setError(null);
    setSavedAt(null);
    try {
      let current = await adminPatch<ProductAdminDto>(adminEndpoints.product(server.id), {
        expectedVersion: version,
        name: basic.name.trim(),
        slug: basic.slug.trim(),
        shortDescription: basic.shortDescription.trim() || null,
        description: basic.description.trim() || null,
        heightCm: basic.heightCm.trim().length > 0 ? Number(basic.heightCm) : null,
        availability: publication.availability,
        publishAt: fromDateTimeLocalValue(publication.publishAt),
        unpublishAt: fromDateTimeLocalValue(publication.unpublishAt),
        seoTitle: seo.seoTitle.trim() || null,
        seoDescription: seo.seoDescription.trim() || null,
        noIndex: seo.noIndex,
      });

      current = await adminPut<ProductAdminDto>(adminEndpoints.productVariants(server.id), {
        expectedVersion: current.version,
        variants: variants.map((variant, index) => ({
          ...(variant.id ? { id: variant.id } : {}),
          name: variant.name.trim(),
          priceMinor: majorInputToMinor(variant.priceMajor) ?? '0',
          sortOrder: index,
          status: variant.status,
        })),
      });

      current = await adminPut<ProductAdminDto>(adminEndpoints.productComponents(server.id), {
        expectedVersion: current.version,
        components: components.map((component, index) => ({
          displayName: component.displayName.trim(),
          quantity: component.quantity.trim().length > 0 ? Number(component.quantity) : null,
          unit: component.unit,
          flowerId: component.flowerId || null,
          sortOrder: index,
        })),
      });

      current = await adminPut<ProductAdminDto>(adminEndpoints.productTaxonomies(server.id), {
        expectedVersion: current.version,
        bouquetSizeId: discovery.bouquetSizeId || null,
        occasionIds: discovery.occasionIds,
        recipientIds: discovery.recipientIds,
        colorIds: discovery.colorIds,
        productLineIds: discovery.productLineIds,
      });

      // Variant ids can be created by the step above: map sale prices positionally.
      const savedVariants = [...current.variants].sort((a, b) => a.sortOrder - b.sortOrder);
      current = await adminPut<ProductAdminDto>(adminEndpoints.productPromotion(server.id), {
        expectedVersion: current.version,
        enabled: promotion.enabled,
        type: promotion.type,
        percentOff:
          promotion.enabled && promotion.type === 'PERCENT' ? Number(promotion.percentOff) : null,
        startsAt: fromDateTimeLocalValue(promotion.startsAt),
        endsAt: fromDateTimeLocalValue(promotion.endsAt),
        variantSalePrices:
          promotion.enabled && promotion.type === 'FIXED'
            ? variants.flatMap((variant, index) => {
                const saved = savedVariants[index];
                const saleMinor = majorInputToMinor(variant.salePriceMajor);
                if (!saved || saleMinor === null || variant.status !== 'ACTIVE') return [];
                return [{ variantId: saved.id, salePriceMinor: saleMinor }];
              })
            : [],
      });

      current = await adminPut<ProductAdminDto>(adminEndpoints.productBestsellers(server.id), {
        expectedVersion: current.version,
        groupIds,
      });

      resync(current);
      setSavedAt(new Date().toLocaleTimeString('ru-BY'));
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось сохранить товар'));
    } finally {
      setPending(false);
    }
  }

  async function runLifecycle(action: 'publish' | 'unpublish' | 'archive') {
    if (!canPublish) return;
    setPending(true);
    setError(null);
    try {
      const updated = await adminPost<ProductAdminDto>(
        adminEndpoints.productLifecycle(server.id, action),
        { expectedVersion: version },
      );
      resync(updated);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось изменить статус'));
    } finally {
      setPending(false);
    }
  }

  async function onUpload(file: File) {
    if (!canUpdate) return;
    setPending(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('expectedVersion', String(version));
      const updated = await adminUpload<ProductAdminDto>(
        adminEndpoints.productMedia(server.id),
        form,
      );
      setServer(updated);
      setVersion(updated.version);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось загрузить фото'));
    } finally {
      setPending(false);
    }
  }

  async function patchMedia(mediaId: string, body: Record<string, unknown>) {
    if (!canUpdate) return;
    setPending(true);
    setError(null);
    try {
      const updated = await adminPatch<ProductAdminDto>(
        adminEndpoints.productMediaItem(server.id, mediaId),
        { expectedVersion: version, ...body },
      );
      setServer(updated);
      setVersion(updated.version);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось изменить фото'));
    } finally {
      setPending(false);
    }
  }

  async function removeMedia(mediaId: string) {
    if (!canUpdate) return;
    setPending(true);
    setError(null);
    try {
      const updated = await adminDelete<ProductAdminDto>(
        adminEndpoints.productMediaItem(server.id, mediaId),
        { expectedVersion: version },
      );
      setServer(updated);
      setVersion(updated.version);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось удалить фото'));
    } finally {
      setPending(false);
    }
  }

  async function reorderMedia(mediaId: string, direction: -1 | 1) {
    if (!canUpdate) return;
    const ordered = [...server.media].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = ordered.findIndex((item) => item.id === mediaId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const [moved] = ordered.splice(index, 1);
    ordered.splice(target, 0, moved!);

    setPending(true);
    setError(null);
    try {
      const updated = await adminPut<ProductAdminDto>(
        adminEndpoints.productMediaOrder(server.id),
        {
          expectedVersion: version,
          mediaIds: ordered.map((item) => item.id),
        },
      );
      setServer(updated);
      setVersion(updated.version);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось изменить порядок фото'));
    } finally {
      setPending(false);
    }
  }

  const readOnlyNote = canUpdate ? null : (
    <p className="admin-help">Только просмотр: у вашей роли нет прав на изменение каталога.</p>
  );

  return (
    <div className="space-y-6">
      {error ? (
        <p role="alert" className="admin-error">
          {error}
        </p>
      ) : null}
      {readOnlyNote}

      <div className="admin-seg admin-seg--wrap">
        {SECTIONS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`admin-seg__btn ${section === id ? 'admin-seg__btn--active' : ''}`}
            onClick={() => setSection(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {section === 'basic' ? (
        <section className="admin-section">
          <h2 className="admin-section__title">Основное</h2>
          <div className="grid max-w-2xl gap-4">
            <label className="admin-field">
              <span>Название</span>
              <input
                className="admin-input"
                value={basic.name}
                disabled={!canUpdate}
                onChange={(event) => {
                  setBasic((prev) => ({ ...prev, name: event.target.value }));
                  touch();
                }}
              />
            </label>
            <label className="admin-field">
              <span>Адрес в ссылке</span>
              <input
                className="admin-input"
                value={basic.slug}
                disabled={!canUpdate}
                onChange={(event) => {
                  setBasic((prev) => ({ ...prev, slug: event.target.value }));
                  touch();
                }}
              />
              <span className="admin-field__hint">/bukety/{basic.slug || '…'}</span>
            </label>
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
              <span className="admin-field__hint">Показывается в каталоге под названием.</span>
            </label>
            <label className="admin-field">
              <span>Полное описание</span>
              <textarea
                className="admin-input"
                rows={6}
                value={basic.description}
                disabled={!canUpdate}
                onChange={(event) => {
                  setBasic((prev) => ({ ...prev, description: event.target.value }));
                  touch();
                }}
              />
            </label>
            <label className="admin-field">
              <span>Высота букета, см</span>
              <input
                className="admin-input w-40"
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
              <span className="admin-field__hint">
                Для линейки на фото (см). Не путать с «Размерами» в подборе и вариантами цены
                (S/M/L). Пусто — шкалу не показывать.
              </span>
            </label>
          </div>
        </section>
      ) : null}

      {section === 'pricing' ? (
        <section className="admin-section">
          <h2 className="admin-section__title">Цена и варианты</h2>
          <p className="admin-section__lead">
            Варианты = комплектация для цены (S / M / L или свои названия). Это то, что выбирает
            покупатель на карточке. «Размер» в подборе — отдельный справочник для фильтров.
          </p>
          </p>
          <div className="admin-panel overflow-x-auto">
            <table className="admin-table min-w-[640px]">
              <thead>
                <tr>
                  <th>Вариант</th>
                  <th className="w-40">Цена, BYN</th>
                  <th className="w-40">Состояние</th>
                  <th className="w-32">Порядок</th>
                  <th className="w-24" />
                </tr>
              </thead>
              <tbody>
                {variants.map((variant, index) => (
                  <tr key={variant.key}>
                    <td>
                      <input
                        className="admin-input"
                        value={variant.name}
                        disabled={!canUpdate}
                        placeholder="Стандарт"
                        onChange={(event) => {
                          const value = event.target.value;
                          setVariants((prev) =>
                            prev.map((item, i) => (i === index ? { ...item, name: value } : item)),
                          );
                          touch();
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="admin-input w-32 tabular-nums"
                        value={variant.priceMajor}
                        disabled={!canUpdate}
                        inputMode="decimal"
                        placeholder="129,00"
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
                    </td>
                    <td>
                      <select
                        className="admin-select"
                        value={variant.status}
                        disabled={!canUpdate}
                        onChange={(event) => {
                          const value = event.target.value as VariantStatus;
                          setVariants((prev) =>
                            prev.map((item, i) => (i === index ? { ...item, status: value } : item)),
                          );
                          touch();
                        }}
                      >
                        {(['ACTIVE', 'INACTIVE'] as VariantStatus[]).map((status) => (
                          <option key={status} value={status}>
                            {variantStatusLabel(status)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        <button
                          type="button"
                          className="admin-icon-btn"
                          aria-label="Выше"
                          disabled={!canUpdate || index === 0}
                          onClick={() => {
                            setVariants((prev) => {
                              const next = [...prev];
                              const [moved] = next.splice(index, 1);
                              next.splice(index - 1, 0, moved!);
                              return next;
                            });
                            touch();
                          }}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="admin-icon-btn"
                          aria-label="Ниже"
                          disabled={!canUpdate || index === variants.length - 1}
                          onClick={() => {
                            setVariants((prev) => {
                              const next = [...prev];
                              const [moved] = next.splice(index, 1);
                              next.splice(index + 1, 0, moved!);
                              return next;
                            });
                            touch();
                          }}
                        >
                          ↓
                        </button>
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="admin-btn-ghost"
                        disabled={!canUpdate}
                        onClick={() => {
                          setVariants((prev) => prev.filter((_, i) => i !== index));
                          touch();
                        }}
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canUpdate ? (
            <button
              type="button"
              className="admin-btn-ghost"
              onClick={() => {
                setVariants((prev) => [
                  ...prev,
                  {
                    key: nextKey('variant'),
                    id: null,
                    name: '',
                    priceMajor: '',
                    status: 'ACTIVE',
                    salePriceMajor: '',
                  },
                ]);
                touch();
              }}
            >
              Добавить вариант
            </button>
          ) : null}
          <p className="admin-help">
            Текущая цена на витрине: {server.price?.label ?? 'не рассчитана'}
          </p>
        </section>
      ) : null}

      {section === 'photos' ? (
        <section className="admin-section">
          <h2 className="admin-section__title">Фото</h2>
          {canUpdate ? (
            <label className="admin-field">
              <span>Загрузить фото</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                disabled={pending}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onUpload(file);
                  event.target.value = '';
                }}
              />
            </label>
          ) : null}

          {server.media.length === 0 ? (
            <p className="admin-empty">Фото пока нет. Без фото товар нельзя опубликовать.</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...server.media]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((media, index, sorted) => (
                  <li key={media.id} className="admin-media-card">
                    <img
                      src={toSameOriginMediaUrl(media.url) ?? media.url}
                      alt={media.alt ?? ''}
                      className="aspect-square w-full rounded-lg object-cover"
                    />
                    <label className="admin-field mt-2">
                      <span>Описание фото (alt)</span>
                      <input
                        className="admin-input"
                        defaultValue={media.alt ?? ''}
                        disabled={!canUpdate}
                        placeholder="Букет из розовых пионов"
                        onBlur={(event) => {
                          const value = event.target.value.trim();
                          if (value === (media.alt ?? '')) return;
                          void patchMedia(media.id, { alt: value.length > 0 ? value : null });
                        }}
                      />
                    </label>
                    <div className="admin-row-actions mt-2">
                      {media.isPrimary ? (
                        <span className="admin-chip">Главное</span>
                      ) : (
                        <button
                          type="button"
                          className="admin-btn-ghost"
                          disabled={!canUpdate || pending}
                          onClick={() => void patchMedia(media.id, { isPrimary: true })}
                        >
                          Сделать главным
                        </button>
                      )}
                      <button
                        type="button"
                        className="admin-icon-btn"
                        aria-label="Раньше"
                        disabled={!canUpdate || pending || index === 0}
                        onClick={() => void reorderMedia(media.id, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="admin-icon-btn"
                        aria-label="Позже"
                        disabled={!canUpdate || pending || index === sorted.length - 1}
                        onClick={() => void reorderMedia(media.id, 1)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="admin-btn-ghost"
                        disabled={!canUpdate || pending}
                        onClick={() => void removeMedia(media.id)}
                      >
                        Удалить
                      </button>
                    </div>
                  </li>
                ))}
            </ul>
          )}
          <p className="admin-help">Фото сохраняются сразу, отдельно от кнопки «Сохранить».</p>
        </section>
      ) : null}

      {section === 'composition' ? (
        <section className="admin-section">
          <h2 className="admin-section__title">Состав</h2>
          <p className="admin-section__lead">
            Строки состава с выбранным цветком формируют фильтр «Цветок» на витрине.
          </p>
          <div className="admin-panel overflow-x-auto">
            <table className="admin-table min-w-[720px]">
              <thead>
                <tr>
                  <th>Что входит</th>
                  <th className="w-28">Количество</th>
                  <th className="w-40">Единица</th>
                  <th className="w-56">Цветок из справочника</th>
                  <th className="w-24" />
                </tr>
              </thead>
              <tbody>
                {components.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <p className="admin-empty">Состав не заполнен</p>
                    </td>
                  </tr>
                ) : (
                  components.map((component, index) => (
                    <tr key={component.key}>
                      <td>
                        <input
                          className="admin-input"
                          value={component.displayName}
                          disabled={!canUpdate}
                          placeholder="Пион розовый"
                          onChange={(event) => {
                            const value = event.target.value;
                            setComponents((prev) =>
                              prev.map((item, i) =>
                                i === index ? { ...item, displayName: value } : item,
                              ),
                            );
                            touch();
                          }}
                        />
                      </td>
                      <td>
                        <input
                          className="admin-input w-24 tabular-nums"
                          type="number"
                          min={1}
                          value={component.quantity}
                          disabled={!canUpdate}
                          onChange={(event) => {
                            const value = event.target.value;
                            setComponents((prev) =>
                              prev.map((item, i) =>
                                i === index ? { ...item, quantity: value } : item,
                              ),
                            );
                            touch();
                          }}
                        />
                      </td>
                      <td>
                        <select
                          className="admin-select"
                          value={component.unit}
                          disabled={!canUpdate}
                          onChange={(event) => {
                            const value = event.target.value as ComponentUnit;
                            setComponents((prev) =>
                              prev.map((item, i) => (i === index ? { ...item, unit: value } : item)),
                            );
                            touch();
                          }}
                        >
                          {COMPONENT_UNITS.map((unit) => (
                            <option key={unit} value={unit}>
                              {componentUnitLabel(unit)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          className="admin-select"
                          value={component.flowerId}
                          disabled={!canUpdate}
                          onChange={(event) => {
                            const value = event.target.value;
                            setComponents((prev) =>
                              prev.map((item, i) =>
                                i === index ? { ...item, flowerId: value } : item,
                              ),
                            );
                            touch();
                          }}
                        >
                          <option value="">Не привязан к фильтру</option>
                          {options.flowers.map((flower) => (
                            <option key={flower.id} value={flower.id}>
                              {flower.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="admin-btn-ghost"
                          disabled={!canUpdate}
                          onClick={() => {
                            setComponents((prev) => prev.filter((_, i) => i !== index));
                            touch();
                          }}
                        >
                          Удалить
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {canUpdate ? (
            <button
              type="button"
              className="admin-btn-ghost"
              onClick={() => {
                setComponents((prev) => [
                  ...prev,
                  {
                    key: nextKey('component'),
                    displayName: '',
                    quantity: '',
                    unit: 'PIECE',
                    flowerId: '',
                  },
                ]);
                touch();
              }}
            >
              Добавить строку состава
            </button>
          ) : null}
        </section>
      ) : null}

      {section === 'discovery' ? (
        <section className="admin-section">
          <h2 className="admin-section__title">Подбор</h2>
          <p className="admin-section__lead">
            По этим признакам покупатель находит букет в каталоге.
          </p>

          <label className="admin-field max-w-sm">
            <span>Размер букета</span>
            <select
              className="admin-select"
              value={discovery.bouquetSizeId}
              disabled={!canUpdate}
              onChange={(event) => {
                setDiscovery((prev) => ({ ...prev, bouquetSizeId: event.target.value }));
                touch();
              }}
            >
              <option value="">Не указан</option>
              {options.bouquetSizes.map((size) => (
                <option key={size.id} value={size.id}>
                  {size.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 lg:grid-cols-3">
            <fieldset className="admin-fieldset">
              <legend>Повод</legend>
              <div className="admin-checks">
                {options.occasions.map((option) => (
                  <label key={option.id} className="admin-check">
                    <input
                      type="checkbox"
                      disabled={!canUpdate}
                      checked={discovery.occasionIds.includes(option.id)}
                      onChange={() => {
                        setDiscovery((prev) => ({
                          ...prev,
                          occasionIds: toggleId(prev.occasionIds, option.id),
                        }));
                        touch();
                      }}
                    />
                    {option.name}
                  </label>
                ))}
                {options.occasions.length === 0 ? (
                  <p className="admin-empty">Справочник поводов пуст</p>
                ) : null}
              </div>
            </fieldset>

            <fieldset className="admin-fieldset">
              <legend>Кому</legend>
              <div className="admin-checks">
                {options.recipients.map((option) => (
                  <label key={option.id} className="admin-check">
                    <input
                      type="checkbox"
                      disabled={!canUpdate}
                      checked={discovery.recipientIds.includes(option.id)}
                      onChange={() => {
                        setDiscovery((prev) => ({
                          ...prev,
                          recipientIds: toggleId(prev.recipientIds, option.id),
                        }));
                        touch();
                      }}
                    />
                    {option.name}
                  </label>
                ))}
                {options.recipients.length === 0 ? (
                  <p className="admin-empty">Справочник получателей пуст</p>
                ) : null}
              </div>
            </fieldset>

            <fieldset className="admin-fieldset">
              <legend>Цвет</legend>
              <div className="admin-checks">
                {options.colors.map((option) => (
                  <label key={option.id} className="admin-check">
                    <input
                      type="checkbox"
                      disabled={!canUpdate}
                      checked={discovery.colorIds.includes(option.id)}
                      onChange={() => {
                        setDiscovery((prev) => ({
                          ...prev,
                          colorIds: toggleId(prev.colorIds, option.id),
                        }));
                        touch();
                      }}
                    />
                    <span
                      aria-hidden
                      className="admin-swatch admin-swatch--sm"
                      style={option.swatch ? { background: option.swatch } : undefined}
                    />
                    {option.name}
                  </label>
                ))}
                {options.colors.length === 0 ? (
                  <p className="admin-empty">Палитра пуста</p>
                ) : null}
              </div>
            </fieldset>
          </div>

          <fieldset className="admin-fieldset">
            <legend>Линейки</legend>
            <div className="admin-checks">
              {options.productLines.map((option) => (
                <label key={option.id} className="admin-check">
                  <input
                    type="checkbox"
                    disabled={!canUpdate}
                    checked={discovery.productLineIds.includes(option.id)}
                    onChange={() => {
                      setDiscovery((prev) => ({
                        ...prev,
                        productLineIds: toggleId(prev.productLineIds, option.id),
                      }));
                      touch();
                    }}
                  />
                  {option.name}
                </label>
              ))}
              {options.productLines.length === 0 ? (
                <p className="admin-empty">Справочник линеек пуст</p>
              ) : null}
            </div>
          </fieldset>

          <p className="admin-help">
            Цветы:{' '}
            {server.flowers.length > 0
              ? server.flowers.map((flower) => flower.name).join(', ')
              : 'не определены'}{' '}
            — собираются из состава букета, отдельно не выбираются.
          </p>
        </section>
      ) : null}

      {section === 'promotion' ? (
        <section className="admin-section">
          <h2 className="admin-section__title">Акция и витрины</h2>
          <p className="admin-section__lead">
            Скидка для витрины «Акции» и участие в подборках главной (бестселлеры / подарки).
          </p>

          <div className="admin-subsection">
            <h3 className="admin-subsection__title">Акция</h3>
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
              <div className="mt-4 grid gap-4 md:grid-cols-2">
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
                  </label>
                ) : (
                  <div className="admin-field">
                    <span>Цена по акции для активных вариантов, BYN</span>
                    <div className="mt-1 grid gap-2">
                      {activeVariants.map((variant) => (
                        <label key={variant.key} className="admin-field admin-field--row">
                          <span className="w-40 truncate">{variant.name || 'Без названия'}</span>
                          <input
                            className="admin-input w-32 tabular-nums"
                            value={variant.salePriceMajor}
                            disabled={!canUpdate}
                            inputMode="decimal"
                            placeholder="99,00"
                            onChange={(event) => {
                              const value = event.target.value;
                              setVariants((prev) =>
                                prev.map((item) =>
                                  item.key === variant.key
                                    ? { ...item, salePriceMajor: value }
                                    : item,
                                ),
                              );
                              touch();
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <label className="admin-field">
                  <span>Начало (необязательно)</span>
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
                  <span>Окончание (необязательно)</span>
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

                <div className="md:col-span-2">
                  <p className="admin-field__hint mb-2">
                    Как увидит покупатель
                    {server.promotion?.currentlyEffective ? ' · акция идёт сейчас' : ''}
                  </p>
                  <div className="admin-panel overflow-x-auto">
                    <table className="admin-table min-w-[480px]">
                      <thead>
                        <tr>
                          <th>Вариант</th>
                          <th className="w-40">Обычная цена</th>
                          <th className="w-40">Цена по акции</th>
                        </tr>
                      </thead>
                      <tbody>
                        {promotionPreview.length === 0 ? (
                          <tr>
                            <td colSpan={3}>
                              <p className="admin-empty">Нет активных вариантов</p>
                            </td>
                          </tr>
                        ) : (
                          promotionPreview.map((row) => (
                            <tr key={row.key}>
                              <td>{row.name || 'Без названия'}</td>
                              <td className="tabular-nums admin-price-old">{row.regular}</td>
                              <td className="tabular-nums">
                                <span className="admin-price-sale">{row.sale}</span>
                                {row.note ? (
                                  <span className="block text-xs text-amber-700">{row.note}</span>
                                ) : null}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="admin-subsection">
            <h3 className="admin-subsection__title">Бестселлеры</h3>
            {bestsellerGroups.length === 0 ? (
              <p className="admin-empty">Подборки бестселлеров ещё не созданы</p>
            ) : (
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
            )}
            <p className="admin-help">
              Группа со slug <code>podarki</code> питает блок «Подарки» на главной. Порядок внутри
              подборки — в{' '}
              <a href="/admin/bestsellers" className="underline underline-offset-2">
                Бестселлеры
              </a>
              .
            </p>
          </div>
        </section>
      ) : null}

      {section === 'seo' ? (
        <section className="admin-section">
          <h2 className="admin-section__title">SEO</h2>
          <div className="grid max-w-2xl gap-4">
            <label className="admin-field">
              <span>Заголовок для поиска</span>
              <input
                className="admin-input"
                value={seo.seoTitle}
                disabled={!canUpdate}
                placeholder={server.seo.resolvedTitle}
                onChange={(event) => {
                  setSeo((prev) => ({ ...prev, seoTitle: event.target.value }));
                  touch();
                }}
              />
            </label>
            <label className="admin-field">
              <span>Описание для поиска</span>
              <textarea
                className="admin-input"
                rows={3}
                value={seo.seoDescription}
                disabled={!canUpdate}
                placeholder={server.seo.resolvedDescription}
                onChange={(event) => {
                  setSeo((prev) => ({ ...prev, seoDescription: event.target.value }));
                  touch();
                }}
              />
            </label>
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

            <div className="admin-serp">
              <p className="admin-serp__title">{server.seo.resolvedTitle}</p>
              <p className="admin-serp__url">/bukety/{server.slug}</p>
              <p className="admin-serp__text">{server.seo.resolvedDescription}</p>
            </div>

            {seoWarnings.length > 0 ? (
              <ul className="admin-warnings">
                {seoWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      ) : null}

      {section === 'publication' ? (
        <section className="admin-section">
          <h2 className="admin-section__title">Публикация</h2>
          <div className="grid max-w-2xl gap-4">
            <p className="text-sm text-[var(--admin-muted)]">
              Состояние: <span className="admin-chip">{lifecycleLabel(server.lifecycle)}</span>
              {server.publishedAt
                ? ` · опубликован ${formatAdminDateTime(server.publishedAt)}`
                : ''}
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

            <div className="grid gap-4 sm:grid-cols-2">
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
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canPublish ? (
                <>
                  <Button
                    type="button"
                    disabled={pending || server.lifecycle === 'PUBLISHED'}
                    className="!rounded-lg !bg-[var(--admin-brand)]"
                    onClick={() => void runLifecycle('publish')}
                  >
                    Опубликовать
                  </Button>
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    disabled={pending || server.lifecycle !== 'PUBLISHED'}
                    onClick={() => void runLifecycle('unpublish')}
                  >
                    Снять с витрины
                  </button>
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    disabled={pending || server.lifecycle === 'ARCHIVED'}
                    onClick={() => void runLifecycle('archive')}
                  >
                    В архив
                  </button>
                </>
              ) : (
                <p className="admin-help">Публикацией управляет роль с правом публикации.</p>
              )}
              <a
                className="admin-btn-ghost"
                href={`/admin/catalog/products/${server.id}/preview`}
              >
                Предпросмотр
              </a>
            </div>

            <p className="admin-help">
              «Черновик» не виден покупателям. «В архиве» убирает товар из каталога, но сохраняет
              историю заказов.
            </p>
          </div>
        </section>
      ) : null}

      {canUpdate ? (
        <div className="admin-savebar">
          <Button
            type="button"
            disabled={pending}
            className="!rounded-lg !bg-[var(--admin-brand)]"
            onClick={() => void onSave()}
          >
            {pending ? 'Сохранение…' : 'Сохранить'}
          </Button>
          {dirty ? (
            <span className="text-sm text-amber-700">Есть несохранённые изменения</span>
          ) : savedAt ? (
            <span className="text-sm text-[var(--admin-muted)]">Сохранено в {savedAt}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

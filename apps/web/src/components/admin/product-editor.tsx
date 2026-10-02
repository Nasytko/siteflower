'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  analyzeProductSeo,
  applyPercentOff,
  COMMERCIAL_AVAILABILITIES,
  COMPONENT_UNITS,
  defaultProductSeoDescription,
  defaultProductSeoTitle,
  formatPriceFromMinor,
  normalizeSlug,
  PROMOTION_TYPES,
  seoStatusEmoji,
  seoStatusLabel,
  type ComponentUnit,
  type CommercialAvailability,
  type ProductAdminDto,
  type PromotionType,
  type VariantStatus,
} from '@bouquet-one/contracts';
import { Button } from '@bouquet-one/ui';
import {
  adminDelete,
  adminGet,
  adminPatch,
  adminPost,
  adminPut,
  adminUpload,
  AdminRequestError,
  errorMessage,
  fieldErrorMap,
  mediaErrorUserText,
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
import {
  formatMediaBytes,
  mediaPreflightStatusLabel,
  preflightMediaBatch,
  type MediaPreflightStatus,
} from '@/lib/admin-media-preflight';
import { prepareAdminMediaFile } from '@/lib/admin-media-prepare';
import { majorInputToMinor, minorToMajorInput } from '@/lib/admin-money';
import { toSameOriginMediaUrl } from '@/lib/media';
import {
  FieldError,
  FormErrorSummary,
  FormSaveStatus,
  phaseFromAdminError,
  type FormSavePhase,
} from '@/components/admin/form-status';

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
  const [savePending, setSavePending] = useState(false);
  const [mediaPending, setMediaPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [savePhase, setSavePhase] = useState<FormSavePhase>('idle');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [uploadStates, setUploadStates] = useState<
    Array<{
      id: string;
      name: string;
      status: MediaPreflightStatus;
      error: string | null;
      sizeLabel?: string;
      prepareSummary?: string | null;
      requestId?: string | null;
    }>
  >([]);
  const pending = savePending || mediaPending;
  const [slugManual, setSlugManual] = useState(
    () => normalizeSlug(product.name) !== product.slug,
  );

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
  const [seoManualOpen, setSeoManualOpen] = useState(
    () => Boolean(product.seoTitle?.trim() || product.seoDescription?.trim()),
  );
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
    setSlugManual(normalizeSlug(updated.name) !== updated.slug);
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
    setSeoManualOpen(Boolean(updated.seoTitle?.trim() || updated.seoDescription?.trim()));
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
    if (savePhase === 'saved' || savePhase === 'idle') {
      setSavePhase('dirty');
    }
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

  const seoHealth = useMemo(() => {
    const titleManual = seo.seoTitle.trim();
    const descriptionManual = seo.seoDescription.trim();
    const resolvedTitle = titleManual || defaultProductSeoTitle(basic.name.trim() || server.name);
    const resolvedDescription =
      descriptionManual ||
      defaultProductSeoDescription(
        basic.name.trim() || server.name,
        basic.shortDescription.trim() || server.shortDescription,
      );
    const slug = basic.slug.trim() || server.slug;
    // Mirror API effectivelyPublishedWhere / SeoHealthService.isEffectivelyPublished.
    const now = Date.now();
    const publishAtMs = server.publishAt ? Date.parse(server.publishAt) : NaN;
    const publishedAtMs = server.publishedAt ? Date.parse(server.publishedAt) : NaN;
    const unpublishAtMs = server.unpublishAt ? Date.parse(server.unpublishAt) : NaN;
    const scheduleStarted =
      (!Number.isNaN(publishAtMs) && publishAtMs <= now) ||
      (Number.isNaN(publishAtMs) && !Number.isNaN(publishedAtMs) && publishedAtMs <= now) ||
      (Number.isNaN(publishAtMs) && Number.isNaN(publishedAtMs));
    const scheduleOpen = Number.isNaN(unpublishAtMs) || unpublishAtMs > now;
    const effectivelyPublished =
      server.lifecycle === 'PUBLISHED' && scheduleStarted && scheduleOpen;
    return analyzeProductSeo({
      id: server.id,
      name: basic.name.trim() || server.name,
      slug,
      lifecycle: server.lifecycle,
      effectivelyPublished,
      noIndex: seo.noIndex,
      seoTitle: titleManual || null,
      seoDescription: descriptionManual || null,
      resolvedTitle,
      resolvedDescription,
      hasPrimaryMedia: server.media.some((item) => item.isPrimary),
      mediaCount: server.media.length,
      mediaMissingAlt: server.media.filter((item) => !item.alt?.trim()).length,
      hasPrice: variants.some((variant) => majorInputToMinor(variant.priceMajor) !== null),
      jsonLdReady: variants.some((variant) => majorInputToMinor(variant.priceMajor) !== null),
      path: `/bukety/${slug}`,
      adminHref: `/admin/catalog/products/${server.id}`,
      inSitemap: effectivelyPublished && !seo.noIndex && Boolean(slug),
    });
  }, [seo, basic, server, variants]);

  const previewTitle =
    seo.seoTitle.trim() || defaultProductSeoTitle(basic.name.trim() || server.name);
  const previewDescription =
    seo.seoDescription.trim() ||
    defaultProductSeoDescription(
      basic.name.trim() || server.name,
      basic.shortDescription.trim() || server.shortDescription,
    );
  const titleIsAutomatic = !seo.seoTitle.trim();
  const descriptionIsAutomatic = !seo.seoDescription.trim();

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
    if (promotion.enabled && promotion.type === 'PERCENT') {
      const percent = Number(promotion.percentOff);
      if (!Number.isInteger(percent) || percent < 1 || percent > 99) {
        return 'Скидка должна быть целым числом от 1 до 99%';
      }
    }
    if (!promotion.enabled && promotion.type === 'PERCENT' && promotion.percentOff.trim() !== '') {
      const percent = Number(promotion.percentOff);
      if (!Number.isInteger(percent) || percent < 1 || percent > 99) {
        return 'Скидка должна быть целым числом от 1 до 99%';
      }
    }
    if (promotion.enabled) {
      if (promotion.type === 'FIXED') {
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
      setFieldErrors(
        problem.includes('Скидка') ? { percentOff: problem } : {},
      );
      setSavePhase('validation');
      return;
    }
    setSavePending(true);
    setError(null);
    setFieldErrors({});
    setRequestId(null);
    setSavedAt(null);
    setSavePhase('saving');
    try {
      const percentValue = Number(promotion.percentOff);
      const hasValidPercent =
        Number.isInteger(percentValue) && percentValue >= 1 && percentValue <= 99;
      // DB requires PERCENT ⇒ percent_off NOT NULL. When disabled without a percent,
      // persist as FIXED + null (commercial rules skipped while disabled).
      const promotionType: PromotionType =
        promotion.type === 'PERCENT' && (promotion.enabled || hasValidPercent)
          ? 'PERCENT'
          : promotion.type === 'FIXED'
            ? 'FIXED'
            : hasValidPercent
              ? 'PERCENT'
              : 'FIXED';

      const current = await adminPut<ProductAdminDto>(adminEndpoints.productEditor(server.id), {
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
        variants: variants.map((variant, index) => ({
          name: variant.name.trim(),
          priceMinor: majorInputToMinor(variant.priceMajor) ?? '0',
          sortOrder: index,
          status: variant.status,
          // FIXED sale price travels with this variant row — server binds it to the new id.
          salePriceMinor:
            promotion.enabled && promotionType === 'FIXED' && variant.status === 'ACTIVE'
              ? (majorInputToMinor(variant.salePriceMajor) ?? null)
              : null,
        })),
        components: components.map((component, index) => ({
          displayName: component.displayName.trim(),
          quantity: component.quantity.trim().length > 0 ? Number(component.quantity) : null,
          unit: component.unit,
          flowerId: component.flowerId || null,
          sortOrder: index,
        })),
        bouquetSizeId: discovery.bouquetSizeId || null,
        occasionIds: discovery.occasionIds,
        recipientIds: discovery.recipientIds,
        colorIds: discovery.colorIds,
        productLineIds: discovery.productLineIds,
        promotion: {
          enabled: promotion.enabled,
          type: promotionType,
          percentOff: promotionType === 'PERCENT' ? percentValue : null,
          startsAt: fromDateTimeLocalValue(promotion.startsAt),
          endsAt: fromDateTimeLocalValue(promotion.endsAt),
        },
        groupIds,
      });

      resync(current);
      setDirty(false);
      setSavedAt(new Date().toLocaleTimeString('ru-BY'));
      setSavePhase('saved');
      router.refresh();
    } catch (err) {
      if (err instanceof AdminRequestError) {
        setFieldErrors(fieldErrorMap(err));
        setRequestId(err.requestId ?? null);
        setSavePhase(phaseFromAdminError(err));
        setError(errorMessage(err, 'Не удалось сохранить товар'));
      } else {
        setSavePhase('server');
        setError(errorMessage(err, 'Не удалось сохранить товар'));
      }
    } finally {
      setSavePending(false);
    }
  }

  async function runLifecycle(action: 'publish' | 'unpublish' | 'archive') {
    if (!canPublish) return;
    setSavePending(true);
    setError(null);
    setSavePhase('saving');
    try {
      const updated = await adminPost<ProductAdminDto>(
        adminEndpoints.productLifecycle(server.id, action),
        { expectedVersion: version },
      );
      resync(updated);
      router.refresh();
    } catch (err) {
      if (err instanceof AdminRequestError) {
        setRequestId(err.requestId ?? null);
        setSavePhase(phaseFromAdminError(err));
      } else {
        setSavePhase('server');
      }
      setError(errorMessage(err, 'Не удалось изменить статус'));
    } finally {
      setSavePending(false);
    }
  }

  async function onUpload(file: File) {
    if (!canUpdate) return;
    setMediaPending(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const updated = await adminUpload<ProductAdminDto>(
        adminEndpoints.productMedia(server.id),
        form,
      );
      setServer(updated);
      setVersion(updated.version);
      router.refresh();
    } catch (err) {
      setError(mediaErrorUserText(err, 'Не удалось загрузить фото'));
      throw err;
    } finally {
      setMediaPending(false);
    }
  }

  async function onUploadMany(files: FileList | File[]) {
    if (!canUpdate) return;
    const { accepted, rejected, capacityError } = await preflightMediaBatch(
      files,
      server.media.length,
    );
    const initialRows = [
      ...rejected.map((row, index) => ({
        id: `rej-${index}-${row.name}`,
        name: row.name,
        status: 'error' as const,
        error: row.error,
        sizeLabel: formatMediaBytes(row.sizeBytes),
        prepareSummary: null as string | null,
        requestId: null as string | null,
      })),
      ...accepted.map((row, index) => ({
        id: `acc-${index}-${row.name}-${row.sizeBytes}`,
        name: row.name,
        status: 'selected' as const,
        error: null as string | null,
        sizeLabel: formatMediaBytes(row.sizeBytes),
        prepareSummary: null as string | null,
        requestId: null as string | null,
      })),
    ];
    setUploadStates(initialRows);
    if (capacityError && accepted.length === 0) {
      setError(capacityError);
      return;
    }
    if (accepted.length === 0) {
      setError(rejected[0]?.error ?? 'Файлы не прошли проверку');
      return;
    }
    if (capacityError) {
      setError(capacityError);
    }

    for (let i = 0; i < accepted.length; i += 1) {
      const row = accepted[i]!;
      const rowId = `acc-${i}-${row.name}-${row.sizeBytes}`;
      setUploadStates((prev) =>
        prev.map((item) =>
          item.id === rowId ? { ...item, status: 'preparing' as const, error: null } : item,
        ),
      );

      let uploadFile = row.file;
      try {
        const prepared = await prepareAdminMediaFile(row.file);
        if (!prepared.ok) {
          setUploadStates((prev) =>
            prev.map((item) =>
              item.id === rowId
                ? {
                    ...item,
                    status: 'error' as const,
                    error: prepared.error ?? 'Не удалось обработать фотографию',
                  }
                : item,
            ),
          );
          continue;
        }
        uploadFile = prepared.file;
        setUploadStates((prev) =>
          prev.map((item) =>
            item.id === rowId
              ? {
                  ...item,
                  status: 'prepared' as const,
                  sizeLabel: formatMediaBytes(prepared.preparedSizeBytes),
                  prepareSummary: prepared.summary,
                }
              : item,
          ),
        );
      } catch {
        // Client prepare failed — fall back to original; API validates.
        uploadFile = row.file;
        setUploadStates((prev) =>
          prev.map((item) =>
            item.id === rowId ? { ...item, status: 'prepared' as const } : item,
          ),
        );
      }

      setUploadStates((prev) =>
        prev.map((item) =>
          item.id === rowId ? { ...item, status: 'uploading' as const } : item,
        ),
      );
      try {
        await onUpload(uploadFile);
        setUploadStates((prev) =>
          prev.map((item) =>
            item.id === rowId
              ? { ...item, status: 'uploaded' as const, error: null, requestId: null }
              : item,
          ),
        );
      } catch (err) {
        const rid = err instanceof AdminRequestError ? err.requestId ?? null : null;
        setUploadStates((prev) =>
          prev.map((item) =>
            item.id === rowId
              ? {
                  ...item,
                  status: 'error' as const,
                  error: mediaErrorUserText(err, 'Не удалось обработать фотографию'),
                  requestId: rid,
                }
              : item,
          ),
        );
      }
    }
  }

  async function patchMedia(mediaId: string, body: Record<string, unknown>) {
    if (!canUpdate) return;
    setMediaPending(true);
    setError(null);
    try {
      const updated = await adminPatch<ProductAdminDto>(
        adminEndpoints.productMediaItem(server.id, mediaId),
        { ...body },
      );
      setServer(updated);
      setVersion(updated.version);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось изменить фото'));
    } finally {
      setMediaPending(false);
    }
  }

  async function removeMedia(mediaId: string) {
    if (!canUpdate) return;
    if (!window.confirm('Удалить фотографию из товара?')) return;
    setMediaPending(true);
    setError(null);
    try {
      const updated = await adminDelete<ProductAdminDto>(
        adminEndpoints.productMediaItem(server.id, mediaId),
      );
      setServer(updated);
      setVersion(updated.version);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось удалить фото'));
    } finally {
      setMediaPending(false);
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

    setMediaPending(true);
    setError(null);
    try {
      const updated = await adminPut<ProductAdminDto>(
        adminEndpoints.productMediaOrder(server.id),
        {
          mediaIds: ordered.map((item) => item.id),
        },
      );
      setServer(updated);
      setVersion(updated.version);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось изменить порядок фото'));
    } finally {
      setMediaPending(false);
    }
  }

  const statusPhase: FormSavePhase =
    savePhase === 'saving' || savePhase === 'validation' || savePhase === 'conflict' ||
    savePhase === 'server' || savePhase === 'network' || savePhase === 'saved'
      ? savePhase
      : dirty
        ? 'dirty'
        : savedAt
          ? 'saved'
          : 'idle';

  const readOnlyNote = canUpdate ? null : (
    <p className="admin-help">Только просмотр: у вашей роли нет прав на изменение каталога.</p>
  );

  return (
    <div className="space-y-6">
      <FormSaveStatus
        phase={statusPhase}
        savedLabel={savedAt ? `Товар сохранён · ${savedAt}` : 'Все изменения сохранены'}
        errorMessage={error}
        requestId={requestId}
        onRetry={() => void onSave()}
        onRefresh={() => {
          void (async () => {
            try {
              const fresh = await adminGet<ProductAdminDto>(adminEndpoints.product(server.id));
              resync(fresh);
              setDirty(false);
              setError(null);
              setFieldErrors({});
              setRequestId(null);
              setSavePhase('idle');
              router.refresh();
            } catch (err) {
              setError(errorMessage(err, 'Не удалось обновить данные'));
              setSavePhase('server');
            }
          })();
        }}
        onDismiss={() => {
          setError(null);
          setSavePhase(dirty ? 'dirty' : 'idle');
        }}
      />
      {savePhase === 'validation' && Object.keys(fieldErrors).length > 0 ? (
        <FormErrorSummary
          message={error ?? 'Проверьте данные'}
          issues={Object.entries(fieldErrors).map(([field, message]) => ({ field, message }))}
        />
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
                  const name = event.target.value;
                  setBasic((prev) => ({
                    ...prev,
                    name,
                    ...(slugManual ? {} : { slug: normalizeSlug(name) }),
                  }));
                  touch();
                }}
              />
            </label>
            <label className="admin-field">
              <span>Адрес в ссылке (slug)</span>
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
              <span className="admin-field__hint">
                /bukety/{basic.slug || '…'} · заполняется автоматически из названия; можно изменить
                вручную
              </span>
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
          <h2 className="admin-section__title">Фотографии</h2>
          <p className="admin-section__lead">
            Добавьте до 12 фотографий товара. {server.media.length} из 12 уже загружено. Главное фото
            показывается в каталоге и на карточке товара.
          </p>
          {canUpdate ? (
            <div
              className="admin-panel"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (event.dataTransfer.files?.length) {
                  void onUploadMany(event.dataTransfer.files);
                }
              }}
            >
              <p className="admin-help">JPG, PNG, WebP, AVIF.</p>
              <p className="admin-field__hint mb-3">
                Можно загружать фотографии большого размера — система автоматически уменьшит и
                оптимизирует их для сайта. Максимальный размер исходного файла — 25 МБ. Перетащите
                файлы сюда или выберите кнопкой ниже.
              </p>
              <label className="admin-field">
                <span className="admin-btn-ghost inline-flex cursor-pointer px-3 py-2">
                  Добавить фотографии
                  <input
                    type="file"
                    className="sr-only"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    multiple
                    disabled={pending || server.media.length >= 12}
                    onChange={(event) => {
                      const files = event.target.files;
                      if (files?.length) void onUploadMany(files);
                      event.target.value = '';
                    }}
                  />
                </span>
              </label>
            </div>
          ) : null}
          {uploadStates.length > 0 ? (
            <ul className="admin-upload-status" aria-live="polite">
              {uploadStates.map((row) => {
                const icon =
                  row.status === 'error'
                    ? '✕'
                    : row.status === 'uploaded' || row.status === 'done'
                      ? '✓'
                      : row.status === 'preparing' || row.status === 'uploading'
                        ? '↻'
                        : '◌';
                return (
                  <li
                    key={row.id}
                    className={`admin-upload-status__row${
                      row.status === 'uploaded' || row.status === 'done'
                        ? ' admin-upload-status__row--done'
                        : row.status === 'error'
                          ? ' admin-upload-status__row--error'
                          : ''
                    }`}
                  >
                    <span>
                      {icon} {row.name}
                      {row.sizeLabel ? ` · ${row.sizeLabel}` : ''}
                      {row.prepareSummary ? ` · ${row.prepareSummary}` : ''}
                    </span>
                    <span className="admin-upload-status__meta">
                      {mediaPreflightStatusLabel(row.status)}
                    </span>
                    {row.error ? (
                      <span className="admin-field-error">
                        Не удалось обработать фотографию
                        <br />
                        Причина: {row.error}
                        {row.requestId ? (
                          <>
                            <br />
                            <span className="text-xs text-[var(--admin-muted)]">
                              Код запроса: {row.requestId}
                            </span>
                          </>
                        ) : null}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}

          {server.media.length === 0 ? (
            <p className="admin-empty">Фото пока нет. Без фото товар нельзя опубликовать.</p>
          ) : (
            <>
              <p className="admin-help mb-3">
                Используйте стрелки, чтобы изменить порядок. Перетаскивание не обязательно.
              </p>
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
                          maxLength={300}
                          disabled={!canUpdate}
                          placeholder={`Букет «${server.name}»`}
                          onBlur={(event) => {
                            const value = event.target.value.trim();
                            if (value === (media.alt ?? '')) return;
                            void patchMedia(media.id, { alt: value.length > 0 ? value : null });
                          }}
                        />
                      </label>
                      <div className="admin-row-actions mt-2">
                        {media.isPrimary ? (
                          <span className="admin-chip">★ Главное</span>
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
            </>
          )}
          <p className="admin-help">
            Фото сохраняются сразу, отдельно от кнопки «Сохранить». Удаление убирает фото из товара;
            файл в хранилище очищается позже служебной задачей.
          </p>
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
                        setFieldErrors((prev) => {
                          const next = { ...prev };
                          delete next.percentOff;
                          return next;
                        });
                        touch();
                      }}
                    />
                    <FieldError message={fieldErrors.percentOff} />
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
                  <span className="admin-field__hint">По времени Минска (Europe/Minsk)</span>
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
                  <span className="admin-field__hint">По времени Минска (Europe/Minsk)</span>
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
          <p className="admin-section__lead">
            Поисковые заголовок и описание собираются автоматически из названия и описания букета.
            Вручную менять их нужно только если хотите другой текст в поиске.
          </p>

          <div className="mb-4 rounded-lg border border-[var(--admin-border)] p-4">
            <p className="text-base font-semibold">
              {seoStatusEmoji(seoHealth.status)}{' '}
              {seoHealth.status === 'good'
                ? 'SEO настроено'
                : `${seoStatusLabel(seoHealth.status)}${
                    seoHealth.checks.filter((c) => c.severity === 'CRITICAL' || c.severity === 'WARNING')
                      .length
                      ? ` · ${
                          seoHealth.checks.filter(
                            (c) => c.severity === 'CRITICAL' || c.severity === 'WARNING',
                          ).length
                        } рекомендац.`
                      : ''
                  }`}
            </p>
            <p className="mt-1 text-sm text-[var(--admin-muted)]">{seoHealth.indexabilityLabel}</p>
          </div>

          <ul className="admin-checks mb-6 space-y-2">
            {seoHealth.checks
              .filter((check) => check.severity !== 'INFO' || check.code === 'PRODUCT_NOT_LIVE')
              .map((check) => (
                <li key={check.code} className="text-sm">
                  <span className="font-medium">
                    {check.severity === 'PASS' ? '✓' : check.severity === 'CRITICAL' ? '✕' : '!'}{' '}
                    {check.title}
                  </span>
                  <span className="mt-0.5 block text-[var(--admin-muted)]">{check.message}</span>
                </li>
              ))}
          </ul>

          <div className="grid max-w-2xl gap-4">
            <div className="admin-serp">
              <p className="admin-help mb-2">
                Примерный вид в поиске (не точная копия Google или Яндекса)
                {titleIsAutomatic && descriptionIsAutomatic
                  ? ' · автоматически'
                  : titleIsAutomatic || descriptionIsAutomatic
                    ? ' · частично вручную'
                    : ' · настроено вручную'}
              </p>
              <p className="admin-serp__title">{previewTitle}</p>
              <p className="admin-serp__url">/bukety/{basic.slug || server.slug}</p>
              <p className="admin-serp__text">{previewDescription}</p>
            </div>

            {!seoManualOpen ? (
              <div className="space-y-2">
                <p className="admin-help">
                  Заголовок: <strong>используется автоматически</strong>
                  <br />
                  Описание: <strong>используется автоматически</strong>
                </p>
                {canUpdate ? (
                  <button
                    type="button"
                    className="admin-btn-ghost px-3 py-2"
                    onClick={() => setSeoManualOpen(true)}
                  >
                    Настроить вручную
                  </button>
                ) : null}
              </div>
            ) : (
              <>
                <label className="admin-field">
                  <span>Заголовок для поиска</span>
                  <input
                    className="admin-input"
                    value={seo.seoTitle}
                    disabled={!canUpdate}
                    placeholder={defaultProductSeoTitle(basic.name.trim() || server.name)}
                    onChange={(event) => {
                      setSeo((prev) => ({ ...prev, seoTitle: event.target.value }));
                      touch();
                    }}
                  />
                  <span className="admin-field__hint">
                    {titleIsAutomatic
                      ? 'Используется автоматически'
                      : 'Задан вручную — перекрывает автоматический текст'}
                  </span>
                </label>
                <label className="admin-field">
                  <span>Описание для поиска</span>
                  <textarea
                    className="admin-input"
                    rows={3}
                    value={seo.seoDescription}
                    disabled={!canUpdate}
                    placeholder={defaultProductSeoDescription(
                      basic.name.trim() || server.name,
                      basic.shortDescription.trim() || server.shortDescription,
                    )}
                    onChange={(event) => {
                      setSeo((prev) => ({ ...prev, seoDescription: event.target.value }));
                      touch();
                    }}
                  />
                  <span className="admin-field__hint">
                    {descriptionIsAutomatic
                      ? 'Используется автоматически'
                      : 'Задано вручную — перекрывает автоматический текст'}
                  </span>
                </label>
                {canUpdate ? (
                  <button
                    type="button"
                    className="admin-btn-ghost px-3 py-2"
                    onClick={() => {
                      setSeo((prev) => ({ ...prev, seoTitle: '', seoDescription: '' }));
                      setSeoManualOpen(false);
                      touch();
                    }}
                  >
                    Сбросить → использовать автоматически
                  </button>
                ) : null}
              </>
            )}

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
            disabled={savePending || mediaPending}
            className="!rounded-lg !bg-[var(--admin-brand)]"
            onClick={() => void onSave()}
          >
            {savePending ? 'Сохранение…' : 'Сохранить'}
          </Button>
          <FormSaveStatus
            phase={
              savePending
                ? 'saving'
                : dirty
                  ? 'dirty'
                  : savedAt
                    ? 'saved'
                    : 'idle'
            }
            savedLabel={savedAt ? `Сохранено в ${savedAt}` : null}
          />
        </div>
      ) : null}
    </div>
  );
}

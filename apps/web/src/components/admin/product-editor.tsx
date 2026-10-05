'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  analyzeProductSeo,
  applyPercentOff,
  COMMERCIAL_AVAILABILITIES,
  defaultProductSeoDescription,
  defaultProductSeoTitle,
  formatPriceFromMinor,
  normalizeSlug,
  PROMOTION_TYPES,
  seoStatusEmoji,
  seoStatusLabel,
  DEFAULT_PRODUCT_VARIANT_NAME,
  deriveProductEditorReadiness,
  parsePositivePriceMajor,
  type ComponentUnit,
  type CommercialAvailability,
  type ProductAdminDto,
  type PromotionType,
  type VariantStatus,
} from '@bouquet-one/contracts';
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
import { adminEndpoints, withQuery } from '@/lib/admin-endpoints';
import {
  availabilityLabel,
  formatAdminDateTime,
  fromDateTimeLocalValue,
  lifecycleLabel,
  promotionTypeLabel,
  toDateTimeLocalValue,
} from '@/lib/admin-labels';
import { availabilityChipClass, lifecycleChipClass } from '@/lib/admin-status';
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
import { ProductReadinessPanel } from '@/components/admin/product-readiness-panel';
import {
  ProductEditorMainTab,
  type CompositionHit,
  type ComponentDraft,
  type VariantDraft,
} from '@/components/admin/product-editor-main-tab';

export type PickerOption = { id: string; name: string };

type Props = {
  product: ProductAdminDto;
  justCreated?: boolean;
  options: {
    occasions: PickerOption[];
    recipients: PickerOption[];
    colors: Array<PickerOption & { swatch?: string | null }>;
    bouquetSizes: PickerOption[];
    productLines: PickerOption[];
    categories: PickerOption[];
    families: Array<{ id: string; name: string }>;
  };
  bestsellerGroups: PickerOption[];
  canUpdate: boolean;
  canPublish: boolean;
};

type SectionId = 'basic' | 'photos' | 'sales' | 'publish';

const SECTIONS: Array<[SectionId, string]> = [
  ['basic', 'Основное'],
  ['photos', 'Фото'],
  ['sales', 'Продажи'],
  ['publish', 'SEO и публикация'],
];

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
  const sorted = [...product.variants].sort((a, b) => a.sortOrder - b.sortOrder);
  const drafts = sorted.map((variant) => ({
    key: nextKey('variant'),
    id: variant.id,
    name: variant.name,
    // Treat DB placeholder 0 as "price not set yet" for the manager UI.
    priceMajor:
      variant.priceMinor === '0'
        ? ''
        : minorToMajorInput(variant.priceMinor),
    status: variant.status,
    salePriceMajor: minorToMajorInput(salePrices.get(variant.id) ?? null),
  }));
  if (drafts.length === 0) {
    return [
      {
        key: nextKey('variant'),
        id: null,
        name: DEFAULT_PRODUCT_VARIANT_NAME,
        priceMajor: '',
        status: 'ACTIVE' as VariantStatus,
        salePriceMajor: '',
      },
    ];
  }
  return drafts;
}

function toComponentDrafts(product: ProductAdminDto): ComponentDraft[] {
  return [...product.components]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((component) => ({
      key: nextKey('component'),
      displayName: component.displayName,
      quantity: component.quantity === null ? '' : String(component.quantity),
      unit: component.unit,
      flowerItemId: component.flowerItemId ?? '',
      flowerId: component.flowerId ?? '',
      typeName: component.flowerItem?.flowerType?.name ?? '',
      varietyName: component.flowerItem?.flowerVariety?.name ?? '',
      originName: component.flowerItem?.flowerOrigin?.name ?? '',
      stemLengthCm: component.flowerItem?.stemLengthCm ?? null,
    }));
}

function familyMemberSortOrderFor(product: ProductAdminDto): number | undefined {
  return product.family?.members.find((member) => member.productId === product.id)?.sortOrder;
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
  justCreated = false,
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
  const [catalogCategoryId, setCatalogCategoryId] = useState(product.catalogCategoryId ?? '');
  const [familyId, setFamilyId] = useState(product.family?.id ?? '');
  const [familyPanelOpen, setFamilyPanelOpen] = useState(
    () => Boolean(product.family?.id) || (product.family?.members?.length ?? 0) > 0,
  );
  const [familyMemberSortOrder, setFamilyMemberSortOrder] = useState<number | undefined>(() =>
    familyMemberSortOrderFor(product),
  );
  const [familyOptions, setFamilyOptions] = useState(options.families);
  const [newFamilyName, setNewFamilyName] = useState('');
  const [creatingFamily, setCreatingFamily] = useState(false);
  const [addingFamilyProduct, setAddingFamilyProduct] = useState(false);
  const [familyReorderPending, setFamilyReorderPending] = useState(false);

  useEffect(() => {
    setFamilyOptions(options.families);
  }, [options.families]);
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
    setCatalogCategoryId(updated.catalogCategoryId ?? '');
    setFamilyId(updated.family?.id ?? '');
    if (updated.family?.id) setFamilyPanelOpen(true);
    setFamilyMemberSortOrder(familyMemberSortOrderFor(updated));
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

  const hasPrimaryImage = server.media.some((item) => item.isPrimary);

  const readiness = useMemo(
    () =>
      deriveProductEditorReadiness({
        name: basic.name,
        slug: basic.slug,
        catalogCategoryId: catalogCategoryId || null,
        variants: variants.map((v) => ({ status: v.status, priceMajor: v.priceMajor })),
        hasPrimaryImage,
        shortDescription: basic.shortDescription,
        description: basic.description,
        compositionHasFlowerItem: components.some((c) => Boolean(c.flowerItemId)),
      }),
    [
      basic.name,
      basic.slug,
      basic.shortDescription,
      basic.description,
      catalogCategoryId,
      variants,
      hasPrimaryImage,
      components,
    ],
  );

  const [compositionSearch, setCompositionSearch] = useState('');
  const [compositionAddQty, setCompositionAddQty] = useState('1');
  const [compositionPickerOpen, setCompositionPickerOpen] = useState(justCreated);
  const [compositionReplaceKey, setCompositionReplaceKey] = useState<string | null>(null);
  const [compositionHits, setCompositionHits] = useState<CompositionHit[]>([]);
  const [compositionSearchPending, setCompositionSearchPending] = useState(false);

  useEffect(() => {
    if (!compositionPickerOpen) return;
    const q = compositionSearch.trim();
    const timer = window.setTimeout(() => {
      setCompositionSearchPending(true);
      const assigned = new Set(components.map((c) => c.flowerItemId).filter(Boolean));
      if (compositionReplaceKey) {
        const replacing = components.find((row) => row.key === compositionReplaceKey);
        if (replacing?.flowerItemId) assigned.delete(replacing.flowerItemId);
      }
      void adminGet<{ items: CompositionHit[] }>(
        withQuery(adminEndpoints.flowerItems, {
          q: q || undefined,
          page: 1,
          pageSize: 20,
        }),
      )
        .then((data) => {
          setCompositionHits(
            (data.items ?? []).filter(
              (item) => item.visibility !== 'HIDDEN' && !assigned.has(item.id),
            ),
          );
        })
        .catch(() => setCompositionHits([]))
        .finally(() => setCompositionSearchPending(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [compositionSearch, compositionPickerOpen, components, compositionReplaceKey]);

  function flowerMetaFromHit(hit: CompositionHit | undefined, fallbackName: string) {
    return {
      displayName: hit?.name ?? fallbackName,
      typeName: hit?.flowerType?.name ?? '',
      varietyName: hit?.flowerVariety?.name ?? '',
      originName: hit?.flowerOrigin?.name ?? '',
      stemLengthCm: hit?.stemLengthCm ?? null,
    };
  }

  function addFlowerItemToComposition(itemId: string, itemName?: string) {
    const fromHits = compositionHits.find((row) => row.id === itemId);
    const meta = flowerMetaFromHit(fromHits, itemName ?? '');
    if (!meta.displayName) return;
    const qty = compositionAddQty.trim() || '1';

    if (compositionReplaceKey) {
      setComponents((prev) =>
        prev.map((row) =>
          row.key === compositionReplaceKey
            ? {
                ...row,
                ...meta,
                flowerItemId: itemId,
                flowerId: '',
                quantity: row.quantity.trim() ? row.quantity : qty,
              }
            : row,
        ),
      );
      setCompositionReplaceKey(null);
    } else {
      setComponents((prev) => [
        ...prev,
        {
          key: nextKey('component'),
          ...meta,
          quantity: qty,
          unit: 'STEM' as ComponentUnit,
          flowerItemId: itemId,
          flowerId: '',
        },
      ]);
    }
    setCompositionSearch('');
    setCompositionAddQty('1');
    touch();
  }

  function openCompositionReplace(componentKey: string) {
    setCompositionReplaceKey(componentKey);
    setCompositionPickerOpen(true);
    setCompositionSearch('');
  }

  const familyMembers = useMemo(() => {
    if (!server.family?.members.length) return [];
    return [...server.family.members].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [server.family]);

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
    if (variants.length === 0) return 'Укажите хотя бы одну цену';
    if (variants.length > 1) {
      const normalizedNames = variants.map((variant) => variant.name.trim().toLowerCase());
      if (normalizedNames.some((name) => name.length === 0)) {
        return 'Укажите название для каждого размера (например S, M, L)';
      }
      if (new Set(normalizedNames).size !== normalizedNames.length) {
        return 'Названия размеров не должны повторяться';
      }
    } else {
      // single size: empty name becomes «Стандарт» on save
    }
    for (const variant of variants) {
      const raw = variant.priceMajor.trim();
      if (!raw) continue; // draft may leave price empty → stored as 0 placeholder
      if (parsePositivePriceMajor(raw) === null) {
        return `Укажите цену больше нуля для «${variant.name || 'размера'}» (или очистите поле)`;
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
          if (sale === null) return `Укажите цену по акции для «${variant.name}»`;
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
        variants: variants.map((variant, index) => {
          const trimmedName = variant.name.trim();
          const fallbackName =
            variants.length === 1 ? DEFAULT_PRODUCT_VARIANT_NAME : `Размер ${index + 1}`;
          return {
            name: trimmedName || fallbackName,
            priceMinor: majorInputToMinor(variant.priceMajor) ?? '0',
            sortOrder: index,
            status: variant.status,
            // FIXED sale price travels with this variant row — server binds it to the new id.
            salePriceMinor:
              promotion.enabled && promotionType === 'FIXED' && variant.status === 'ACTIVE'
                ? (majorInputToMinor(variant.salePriceMajor) ?? null)
                : null,
          };
        }),
        components: components.map((component, index) => ({
          displayName: component.displayName.trim(),
          quantity: component.quantity.trim().length > 0 ? Number(component.quantity) : null,
          unit: component.unit,
          flowerItemId: component.flowerItemId || null,
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
        catalogCategoryId: catalogCategoryId || null,
        // Legacy Product.flower* is no longer edited here. Clear when composition uses FlowerItem.
        flowerTypeId: components.some((c) => c.flowerItemId)
          ? null
          : server.flowerTypeId ?? null,
        flowerVarietyId: components.some((c) => c.flowerItemId)
          ? null
          : server.flowerVarietyId ?? null,
        flowerOriginId: components.some((c) => c.flowerItemId)
          ? null
          : server.flowerOriginId ?? null,
        familyId: familyId || null,
        ...(familyId
          ? {
              familyMemberSortOrder:
                familyMemberSortOrder ??
                familyMemberSortOrderFor(server) ??
                familyMembers.length,
            }
          : {}),
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

  async function onCreateFamily() {
    if (!canUpdate) return;
    const name = newFamilyName.trim();
    if (name.length === 0) return;
    setCreatingFamily(true);
    setError(null);
    try {
      const created = await adminPost<{ id: string; name: string }>(adminEndpoints.productFamilies, {
        name,
      });
      setFamilyOptions((prev) => {
        if (prev.some((row) => row.id === created.id)) return prev;
        return [...prev, { id: created.id, name: created.name }].sort((a, b) =>
          a.name.localeCompare(b.name, 'ru'),
        );
      });
      setFamilyId(created.id);
      setFamilyMemberSortOrder(0);
      setNewFamilyName('');
      touch();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось создать линейку'));
    } finally {
      setCreatingFamily(false);
    }
  }

  async function onAddProductToLine() {
    if (!canUpdate || !familyId) return;
    if (dirty) {
      setError('Сначала сохраните изменения текущего товара, затем добавьте карточку в линейку.');
      return;
    }
    const lineName =
      familyOptions.find((row) => row.id === familyId)?.name ?? server.family?.name ?? 'Линейка';
    setAddingFamilyProduct(true);
    setError(null);
    try {
      const created = await adminPost<ProductAdminDto>(adminEndpoints.products, {
        name: `${lineName} — новая карточка`,
      });
      const sortedVariants = [...created.variants].sort((a, b) => a.sortOrder - b.sortOrder);
      await adminPut<ProductAdminDto>(adminEndpoints.productEditor(created.id), {
        expectedVersion: created.version,
        name: created.name,
        slug: created.slug,
        shortDescription: created.shortDescription,
        description: created.description,
        heightCm: created.heightCm,
        availability: created.availability,
        publishAt: null,
        unpublishAt: null,
        seoTitle: created.seoTitle,
        seoDescription: created.seoDescription,
        noIndex: created.noIndex,
        variants: (sortedVariants.length > 0
          ? sortedVariants
          : [{ name: DEFAULT_PRODUCT_VARIANT_NAME, priceMinor: '0', sortOrder: 0, status: 'ACTIVE' }]
        ).map((variant, index) => ({
          name: variant.name,
          priceMinor: variant.priceMinor,
          sortOrder: variant.sortOrder ?? index,
          status: variant.status,
          salePriceMinor: null,
        })),
        components: [],
        bouquetSizeId: null,
        occasionIds: [],
        recipientIds: [],
        colorIds: [],
        productLineIds: [],
        promotion: {
          enabled: false,
          type: 'PERCENT',
          percentOff: null,
          startsAt: null,
          endsAt: null,
        },
        groupIds: [],
        catalogCategoryId: null,
        flowerTypeId: null,
        flowerVarietyId: null,
        flowerOriginId: null,
        familyId,
        familyMemberSortOrder: familyMembers.length,
      });
      router.push(`/admin/catalog/products/${created.id}?created=1`);
    } catch (err) {
      setError(errorMessage(err, 'Не удалось добавить карточку в линейку'));
    } finally {
      setAddingFamilyProduct(false);
    }
  }

  async function reorderFamilyMember(productId: string, direction: -1 | 1) {
    if (!canUpdate || !server.family || familyReorderPending) return;
    const ordered = [...familyMembers];
    const index = ordered.findIndex((member) => member.productId === productId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const next = [...ordered];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);

    setFamilyReorderPending(true);
    setError(null);
    try {
      await adminPut(adminEndpoints.productFamilyMembersOrder(server.family.id), {
        orderedProductIds: next.map((member) => member.productId),
      });
      const fresh = await adminGet<ProductAdminDto>(adminEndpoints.product(server.id));
      setServer(fresh);
      setVersion(fresh.version);
      setFamilyMemberSortOrder(familyMemberSortOrderFor(fresh));
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось изменить порядок в семействе'));
    } finally {
      setFamilyReorderPending(false);
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
      <div className="admin-editor-header">
        <div className="space-y-2">
          <a
            href="/admin/catalog/products"
            className="admin-link text-sm"
            onClick={(event) => {
              if (!dirty) return;
              const ok = window.confirm(
                'Есть несохранённые изменения. Уйти со страницы без сохранения?',
              );
              if (!ok) event.preventDefault();
            }}
          >
            ← Все товары
          </a>
          <div className="admin-status-row">
            <span className={lifecycleChipClass(server.lifecycle)}>
              {lifecycleLabel(server.lifecycle)}
            </span>
            <span className={availabilityChipClass(publication.availability)}>
              {availabilityLabel(publication.availability)}
            </span>
          </div>
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
        </div>
        <div className="admin-editor-header__actions">
          {canUpdate ? (
            <button
              type="button"
              className="admin-btn"
              disabled={savePending || mediaPending}
              onClick={() => void onSave()}
            >
              {savePending ? 'Сохранение…' : 'Сохранить'}
            </button>
          ) : null}
          <a
            className="admin-btn-ghost"
            href={`/admin/catalog/products/${server.id}/preview`}
          >
            Предпросмотр
          </a>
          {canPublish && server.lifecycle !== 'PUBLISHED' ? (
            <button
              type="button"
              className="admin-btn-ghost"
              disabled={pending}
              onClick={() => void runLifecycle('publish')}
            >
              Опубликовать
            </button>
          ) : null}
          {canPublish && server.lifecycle === 'PUBLISHED' ? (
            <button
              type="button"
              className="admin-btn-ghost"
              disabled={pending}
              onClick={() => void runLifecycle('unpublish')}
            >
              Снять с витрины
            </button>
          ) : null}
        </div>
      </div>

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

      <ProductReadinessPanel
        items={readiness.items}
        readyToPublish={readiness.readyToPublish}
        blockingLabels={readiness.blockingLabels}
      />

      {justCreated ? (
        <p className="text-sm text-[var(--admin-muted)]">
          Черновик создан. Добавьте цветы, укажите цену и сохраните — затем фото и публикация.
        </p>
      ) : null}



      {section === 'basic' ? (
        <ProductEditorMainTab
          server={server}
          canUpdate={canUpdate}
          basic={basic}
          setBasic={setBasic}
          slugManual={slugManual}
          setSlugManual={setSlugManual}
          catalogCategoryId={catalogCategoryId}
          setCatalogCategoryId={setCatalogCategoryId}
          categories={options.categories}
          components={components}
          setComponents={setComponents}
          variants={variants}
          setVariants={setVariants}
          compositionPickerOpen={compositionPickerOpen}
          setCompositionPickerOpen={setCompositionPickerOpen}
          compositionReplaceKey={compositionReplaceKey}
          setCompositionReplaceKey={setCompositionReplaceKey}
          compositionSearch={compositionSearch}
          setCompositionSearch={setCompositionSearch}
          compositionAddQty={compositionAddQty}
          setCompositionAddQty={setCompositionAddQty}
          compositionHits={compositionHits}
          compositionSearchPending={compositionSearchPending}
          onAddFlower={addFlowerItemToComposition}
          onOpenReplace={openCompositionReplace}
          familyId={familyId}
          setFamilyId={setFamilyId}
          familyPanelOpen={familyPanelOpen}
          setFamilyPanelOpen={setFamilyPanelOpen}
          familyOptions={familyOptions}
          familyMembers={familyMembers}
          newFamilyName={newFamilyName}
          setNewFamilyName={setNewFamilyName}
          creatingFamily={creatingFamily}
          onCreateFamily={() => void onCreateFamily()}
          familyReorderPending={familyReorderPending}
          onReorderFamilyMember={(id, dir) => void reorderFamilyMember(id, dir)}
          onAddProductToLine={() => void onAddProductToLine()}
          addingFamilyProduct={addingFamilyProduct}
          hasPrimaryImage={hasPrimaryImage}
          onGoPhotos={() => setSection('photos')}
          touch={touch}
          nextVariantKey={() => nextKey('variant')}
        />
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

      {section === 'sales' ? (
        <section className="admin-section">
          <h2 className="admin-section__title">Продажи</h2>
          <p className="admin-section__lead">
            Как покупатель найдёт товар, акции и витрины.
          </p>

          <div className="admin-subsection space-y-3">
            <h3 className="admin-subsection__title">Из состава</h3>
            {components.some((row) => row.typeName.trim()) ? (
              <p className="text-sm">
                {[...new Set(components.map((r) => r.typeName.trim()).filter(Boolean))].join(' · ')}
              </p>
            ) : (
              <p className="admin-help">Добавьте цветы во вкладке «Основное».</p>
            )}
          </div>

          <div className="admin-subsection space-y-3">
            <h3 className="admin-subsection__title">Как покупатель найдёт товар</h3>

          {options.bouquetSizes.length > 0 ? (
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
          ) : null}

          <div className="grid gap-4 lg:grid-cols-3">
            {options.occasions.length > 0 ? (
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
              </div>
            </fieldset>
            ) : null}

            {options.recipients.length > 0 ? (
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
              </div>
            </fieldset>
            ) : null}

            {options.colors.length > 0 ? (
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
              </div>
            </fieldset>
            ) : null}
          </div>

          {options.productLines.length > 0 ? (
          <fieldset className="admin-fieldset">
            <legend>Коллекция</legend>
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
            </div>
          </fieldset>
          ) : null}
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
        </section>
      ) : null}

      {section === 'publish' ? (
        <section className="admin-section space-y-4">
          <h2 className="admin-section__title">SEO и публикация</h2>
          <ProductReadinessPanel
            items={readiness.items}
            readyToPublish={readiness.readyToPublish}
            blockingLabels={readiness.blockingLabels}
            compact
          />
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
              onClick={() => setSeoManualOpen((open) => !open)}
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
          <div className="grid max-w-2xl gap-4">
            <p className="admin-status-row text-sm text-[var(--admin-muted)]">
              <span>Состояние:</span>
              <span className={lifecycleChipClass(server.lifecycle)}>
                {lifecycleLabel(server.lifecycle)}
              </span>
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
                  <button
                    type="button"
                    className="admin-btn"
                    disabled={pending || server.lifecycle === 'PUBLISHED'}
                    onClick={() => void runLifecycle('publish')}
                  >
                    Опубликовать
                  </button>
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

    </div>
  );
}

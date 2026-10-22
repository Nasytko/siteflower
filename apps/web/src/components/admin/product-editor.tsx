'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  analyzeProductSeo,
  applyPercentOff,
  defaultProductSeoDescription,
  defaultProductSeoTitle,
  formatPriceFromMinor,
  isPlaceholderProductName,
  normalizeSlug,
  deriveProductEditorReadiness,
  parsePositivePriceMajor,
  productKindNeedsComposition,
  productKindNeedsGiftSubtype,
  suggestProductNameFromComposition,
  suggestStemProductName,
  type ComponentUnit,
  type CompositionPrecision,
  type ProductAdminDto,
  type ProductDeleteImpactDto,
  type ProductKind,
  type PromotionType,
  DEFAULT_PRODUCT_VARIANT_NAME,
} from '@bouquet-one/contracts';
import type { CategoryPickerOption } from '@/lib/admin-catalog-picker-labels';
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
  fromDateTimeLocalValue,
  lifecycleLabel,
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
import { majorInputToMinor } from '@/lib/admin-money';
import { toSameOriginMediaUrl } from '@/lib/media';
import {
  FormErrorSummary,
  FormSaveStatus,
  phaseFromAdminError,
  type FormSavePhase,
} from '@/components/admin/form-status';
import { ProductReadinessPanel } from '@/components/admin/product-readiness-panel';
import { ProductEditorMainTab } from '@/components/admin/product-editor-main-tab';
import { ProductEditorCompositionTab } from '@/components/admin/product-editor-composition-tab';
import { ProductEditorRelated } from '@/components/admin/product-editor-related';
import { ProductPlacementPanel } from '@/components/admin/product-placement-panel';
import {
  compositionHitMeta,
  emptyComponentDraft,
  nextEditorKey,
  toComponentDrafts,
  toVariantDrafts,
  type CompositionHit,
  type ComponentDraft,
  type PickerOption,
  type VariantDraft,
} from '@/components/admin/product-editor-shared';

export type { PickerOption, ComponentDraft, VariantDraft };

type Props = {
  product: ProductAdminDto;
  justCreated?: boolean;
  options: {
    occasions: PickerOption[];
    recipients: PickerOption[];
    colors: Array<PickerOption & { swatch?: string | null }>;
    categories: CategoryPickerOption[];
    families: Array<{ id: string; name: string }>;
  };
  bestsellerGroups: PickerOption[];
  canUpdate: boolean;
  canCreate: boolean;
  canPublish: boolean;
  canDelete?: boolean;
};

const READINESS_SECTION: Record<string, string> = {
  name: 'name',
  shortDescription: 'shortDescription',
  description: 'description',
  price: 'price',
  category: 'category',
  photo: 'photo',
  composition: 'composition',
  slug: 'seo',
};

type PromotionDraft = {
  enabled: boolean;
  type: PromotionType;
  percentOff: string;
  startsAt: string;
  endsAt: string;
};

function familyMemberSortOrderFor(product: ProductAdminDto): number | undefined {
  return product.family?.members.find((member) => member.productId === product.id)?.sortOrder;
}

function toPromotionDraft(product: ProductAdminDto): PromotionDraft {
  const promotion = product.promotion;
  return {
    enabled: promotion?.enabled ?? false,
    type: promotion?.type ?? 'PERCENT',
    percentOff:
      promotion?.percentOff === null || promotion?.percentOff === undefined
        ? ''
        : String(promotion.percentOff),
    startsAt: toDateTimeLocalValue(promotion?.startsAt ?? null),
    endsAt: toDateTimeLocalValue(promotion?.endsAt ?? null),
  };
}

export function ProductEditor({
  product,
  justCreated = false,
  options,
  bestsellerGroups: _bestsellerGroups,
  canUpdate,
  canCreate,
  canPublish,
  canDelete = false,
}: Props) {
  const router = useRouter();
  const initialKind: ProductKind = product.productKind ?? 'BOUQUET';
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
  const [nameManual, setNameManual] = useState(
    () => !justCreated && !isPlaceholderProductName(product.name, product.productKind),
  );
  const [deleteImpact, setDeleteImpact] = useState<ProductDeleteImpactDto | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [basic, setBasic] = useState({
    name: product.name,
    slug: product.slug,
    shortDescription: product.shortDescription ?? '',
    badgeLabel: product.badgeLabel ?? '',
    description: product.description ?? '',
    heightCm: product.heightCm === null ? '' : String(product.heightCm),
  });
  const [productKind, setProductKindState] = useState<ProductKind>(initialKind);
  const [compositionPrecision, setCompositionPrecision] = useState<CompositionPrecision>(
    product.compositionPrecision ?? 'UNKNOWN',
  );
  const [catalogCategoryId, setCatalogCategoryId] = useState(product.catalogCategoryId ?? '');
  const [taxonomyOptions, setTaxonomyOptions] = useState({
    occasions: options.occasions,
    recipients: options.recipients,
    colors: options.colors,
  });
  const [familyId, setFamilyId] = useState(product.family?.id ?? '');
  const [, setFamilyPanelOpen] = useState(
    () => Boolean(product.family?.id) || (product.family?.members?.length ?? 0) > 0,
  );
  const [familyMemberSortOrder, setFamilyMemberSortOrder] = useState<number | undefined>(() =>
    familyMemberSortOrderFor(product),
  );
  const [familyOptions, setFamilyOptions] = useState(options.families);
  const [newFamilyName, setNewFamilyName] = useState('');
  const [, setCreatingFamily] = useState(false);
  const [, setAddingFamilyProduct] = useState(false);
  const [familyReorderPending, setFamilyReorderPending] = useState(false);

  useEffect(() => {
    setFamilyOptions(options.families);
  }, [options.families]);

  useEffect(() => {
    setTaxonomyOptions({
      occasions: options.occasions,
      recipients: options.recipients,
      colors: options.colors,
    });
  }, [options.occasions, options.recipients, options.colors]);

  useEffect(() => {
    let cancelled = false;
    void adminGet<Array<{ key: string; name: string; description: string | null }>>(
      adminEndpoints.catalogPageTraits,
    )
      .then((rows) => {
        if (!cancelled) setTraitOptions(rows);
      })
      .catch(() => {
        if (!cancelled) setTraitOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [variants, setVariants] = useState<VariantDraft[]>(() => toVariantDrafts(product));
  const [components, setComponents] = useState<ComponentDraft[]>(() => toComponentDrafts(product));
  const [discovery, setDiscovery] = useState({
    occasionIds: product.occasions.map((item) => item.id),
    recipientIds: product.recipients.map((item) => item.id),
    colorIds: product.colors.map((item) => item.id),
    traitKeys: product.traitKeys ?? [],
  });
  const [traitOptions, setTraitOptions] = useState<
    Array<{ key: string; name: string; description: string | null }>
  >([]);
  const needsComposition = productKindNeedsComposition(productKind);
  const [promotion, setPromotion] = useState<PromotionDraft>(() => toPromotionDraft(product));
  const [, setGroupIds] = useState<string[]>(product.bestsellerGroupIds);
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
      badgeLabel: updated.badgeLabel ?? '',
      description: updated.description ?? '',
      heightCm: updated.heightCm === null ? '' : String(updated.heightCm),
    });
    setProductKindState(updated.productKind ?? 'BOUQUET');
    setCompositionPrecision(updated.compositionPrecision ?? 'UNKNOWN');
    setCatalogCategoryId(updated.catalogCategoryId ?? '');
    setFamilyId(updated.family?.id ?? '');
    if (updated.family?.id) setFamilyPanelOpen(true);
    setFamilyMemberSortOrder(familyMemberSortOrderFor(updated));
    setVariants(toVariantDrafts(updated));
    setComponents(toComponentDrafts(updated));
    setDiscovery({
      occasionIds: updated.occasions.map((item) => item.id),
      recipientIds: updated.recipients.map((item) => item.id),
      colorIds: updated.colors.map((item) => item.id),
      traitKeys: updated.traitKeys ?? [],
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

  const activeVariants = variants.filter((variant) => variant.status === 'ACTIVE');
  const hasPrimaryImage = server.media.some((item) => item.isPrimary);

  const readiness = useMemo(
    () =>
      deriveProductEditorReadiness({
        name: basic.name,
        slug: basic.slug,
        catalogCategoryId: catalogCategoryId || null,
        productKind,
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
      productKind,
      variants,
      hasPrimaryImage,
      components,
    ],
  );

  function changeProductKind(next: ProductKind) {
    if (next === productKind) return;
    const leavingComposition =
      productKindNeedsComposition(productKind) && !productKindNeedsComposition(next);
    if (leavingComposition && components.length > 0) {
      const ok = window.confirm(
        'У этого типа товара нет состава. Очистить строки состава в редакторе?',
      );
      if (!ok) return;
      setComponents([]);
    }
    const leavingGift =
      productKindNeedsGiftSubtype(productKind) && !productKindNeedsGiftSubtype(next);
    if (leavingGift && catalogCategoryId) {
      const ok = window.confirm(
        'Подтип подарка будет сброшен — раздел каталога определится по новому типу. Продолжить?',
      );
      if (!ok) return;
    }
    const hubWarning = window.confirm(
      'Основной раздел каталога сменится по типу товара (например, «Букеты» → «Цветы поштучно»). Публичный адрес карточки не меняется автоматически. Продолжить?',
    );
    if (!hubWarning) return;
    // Non-gifts: clear any leaf; gifts start without subtype until manager picks one.
    // Server assigns the canonical hub on save.
    setCatalogCategoryId('');
    setProductKindState(next);
    if (justCreated || !nameManual) {
      setNameManual(false);
    }
    touch();
  }

  function jumpToReadinessIssue(issueId: string) {
    window.requestAnimationFrame(() => {
      const el = document.querySelector(`[data-section="${READINESS_SECTION[issueId] ?? issueId}"]`);
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  function onTaxonomyCreated(
    kind: 'occasions' | 'recipients' | 'colors',
    item: PickerOption & { swatch?: string | null },
  ) {
    setTaxonomyOptions((prev) => {
      const list = prev[kind];
      if (list.some((row) => row.id === item.id)) return prev;
      return {
        ...prev,
        [kind]: [...list, item].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
      };
    });
  }

  const [compositionSearch, setCompositionSearch] = useState('');
  const [compositionAddQty, setCompositionAddQty] = useState('1');
  const [compositionReplaceKey, setCompositionReplaceKey] = useState<string | null>(null);
  const [compositionHits, setCompositionHits] = useState<CompositionHit[]>([]);
  const [compositionSearchPending, setCompositionSearchPending] = useState(false);
  const [compositionSearchError, setCompositionSearchError] = useState<string | null>(null);
  const compositionBrowseMode = compositionSearch.trim().length === 0;

  useEffect(() => {
    if (!needsComposition) return;
    const q = compositionSearch.trim();
    const timer = window.setTimeout(() => {
      setCompositionSearchPending(true);
      setCompositionSearchError(null);
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
        .catch(() => {
          setCompositionHits([]);
          setCompositionSearchError('Не удалось загрузить справочник цветов');
        })
        .finally(() => setCompositionSearchPending(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [compositionSearch, needsComposition, components, compositionReplaceKey]);

  function addFlowerItemToComposition(itemId: string, itemName?: string) {
    const fromHits = compositionHits.find((row) => row.id === itemId);
    const meta = compositionHitMeta(fromHits, itemName ?? '');
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
                quantity: row.quantity.trim() ? row.quantity : qty,
              }
            : row,
        ),
      );
      setCompositionReplaceKey(null);
    } else if (productKind === 'STEM') {
      setComponents([
        emptyComponentDraft({
          ...meta,
          quantity: '1',
          unit: 'STEM' as ComponentUnit,
          flowerItemId: itemId,
          role: 'PRIMARY',
        }),
      ]);
    } else {
      if (components.some((row) => row.flowerItemId === itemId)) {
        setError('Этот цветок уже есть в составе — измените количество или замените позицию');
        return;
      }
      setComponents((prev) => [
        ...prev,
        emptyComponentDraft({
          ...meta,
          quantity: qty,
          unit: 'STEM' as ComponentUnit,
          flowerItemId: itemId,
          role: 'PRIMARY',
        }),
      ]);
    }
    setCompositionSearch('');
    setCompositionAddQty('1');
    touch();
  }

  function applySuggestedPalette(colorIds: string[]) {
    setDiscovery((prev) => ({ ...prev, colorIds }));
    touch();
  }

  useEffect(() => {
    if (nameManual || !needsComposition) return;
    const suggested =
      productKind === 'STEM'
        ? suggestStemProductName(components[0] ?? { displayName: '' })
        : suggestProductNameFromComposition(
            components.map((row) => ({
              displayName: row.displayName,
              quantity: row.quantity.trim() ? Number(row.quantity) : null,
              typeName: row.typeName,
              varietyName: row.varietyName,
            })),
          );
    if (!suggested) return;
    setBasic((prev) => {
      if (prev.name === suggested) return prev;
      return {
        ...prev,
        name: suggested,
        ...(slugManual ? {} : { slug: normalizeSlug(suggested) }),
      };
    });
  }, [components, nameManual, needsComposition, productKind, slugManual]);

  const familyMembers = useMemo(() => {
    if (!server.family?.members.length) return [];
    return [...server.family.members].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [server.family]);

  const _promotionPreview = useMemo(() => {
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
        return 'Укажите название для каждого размера (например 7 шт, 15 шт)';
      }
      if (new Set(normalizedNames).size !== normalizedNames.length) {
        return 'Названия размеров не должны повторяться';
      }
    }
    for (const variant of variants) {
      const raw = variant.priceMajor.trim();
      if (!raw) continue;
      if (parsePositivePriceMajor(raw) === null) {
        return `Укажите цену больше нуля для «${variant.name || 'размера'}» (или очистите поле)`;
      }
    }
    if (needsComposition) {
      for (const component of components) {
        if (component.displayName.trim().length === 0) {
          return 'В составе есть строка без названия';
        }
        if (!component.flowerItemId) {
          return `В составе «${component.displayName}» не выбран цветок из справочника`;
        }
      }
      if (compositionPrecision === 'EXACT') {
        for (const component of components) {
          if (component.role === 'PRIMARY') {
            const qty = Number(component.quantity);
            if (!Number.isInteger(qty) || qty < 1) {
              return `При точном составе укажите количество ≥ 1 для «${component.displayName}»`;
            }
          }
        }
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
      setFieldErrors(problem.includes('Скидка') ? { percentOff: problem } : {});
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
        badgeLabel: basic.badgeLabel.trim() || null,
        description: basic.description.trim() || null,
        heightCm: basic.heightCm.trim().length > 0 ? Number(basic.heightCm) : null,
        productKind,
        compositionPrecision,
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
          const existingSale = server.promotion?.variantSalePrices?.find(
            (row) => row.variantId === variant.id,
          )?.salePriceMinor;
          return {
            name: trimmedName || fallbackName,
            priceMinor: majorInputToMinor(variant.priceMajor) ?? '0',
            sortOrder: index,
            status: variant.status,
            salePriceMinor:
              promotion.enabled && promotionType === 'FIXED' && variant.status === 'ACTIVE'
                ? (majorInputToMinor(variant.salePriceMajor) ?? existingSale ?? null)
                : null,
          };
        }),
        components: needsComposition
          ? components.map((component, index) => ({
              displayName: component.displayName.trim(),
              quantity: component.quantity.trim().length > 0 ? Number(component.quantity) : null,
              unit: component.unit,
              flowerItemId: component.flowerItemId,
              colorId: component.colorId || null,
              role: component.role,
              sortOrder: index,
            }))
          : [],
        occasionIds: discovery.occasionIds,
        recipientIds: discovery.recipientIds,
        colorIds: discovery.colorIds,
        traitKeys: discovery.traitKeys,
        promotion: {
          enabled: server.promotion?.enabled ?? false,
          type: server.promotion?.type ?? promotionType,
          percentOff: server.promotion?.percentOff ?? (promotionType === 'PERCENT' ? percentValue : null),
          startsAt: server.promotion?.startsAt ?? null,
          endsAt: server.promotion?.endsAt ?? null,
        },
        groupIds: server.bestsellerGroupIds,
        // Non-gifts: null → server assigns canonical hub. Gifts: subtype or null → gifts hub.
        catalogCategoryId: productKindNeedsGiftSubtype(productKind)
          ? catalogCategoryId || null
          : null,
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

  async function runLifecycle(action: 'publish' | 'unpublish' | 'archive' | 'restore') {
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

  async function openDelete() {
    if (!canDelete) return;
    setDeleteOpen(true);
    setDeleteConfirm('');
    try {
      setDeleteImpact(await adminGet<ProductDeleteImpactDto>(adminEndpoints.productDeleteImpact(server.id)));
    } catch (err) {
      setError(errorMessage(err, 'Не удалось проверить зависимости'));
    }
  }

  async function confirmDelete() {
    if (!canDelete || !deleteImpact) return;
    setSavePending(true);
    setError(null);
    try {
      await adminDelete(adminEndpoints.product(server.id), {
        expectedVersion: version,
        confirmName: deleteConfirm.trim(),
        detach: deleteImpact.detachable.length > 0,
      });
      router.push('/admin/catalog/products');
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось удалить товар'));
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

  async function _onCreateFamily() {
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

  async function _onAddProductToLine() {
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
        productKind: created.productKind ?? productKind,
        compositionPrecision: created.compositionPrecision ?? 'UNKNOWN',
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
        occasionIds: [],
        recipientIds: [],
        colorIds: [],
        promotion: {
          enabled: false,
          type: 'PERCENT',
          percentOff: null,
          startsAt: null,
          endsAt: null,
        },
        groupIds: [],
        catalogCategoryId: null,
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

  async function _reorderFamilyMember(productId: string, direction: -1 | 1) {
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
    savePhase === 'saving' ||
    savePhase === 'validation' ||
    savePhase === 'conflict' ||
    savePhase === 'server' ||
    savePhase === 'network' ||
    savePhase === 'saved'
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
        <div className="space-y-2 min-w-0">
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
          <h1 className="truncate text-xl font-semibold text-[var(--admin-ink)]">
            {basic.name.trim() || server.name || 'Без названия'}
          </h1>
          <div className="admin-status-row">
            <span className={lifecycleChipClass(server.lifecycle)}>
              {lifecycleLabel(server.lifecycle)}
            </span>
            <span className={availabilityChipClass(publication.availability)}>
              {availabilityLabel(publication.availability)}
            </span>
          </div>
          <ProductReadinessPanel
            compact
            readyToPublish={readiness.readyToPublish}
            issues={readiness.issues}
            recommendations={readiness.items
              .filter((item) => !item.requiredForPublish && !item.ok)
              .map((item) => ({ id: item.id, label: item.label }))}
            onJump={jumpToReadinessIssue}
          />
          <FormSaveStatus
            phase={savePending || mediaPending ? 'saving' : statusPhase}
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
          {canPublish && server.lifecycle !== 'PUBLISHED' ? (
            <button
              type="button"
              className="admin-btn-ghost"
              disabled={pending || !readiness.readyToPublish}
              title={
                readiness.readyToPublish
                  ? undefined
                  : `Не готово: ${readiness.blockingLabels.join(', ')}`
              }
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
          {canPublish && server.lifecycle === 'ARCHIVED' ? (
            <button
              type="button"
              className="admin-btn-ghost"
              disabled={pending}
              onClick={() => void runLifecycle('restore')}
            >
              Восстановить
            </button>
          ) : null}
          {canPublish && server.lifecycle !== 'ARCHIVED' ? (
            <button
              type="button"
              className="admin-btn-ghost"
              disabled={pending}
              onClick={() => void runLifecycle('archive')}
            >
              В архив
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

      {justCreated ? (
        <p className="text-sm text-[var(--admin-muted)]">
          Черновик создан. Состав и цена — на этой странице. Фото можно добавить сразу.
        </p>
      ) : null}

      {server.promotion?.enabled ? (
        <p className="admin-help">
          Участвует в акции. Условия меняются в разделе «Акции», не в карточке товара.
        </p>
      ) : null}

      <ProductEditorMainTab
        server={server}
        canUpdate={canUpdate}
        canCreate={canCreate}
        canPublish={canPublish}
        pending={pending}
        productKind={productKind}
        setProductKind={changeProductKind}
        basic={basic}
        setBasic={setBasic}
        slugManual={slugManual}
        nameManual={nameManual}
        onNameTyped={() => setNameManual(true)}
        blocks={['kind']}
        components={components}
        variants={variants}
        setVariants={setVariants}
        catalogCategoryId={catalogCategoryId}
        setCatalogCategoryId={setCatalogCategoryId}
        categories={options.categories}
        discovery={discovery}
        setDiscovery={setDiscovery}
        occasions={taxonomyOptions.occasions}
        recipients={taxonomyOptions.recipients}
        colors={taxonomyOptions.colors}
        traitOptions={traitOptions}
        onTaxonomyCreated={onTaxonomyCreated}
        publication={publication}
        setPublication={setPublication}
        hasPrimaryImage={hasPrimaryImage}
        mediaCount={server.media.length}
        onGoPhotos={() => jumpToReadinessIssue('photo')}
        onGoExtraVariants={() => undefined}
        onPublish={() => void runLifecycle('publish')}
        onUnpublish={() => void runLifecycle('unpublish')}
        onArchive={() => void runLifecycle('archive')}
        touch={touch}
      />

      {needsComposition ? (
        <ProductEditorCompositionTab
          canUpdate={canUpdate}
          productKind={productKind}
          components={components}
          setComponents={setComponents}
          compositionReplaceKey={compositionReplaceKey}
          setCompositionReplaceKey={setCompositionReplaceKey}
          compositionSearch={compositionSearch}
          setCompositionSearch={setCompositionSearch}
          compositionAddQty={compositionAddQty}
          setCompositionAddQty={setCompositionAddQty}
          compositionHits={compositionHits}
          compositionSearchPending={compositionSearchPending}
          compositionSearchError={compositionSearchError}
          compositionBrowseMode={compositionBrowseMode}
          onAddFlower={addFlowerItemToComposition}
          onSuggestPalette={applySuggestedPalette}
          touch={touch}
          nextComponentKey={() => nextEditorKey('component')}
        />
      ) : (
        <section className="sf-pe-card">
          <div className="sf-pe-card__head">
            <span className="sf-pe-card__index">2</span>
            <div>
              <h2>Состав</h2>
              <p className="sf-pe-card__lead">
                Для подарка, растения или другого типа состав из справочника цветов не нужен.
              </p>
            </div>
          </div>
        </section>
      )}

      <ProductEditorMainTab
        server={server}
        canUpdate={canUpdate}
        canCreate={canCreate}
        canPublish={canPublish}
        pending={pending}
        productKind={productKind}
        setProductKind={changeProductKind}
        basic={basic}
        setBasic={setBasic}
        slugManual={slugManual}
        nameManual={nameManual}
        onNameTyped={() => setNameManual(true)}
        blocks={['identity']}
        components={components}
        variants={variants}
        setVariants={setVariants}
        catalogCategoryId={catalogCategoryId}
        setCatalogCategoryId={setCatalogCategoryId}
        categories={options.categories}
        discovery={discovery}
        setDiscovery={setDiscovery}
        occasions={taxonomyOptions.occasions}
        recipients={taxonomyOptions.recipients}
        colors={taxonomyOptions.colors}
        traitOptions={traitOptions}
        onTaxonomyCreated={onTaxonomyCreated}
        publication={publication}
        setPublication={setPublication}
        hasPrimaryImage={hasPrimaryImage}
        mediaCount={server.media.length}
        onGoPhotos={() => jumpToReadinessIssue('photo')}
        onGoExtraVariants={() => undefined}
        onPublish={() => void runLifecycle('publish')}
        onUnpublish={() => void runLifecycle('unpublish')}
        onArchive={() => void runLifecycle('archive')}
        touch={touch}
      />

        <section className="admin-section sf-pe-card" data-section="photo">
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

      <ProductEditorMainTab
        server={server}
        canUpdate={canUpdate}
        canCreate={canCreate}
        canPublish={canPublish}
        pending={pending}
        productKind={productKind}
        setProductKind={changeProductKind}
        basic={basic}
        setBasic={setBasic}
        slugManual={slugManual}
        nameManual={nameManual}
        onNameTyped={() => setNameManual(true)}
        blocks={['copy', 'audience']}
        components={components}
        variants={variants}
        setVariants={setVariants}
        catalogCategoryId={catalogCategoryId}
        setCatalogCategoryId={setCatalogCategoryId}
        categories={options.categories}
        discovery={discovery}
        setDiscovery={setDiscovery}
        occasions={taxonomyOptions.occasions}
        recipients={taxonomyOptions.recipients}
        colors={taxonomyOptions.colors}
        traitOptions={traitOptions}
        onTaxonomyCreated={onTaxonomyCreated}
        publication={publication}
        setPublication={setPublication}
        hasPrimaryImage={hasPrimaryImage}
        mediaCount={server.media.length}
        onGoPhotos={() => jumpToReadinessIssue('photo')}
        onGoExtraVariants={() => undefined}
        onPublish={() => void runLifecycle('publish')}
        onUnpublish={() => void runLifecycle('unpublish')}
        onArchive={() => void runLifecycle('archive')}
        touch={touch}
      />

      <ProductEditorRelated
        product={server}
        canUpdate={canUpdate}
        members={familyMembers}
        onChanged={(updated) => {
          setServer(updated);
          setVersion(updated.version);
          setFamilyId(updated.family?.id ?? '');
          if (updated.family?.id) setFamilyPanelOpen(true);
          router.refresh();
        }}
      />

      <section className="sf-pe-card">
        <div className="sf-pe-card__head">
          <span className="sf-pe-card__index">8</span>
          <div>
            <h2>Размещение в каталоге</h2>
            <p className="sf-pe-card__lead">
              Только информация. Разделы считаются по типу, составу, цене и опубликованным правилам.
            </p>
          </div>
        </div>
        <div className="sf-pe-card__body">
          <ProductPlacementPanel productId={server.id} refreshKey={server.version} />
        </div>
      </section>

      <details className="sf-pe-card" open={seoManualOpen} data-section="seo">
        <summary className="sf-pe-card__toggle">
          <span className="sf-pe-card__index">9</span>
          <span>
            <strong>SEO</strong>
            <span className="sf-pe-card__lead">
              Адрес, title и description создаются автоматически. Ручная правка — только при необходимости.
            </span>
          </span>
        </summary>
        <div className="sf-pe-card__body space-y-3">
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
          </label>
          <label className="admin-field">
            <span>SEO title {titleIsAutomatic ? '(авто)' : ''}</span>
            <input
              className="admin-input"
              value={seo.seoTitle}
              disabled={!canUpdate}
              placeholder={previewTitle}
              onChange={(event) => {
                setSeo((prev) => ({ ...prev, seoTitle: event.target.value }));
                setSeoManualOpen(true);
                touch();
              }}
            />
          </label>
          <label className="admin-field">
            <span>Meta description {descriptionIsAutomatic ? '(авто)' : ''}</span>
            <textarea
              className="admin-input"
              rows={3}
              value={seo.seoDescription}
              disabled={!canUpdate}
              placeholder={previewDescription}
              onChange={(event) => {
                setSeo((prev) => ({ ...prev, seoDescription: event.target.value }));
                setSeoManualOpen(true);
                touch();
              }}
            />
          </label>
          <label className="admin-check">
            <input
              type="checkbox"
              checked={seo.noIndex}
              disabled={!canUpdate}
              onChange={(event) => {
                setSeo((prev) => ({ ...prev, noIndex: event.target.checked }));
                touch();
              }}
            />
            Не индексировать
          </label>
          <p className="admin-help">Статус SEO: {seoHealth.status}</p>
        </div>
      </details>

      {canDelete ? (
        <section className="sf-pe-card">
          <div className="sf-pe-card__head">
            <span className="sf-pe-card__index">!</span>
            <div>
              <h2>Удалить навсегда</h2>
              <p className="sf-pe-card__lead">
                Если есть заказы — удаление запрещено, используйте архив.
              </p>
            </div>
          </div>
          <div className="sf-pe-card__body space-y-3">
            {!deleteOpen ? (
              <button type="button" className="admin-btn-ghost" onClick={() => void openDelete()}>
                Проверить и удалить
              </button>
            ) : (
              <>
                {deleteImpact?.blockers.map((row) => (
                  <p key={row.code} className="admin-field-error">
                    {row.message}
                  </p>
                ))}
                {deleteImpact?.detachable.map((row) => (
                  <p key={row.code} className="admin-help">
                    {row.message}
                  </p>
                ))}
                {deleteImpact?.canDelete ? (
                  <>
                    <label className="admin-field">
                      <span>Введите название «{server.name}»</span>
                      <input
                        className="admin-input"
                        value={deleteConfirm}
                        onChange={(event) => setDeleteConfirm(event.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="admin-btn-ghost"
                      disabled={pending || deleteConfirm.trim() !== server.name.trim()}
                      onClick={() => void confirmDelete()}
                    >
                      Удалить навсегда
                    </button>
                  </>
                ) : (
                  <p className="admin-help">Физическое удаление недоступно — архивируйте товар.</p>
                )}
              </>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  analyzeProductSeo,
  defaultProductSeoTitle,
  isPlaceholderProductName,
  isValidErpSkuFormat,
  normalizeErpSku,
  normalizeSlug,
  deriveProductEditorReadiness,
  parsePositivePriceMajor,
  productDescriptionHasLegacyConflict,
  productKindNeedsComposition,
  productKindNeedsGiftSubtype,
  resolveProductMetaDescription,
  suggestProductNameFromComposition,
  suggestStemProductName,
  type PackagingAddonDto,
  type ProductAdminDto,
  type ProductDeleteImpactDto,
  type ProductKind,
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
import {
  optionGroupsToPayload,
  ProductEditorOptionsTab,
  toOptionGroupDrafts,
  type OptionGroupDraft,
} from '@/components/admin/product-editor-options-tab';
import { ProductEditorRelated } from '@/components/admin/product-editor-related';
import { ProductDeleteDialog } from '@/components/admin/product-delete-dialog';
import {
  compositionHitMeta,
  emptyComponentDraft,
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
    holidays: PickerOption[];
    recipients: PickerOption[];
    colors: Array<PickerOption & { swatch?: string | null }>;
    categories: CategoryPickerOption[];
    packagingAddons: PackagingAddonDto[];
  };
  canUpdate: boolean;
  canCreate: boolean;
  canPublish: boolean;
  canDelete?: boolean;
};

const READINESS_SECTION: Record<string, string> = {
  name: 'name',
  shortDescription: 'shortDescription',
  price: 'price',
  category: 'category',
  photo: 'photo',
  composition: 'composition',
  slug: 'seo',
};

function familyMemberSortOrderFor(product: ProductAdminDto): number | undefined {
  return product.family?.members.find((member) => member.productId === product.id)?.sortOrder;
}

export function ProductEditor({
  product,
  justCreated = false,
  options,
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
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [basic, setBasic] = useState({
    name: product.name,
    slug: product.slug,
    erpSku: product.erpSku ?? '',
    shortDescription: product.shortDescription ?? '',
    description: product.description ?? '',
    heightCm: product.heightCm === null ? '' : String(product.heightCm),
  });
  const [productKind, setProductKindState] = useState<ProductKind>(initialKind);
  const [catalogCategoryId, setCatalogCategoryId] = useState(product.catalogCategoryId ?? '');
  const [taxonomyOptions, setTaxonomyOptions] = useState({
    occasions: options.occasions,
    holidays: options.holidays,
    recipients: options.recipients,
    colors: options.colors,
  });
  const [familyId, setFamilyId] = useState(product.family?.id ?? '');
  const [familyMemberSortOrder, setFamilyMemberSortOrder] = useState<number | undefined>(() =>
    familyMemberSortOrderFor(product),
  );

  useEffect(() => {
    setTaxonomyOptions({
      occasions: options.occasions,
      holidays: options.holidays,
      recipients: options.recipients,
      colors: options.colors,
    });
  }, [options.occasions, options.holidays, options.recipients, options.colors]);

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

  const [editorSeed] = useState(() => {
    const seededVariants = toVariantDrafts(product);
    return {
      variants: seededVariants,
      optionGroups: toOptionGroupDrafts(product.optionGroups ?? [], seededVariants),
    };
  });
  const [variants, setVariants] = useState<VariantDraft[]>(() => editorSeed.variants);
  const [optionGroups, setOptionGroups] = useState<OptionGroupDraft[]>(
    () => editorSeed.optionGroups,
  );
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
    setSlugManual(normalizeSlug(updated.name) !== updated.slug);
    setBasic({
      name: updated.name,
      slug: updated.slug,
      erpSku: updated.erpSku ?? '',
      shortDescription: updated.shortDescription ?? '',
      description: updated.description ?? '',
      heightCm: updated.heightCm === null ? '' : String(updated.heightCm),
    });
    setProductKindState(updated.productKind ?? 'BOUQUET');
    setCatalogCategoryId(updated.catalogCategoryId ?? '');
    setFamilyId(updated.family?.id ?? '');
    setFamilyMemberSortOrder(familyMemberSortOrderFor(updated));
    const nextVariants = toVariantDrafts(updated);
    setVariants(nextVariants);
    setOptionGroups(toOptionGroupDrafts(updated.optionGroups ?? [], nextVariants));
    setComponents(toComponentDrafts(updated));
    setDiscovery({
      occasionIds: updated.occasions.map((item) => item.id),
      recipientIds: updated.recipients.map((item) => item.id),
      colorIds: updated.colors.map((item) => item.id),
      traitKeys: updated.traitKeys ?? [],
    });
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
    if (savePhase === 'saved' || savePhase === 'idle') {
      setSavePhase('dirty');
    }
  }

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
    kind: 'occasions' | 'holidays' | 'recipients' | 'colors',
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
    if (compositionReplaceKey) {
      setComponents((prev) =>
        prev.map((row) =>
          row.key === compositionReplaceKey
            ? {
                ...row,
                ...meta,
                flowerItemId: itemId,
                flowerItemMissing: false,
              }
            : row,
        ),
      );
      setCompositionReplaceKey(null);
    } else if (productKind === 'STEM') {
      setComponents([
        emptyComponentDraft({
          ...meta,
          flowerItemId: itemId,
        }),
      ]);
    } else {
      if (components.some((row) => row.flowerItemId === itemId)) {
        setError('Этот цветок уже есть в составе');
        return;
      }
      setComponents((prev) => [
        ...prev,
        emptyComponentDraft({
          ...meta,
          flowerItemId: itemId,
        }),
      ]);
    }
    setCompositionSearch('');
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

  const legacyDescriptionConflict = useMemo(
    () =>
      productDescriptionHasLegacyConflict({
        shortDescription: basic.shortDescription,
        description: basic.description || server.description,
      }),
    [basic.shortDescription, basic.description, server.description],
  );

  const seoHealth = useMemo(() => {
    const titleManual = seo.seoTitle.trim();
    const descriptionManual = seo.seoDescription.trim();
    const resolvedTitle =
      titleManual ||
      defaultProductSeoTitle(basic.name.trim() || server.name, productKind);
    const resolvedDescription = resolveProductMetaDescription({
      name: basic.name.trim() || server.name,
      seoDescription: descriptionManual || null,
      shortDescription: basic.shortDescription.trim() || server.shortDescription,
      description: basic.description || server.description,
      productKind,
    });
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
      path: `/products/${slug}`,
      adminHref: `/admin/catalog/products/${server.id}`,
      inSitemap: effectivelyPublished && !seo.noIndex && Boolean(slug),
    });
  }, [seo, basic, server, variants, productKind]);

  const previewTitle =
    seo.seoTitle.trim() ||
    defaultProductSeoTitle(basic.name.trim() || server.name, productKind);
  const previewDescription = resolveProductMetaDescription({
    name: basic.name.trim() || server.name,
    seoDescription: seo.seoDescription.trim() || null,
    shortDescription: basic.shortDescription.trim() || server.shortDescription,
    description: basic.description || server.description,
    productKind,
  });
  const titleIsAutomatic = !seo.seoTitle.trim();
  const descriptionIsAutomatic = !seo.seoDescription.trim();

  function validate(): string | null {
    if (basic.name.trim().length === 0) return 'Укажите название товара';
    if (basic.slug.trim().length === 0) return 'Укажите адрес в ссылке';
    const erpSkuNormalized = normalizeErpSku(basic.erpSku);
    if (erpSkuNormalized && !isValidErpSkuFormat(erpSkuNormalized)) {
      return 'Артикул ERP: латиница/цифры, допускается . _ - (без пробелов)';
    }
    for (const group of optionGroups) {
      for (const value of group.values) {
        const optSku = normalizeErpSku(value.erpSku);
        if (optSku && !isValidErpSkuFormat(optSku)) {
          return `Артикул ERP опции «${value.name || group.name}»: неверный формат`;
        }
      }
    }
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
      if (!components.some((c) => Boolean(c.flowerItemId))) {
        return 'Добавьте хотя бы один цветок из справочника';
      }
      for (const component of components) {
        if (!component.flowerItemId) {
          return 'В составе есть строка без выбранного цветка из справочника';
        }
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
      const current = await adminPut<ProductAdminDto>(adminEndpoints.productEditor(server.id), {
        expectedVersion: version,
        name: basic.name.trim(),
        slug: basic.slug.trim(),
        erpSku: normalizeErpSku(basic.erpSku),
        shortDescription: basic.shortDescription.trim() || null,
        // Task 03: do not send `description` — omit keeps legacy long body intact in DB.
        heightCm: basic.heightCm.trim().length > 0 ? Number(basic.heightCm) : null,
        productKind,
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
            ...(variant.id ? { id: variant.id } : {}),
            name: trimmedName || fallbackName,
            priceMinor: majorInputToMinor(variant.priceMajor) ?? '0',
            sortOrder: index,
            status: variant.status,
          };
        }),
        components: needsComposition
          ? components.map((component, index) => ({
              flowerItemId: component.flowerItemId,
              sortOrder: index,
            }))
          : [],
        optionGroups: optionGroupsToPayload(optionGroups, variants),
        occasionIds: discovery.occasionIds,
        recipientIds: discovery.recipientIds,
        colorIds: discovery.colorIds,
        traitKeys: discovery.traitKeys,
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
    setDeleteImpact(null);
    setDeleteLoading(true);
    setError(null);
    try {
      setDeleteImpact(
        await adminGet<ProductDeleteImpactDto>(adminEndpoints.productDeleteImpact(server.id)),
      );
    } catch (err) {
      setError(errorMessage(err, 'Не удалось проверить удаление'));
      setDeleteOpen(false);
    } finally {
      setDeleteLoading(false);
    }
  }

  function closeDelete() {
    if (savePending) return;
    setDeleteOpen(false);
    setDeleteImpact(null);
    setDeleteConfirm('');
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

  const mainTabShared = {
    canUpdate,
    canCreate,
    productKind,
    setProductKind: changeProductKind,
    basic,
    setBasic,
    slugManual,
    onNameTyped: () => setNameManual(true),
    components,
    variants,
    setVariants,
    catalogCategoryId,
    setCatalogCategoryId,
    categories: options.categories,
    discovery,
    setDiscovery,
    occasions: taxonomyOptions.occasions,
    holidays: taxonomyOptions.holidays,
    recipients: taxonomyOptions.recipients,
    colors: taxonomyOptions.colors,
    traitOptions,
    onTaxonomyCreated,
    publication,
    setPublication,
    touch,
    legacyDescriptionConflict,
  };

  const primaryMedia =
    server.media.find((item) => item.isPrimary) ??
    [...server.media].sort((a, b) => a.sortOrder - b.sortOrder)[0];

  return (
    <div className="sf-pe space-y-5">
      <div className="sf-pe-bar">
        <div className="sf-pe-bar__main min-w-0">
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
          <h1 className="sf-pe-bar__title truncate">
            {basic.name.trim() || server.name || 'Без названия'}
          </h1>
          <div className="sf-pe-meta">
            <span className={`sf-pe-pill ${lifecycleChipClass(server.lifecycle)}`}>
              {lifecycleLabel(server.lifecycle)}
            </span>
            <span className={`sf-pe-pill ${availabilityChipClass(publication.availability)}`}>
              {availabilityLabel(publication.availability)}
            </span>
            {dirty ? <span className="sf-pe-bar__dirty">Не сохранено</span> : null}
          </div>
          {!readiness.readyToPublish ? (
            <ProductReadinessPanel
              compact
              readyToPublish={false}
              issues={readiness.issues}
              onJump={jumpToReadinessIssue}
            />
          ) : null}
          <FormSaveStatus
            phase={savePending || mediaPending ? 'saving' : statusPhase}
            savedLabel={savedAt ? `Сохранено · ${savedAt}` : 'Изменения сохранены'}
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
        <div className="sf-pe-bar__actions">
          {canUpdate ? (
            <button
              type="button"
              className="sf-pe-btn sf-pe-btn--primary"
              disabled={savePending || mediaPending}
              onClick={() => void onSave()}
            >
              {savePending ? 'Сохранение…' : 'Сохранить'}
            </button>
          ) : null}
          {canPublish && server.lifecycle !== 'PUBLISHED' ? (
            <button
              type="button"
              className="sf-pe-btn"
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
              className="sf-pe-btn sf-pe-btn--quiet"
              disabled={pending}
              onClick={() => void runLifecycle('unpublish')}
            >
              Снять с витрины
            </button>
          ) : null}
          {canPublish && server.lifecycle === 'ARCHIVED' ? (
            <button
              type="button"
              className="sf-pe-btn"
              disabled={pending}
              onClick={() => void runLifecycle('restore')}
            >
              Вернуть из архива
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
        <div className="sf-pe-banner" role="status">
          <strong>Карточка создана, на сайте её ещё нет</strong>
          <span>Дальше по порядку: название и цена, фото, состав, описание. Сохраните и опубликуйте.</span>
        </div>
      ) : null}

      {server.promotion?.enabled ? (
        <p className="admin-help">Акция активна — условия в разделе «Акции».</p>
      ) : null}

      <div className="sf-pe-stack">
        <ProductEditorMainTab {...mainTabShared} blocks={['kind']} />

        <div className="sf-pe-hero">
          <section className="sf-pe-card" data-section="photo">
            <div className="sf-pe-card__head">
              <div>
              <h2>Фото</h2>
              <p className="sf-pe-card__lead">
                {server.media.length} из 12. Сохраняется сразу — кнопку «Сохранить» нажимать не нужно.
                Отмеченное «Главное» видно в каталоге.
              </p>
              </div>
            </div>
          <div className="sf-pe-card__body space-y-4">
            {primaryMedia ? (
              <img
                src={toSameOriginMediaUrl(primaryMedia.url) ?? primaryMedia.url}
                alt={primaryMedia.alt ?? ''}
                className="sf-pe-hero__photo"
              />
            ) : (
              <div className="admin-thumb-empty sf-pe-hero__photo">Фото для каталога</div>
            )}
            {canUpdate ? (
                <div
                  className="sf-pe-dropzone"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (event.dataTransfer.files?.length) {
                      void onUploadMany(event.dataTransfer.files);
                    }
                  }}
                >
                  <label className="sf-pe-btn inline-flex cursor-pointer">
                    Добавить фото
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
                  </label>
                  <p className="sf-pe-note">JPG, PNG, WebP, AVIF · до 25 МБ · можно перетащить</p>
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
              <p className="sf-pe-note">Без фото опубликовать нельзя.</p>
            ) : (
              <ul className="sf-pe-media-grid">
                  {[...server.media]
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((media, index, sorted) => (
                      <li key={media.id} className="sf-pe-media">
                        <img
                          src={toSameOriginMediaUrl(media.url) ?? media.url}
                          alt={media.alt ?? ''}
                          className="sf-pe-media__img"
                        />
                        <label className="sf-pe-field">
                          <span>Подпись</span>
                          <input
                            className="sf-pe-input"
                            defaultValue={media.alt ?? ''}
                            maxLength={300}
                            disabled={!canUpdate}
                            placeholder={`«${basic.name.trim() || server.name}»`}
                            onBlur={(event) => {
                              const value = event.target.value.trim();
                              if (value === (media.alt ?? '')) return;
                              void patchMedia(media.id, { alt: value.length > 0 ? value : null });
                            }}
                          />
                        </label>
                        <div className="sf-pe-media__actions">
                          {media.isPrimary ? (
                            <span className="sf-pe-pill sf-pe-pill--accent">Главное</span>
                          ) : (
                            <button
                              type="button"
                              className="sf-pe-btn sf-pe-btn--quiet"
                              disabled={!canUpdate || pending}
                              onClick={() => void patchMedia(media.id, { isPrimary: true })}
                            >
                              Главное
                            </button>
                          )}
                          <button
                            type="button"
                            className="sf-pe-iconbtn"
                            aria-label="Раньше"
                            disabled={!canUpdate || pending || index === 0}
                            onClick={() => void reorderMedia(media.id, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="sf-pe-iconbtn"
                            aria-label="Позже"
                            disabled={!canUpdate || pending || index === sorted.length - 1}
                            onClick={() => void reorderMedia(media.id, 1)}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="sf-pe-btn sf-pe-btn--quiet"
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
            </div>
          </section>
          <ProductEditorMainTab {...mainTabShared} blocks={['identity']} />
        </div>

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
            compositionHits={compositionHits}
            compositionSearchPending={compositionSearchPending}
            compositionSearchError={compositionSearchError}
            compositionBrowseMode={compositionBrowseMode}
            onAddFlower={addFlowerItemToComposition}
            touch={touch}
          />
        ) : null}

        <ProductEditorMainTab {...mainTabShared} blocks={['copy']} />

        {needsComposition ? (
          <ProductEditorOptionsTab
            canUpdate={canUpdate}
            optionGroups={optionGroups}
            setOptionGroups={setOptionGroups}
            variants={variants}
            packagingAddons={options.packagingAddons}
            touch={touch}
          />
        ) : null}

        <ProductEditorMainTab {...mainTabShared} blocks={['audience']} />

        <ProductEditorRelated
          product={server}
          canUpdate={canUpdate}
          members={familyMembers}
          onChanged={(updated) => {
            setServer(updated);
            setVersion(updated.version);
            setFamilyId(updated.family?.id ?? '');
            setFamilyMemberSortOrder(familyMemberSortOrderFor(updated));
            router.refresh();
          }}
        />

        <section className="sf-pe-card" data-section="seo">
          <div className="sf-pe-card__head">
            <div>
              <h2>Адрес и SEO</h2>
              <p className="sf-pe-card__lead">
                Ссылка на товар. Заголовок и описание для поиска подставятся сами, если оставить поля пустыми.
              </p>
            </div>
          </div>
          <div className="sf-pe-card__body sf-pe-form sf-pe-form--seo">
            <label className="sf-pe-field sf-pe-field--full">
              <span>Адрес в ссылке</span>
              <input
                className="sf-pe-input"
                value={basic.slug}
                disabled={!canUpdate}
                onChange={(event) => {
                  setSlugManual(true);
                  setBasic((prev) => ({ ...prev, slug: event.target.value }));
                  touch();
                }}
              />
            </label>
            <label className="sf-pe-field">
              <span>Заголовок в поиске {titleIsAutomatic ? '(подставится сам)' : ''}</span>
              <input
                className="sf-pe-input"
                value={seo.seoTitle}
                disabled={!canUpdate}
                placeholder={previewTitle}
                onChange={(event) => {
                  setSeo((prev) => ({ ...prev, seoTitle: event.target.value }));
                  touch();
                }}
              />
            </label>
            <label className="sf-pe-field">
              <span>Описание в поиске {descriptionIsAutomatic ? '(подставится само)' : ''}</span>
              <textarea
                className="sf-pe-input"
                rows={3}
                value={seo.seoDescription}
                disabled={!canUpdate}
                placeholder={previewDescription}
                onChange={(event) => {
                  setSeo((prev) => ({ ...prev, seoDescription: event.target.value }));
                  touch();
                }}
              />
            </label>
            <label className="sf-pe-check sf-pe-field--full">
              <input
                type="checkbox"
                checked={seo.noIndex}
                disabled={!canUpdate}
                onChange={(event) => {
                  setSeo((prev) => ({ ...prev, noIndex: event.target.checked }));
                  touch();
                }}
              />
              Скрыть страницу от поиска
            </label>
            <p className="sf-pe-note sf-pe-field--full">SEO: {seoHealth.status}</p>
          </div>
        </section>
      </div>

      {(canDelete || canPublish) && server.lifecycle !== 'ARCHIVED' ? (
        <section className="sf-pe-danger">
          <div>
            <h2>Убрать товар</h2>
            <p>Архив снимает товар с сайта, его можно вернуть. Удаление навсегда — только если заказов не было.</p>
          </div>
          <div className="sf-pe-danger__actions">
            {canPublish ? (
              <button
                type="button"
                className="sf-pe-btn sf-pe-btn--quiet"
                disabled={pending}
                onClick={() => void runLifecycle('archive')}
              >
                В архив
              </button>
            ) : null}
            {canDelete ? (
              <button
                type="button"
                className="sf-pe-btn sf-pe-btn--danger"
                disabled={pending}
                onClick={() => void openDelete()}
              >
                Удалить навсегда
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <ProductDeleteDialog
        open={deleteOpen}
        productName={server.name}
        loading={deleteLoading}
        pending={savePending}
        blockers={deleteImpact?.blockers ?? []}
        detachable={deleteImpact?.detachable ?? []}
        canDelete={Boolean(deleteImpact?.canDelete)}
        confirmName={deleteConfirm}
        onConfirmNameChange={setDeleteConfirm}
        onConfirm={() => void confirmDelete()}
        onClose={closeDelete}
        onArchive={
          canPublish
            ? () => {
                closeDelete();
                void runLifecycle('archive');
              }
            : undefined
        }
      />
    </div>
  );
}

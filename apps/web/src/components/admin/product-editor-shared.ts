import {
  DEFAULT_PRODUCT_VARIANT_NAME,
  type FlowerTypeCompositionClass,
  type ProductAdminDto,
  type VariantStatus,
} from '@bouquet-one/contracts';
import { minorToMajorInput } from '@/lib/admin-money';

export type PickerOption = { id: string; name: string };

export type CompositionHit = {
  id: string;
  name: string;
  visibility?: string;
  flowerType?: {
    id?: string;
    name: string;
    compositionClass?: FlowerTypeCompositionClass | null;
  };
  flowerForm?: { name: string } | null;
  flowerVariety?: { name: string } | null;
  flowerOrigin?: { name: string } | null;
  stemLengthCm?: number | null;
  colorId?: string | null;
  color?: { id: string; name: string; swatch?: string | null } | null;
};

export type ComponentDraft = {
  key: string;
  displayName: string;
  flowerItemId: string;
  typeId: string;
  typeName: string;
  formName: string;
  varietyName: string;
  originName: string;
  stemLengthCm: number | null;
  compositionClass: FlowerTypeCompositionClass | null;
  colorId: string;
  colorName: string;
  colorSwatch: string | null;
  /** Server row references a FlowerItem that could not be loaded. */
  flowerItemMissing?: boolean;
};

export type VariantDraft = {
  key: string;
  id: string | null;
  name: string;
  priceMajor: string;
  status: VariantStatus;
  salePriceMajor: string;
};

let keySeed = 0;

export function nextEditorKey(prefix: string): string {
  keySeed += 1;
  return `${prefix}-${keySeed}`;
}

export function toVariantDrafts(product: ProductAdminDto): VariantDraft[] {
  const salePrices = new Map(
    (product.promotion?.variantSalePrices ?? []).map((entry) => [
      entry.variantId,
      entry.salePriceMinor,
    ]),
  );
  const sorted = [...product.variants].sort((a, b) => a.sortOrder - b.sortOrder);
  const drafts = sorted.map((variant) => ({
    key: nextEditorKey('variant'),
    id: variant.id,
    name: variant.name,
    // Treat DB placeholder 0 as "price not set yet" for the manager UI.
    priceMajor: variant.priceMinor === '0' ? '' : minorToMajorInput(variant.priceMinor),
    status: variant.status,
    salePriceMajor: minorToMajorInput(salePrices.get(variant.id) ?? null),
  }));
  if (drafts.length === 0) {
    return [
      {
        key: nextEditorKey('variant'),
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

export function toComponentDrafts(product: ProductAdminDto): ComponentDraft[] {
  return [...product.components]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((component) => {
      const item = component.flowerItem;
      const fromItem = item?.color;
      const colorId = item?.colorId ?? '';
      const colorName = fromItem?.name ?? '';
      const colorSwatch = fromItem?.swatch ?? null;
      const flowerType = item?.flowerType;
      return {
        key: nextEditorKey('component'),
        displayName: component.displayName,
        flowerItemId: component.flowerItemId ?? '',
        typeId: item?.flowerTypeId ?? flowerType?.id ?? '',
        typeName: flowerType?.name ?? '',
        formName: item?.flowerForm?.name ?? '',
        varietyName: item?.flowerVariety?.name ?? '',
        originName: item?.flowerOrigin?.name ?? '',
        stemLengthCm: item?.stemLengthCm ?? null,
        compositionClass: flowerType?.compositionClass ?? null,
        colorId,
        colorName,
        colorSwatch,
        flowerItemMissing: Boolean(component.flowerItemId) && !item,
      };
    });
}

export function emptyComponentDraft(
  overrides: Partial<Omit<ComponentDraft, 'key'>> & { key?: string } = {},
): ComponentDraft {
  const { key, ...rest } = overrides;
  return {
    key: key ?? nextEditorKey('component'),
    displayName: '',
    flowerItemId: '',
    typeId: '',
    typeName: '',
    formName: '',
    varietyName: '',
    originName: '',
    stemLengthCm: null,
    compositionClass: null,
    colorId: '',
    colorName: '',
    colorSwatch: null,
    ...rest,
  };
}

export function compositionHitMeta(hit: CompositionHit | undefined, fallbackName: string) {
  return {
    displayName: hit?.name ?? fallbackName,
    typeId: hit?.flowerType?.id ?? '',
    typeName: hit?.flowerType?.name ?? '',
    formName: hit?.flowerForm?.name ?? '',
    varietyName: hit?.flowerVariety?.name ?? '',
    originName: hit?.flowerOrigin?.name ?? '',
    stemLengthCm: hit?.stemLengthCm ?? null,
    compositionClass: hit?.flowerType?.compositionClass ?? null,
    colorId: hit?.color?.id ?? hit?.colorId ?? '',
    colorName: hit?.color?.name ?? '',
    colorSwatch: hit?.color?.swatch ?? null,
  };
}

export function formatCompositionHitSubtitle(hit: CompositionHit): string {
  return [
    hit.flowerType?.name,
    hit.flowerForm?.name,
    hit.flowerVariety?.name,
    hit.color?.name,
  ]
    .filter(Boolean)
    .join(' · ');
}

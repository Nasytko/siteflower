import {
  DEFAULT_PRODUCT_VARIANT_NAME,
  type ComponentRole,
  type ComponentUnit,
  type ProductAdminDto,
  type VariantStatus,
} from '@bouquet-one/contracts';
import { minorToMajorInput } from '@/lib/admin-money';

export type PickerOption = { id: string; name: string };

export type CompositionHit = {
  id: string;
  name: string;
  visibility?: string;
  flowerType?: { name: string };
  flowerVariety?: { name: string } | null;
  flowerOrigin?: { name: string } | null;
  stemLengthCm?: number | null;
};

export type ComponentDraft = {
  key: string;
  displayName: string;
  quantity: string;
  unit: ComponentUnit;
  flowerItemId: string;
  typeName: string;
  varietyName: string;
  originName: string;
  stemLengthCm: number | null;
  role: ComponentRole;
  colorId: string;
  colorName: string;
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
    .map((component) => ({
      key: nextEditorKey('component'),
      displayName: component.displayName,
      quantity: component.quantity === null ? '' : String(component.quantity),
      unit: component.unit,
      flowerItemId: component.flowerItemId ?? '',
      typeName: component.flowerItem?.flowerType?.name ?? '',
      varietyName: component.flowerItem?.flowerVariety?.name ?? '',
      originName: component.flowerItem?.flowerOrigin?.name ?? '',
      stemLengthCm: component.flowerItem?.stemLengthCm ?? null,
      role: component.role ?? 'PRIMARY',
      colorId: component.colorId ?? '',
      colorName: component.color?.name ?? '',
    }));
}

export function emptyComponentDraft(
  overrides: Partial<Omit<ComponentDraft, 'key'>> & { key?: string } = {},
): ComponentDraft {
  const { key, ...rest } = overrides;
  return {
    key: key ?? nextEditorKey('component'),
    displayName: '',
    quantity: '1',
    unit: 'STEM',
    flowerItemId: '',
    typeName: '',
    varietyName: '',
    originName: '',
    stemLengthCm: null,
    role: 'PRIMARY',
    colorId: '',
    colorName: '',
    ...rest,
  };
}

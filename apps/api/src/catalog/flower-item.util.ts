import {
  flowerItemDisplayName,
  flowerItemIdentityKey,
  normalizeSlug,
  type ColorRefDto,
  type FlowerItemAdminDto,
  type FlowerItemDto,
  type TaxonomyRefDto,
  type TaxonomyVisibility,
} from '@bouquet-one/contracts';

export type FlowerItemRow = {
  id: string;
  flowerTypeId: string;
  flowerFormId: string | null;
  flowerVarietyId: string | null;
  flowerOriginId: string | null;
  colorId: string | null;
  stemLengthCm: number | null;
  imageUrl: string | null;
  identityKey: string;
  slug: string;
  name: string;
  sortOrder: number;
  visibility: TaxonomyVisibility;
  version: number;
  flowerType: { id: string; slug: string; name: string };
  flowerForm: { id: string; slug: string; name: string } | null;
  flowerVariety: { id: string; slug: string; name: string } | null;
  flowerOrigin: { id: string; slug: string; name: string } | null;
  color: { id: string; slug: string; name: string; swatch: string | null } | null;
  _count?: { components: number };
};

function toRef(row: { id: string; slug: string; name: string }): TaxonomyRefDto {
  return { id: row.id, slug: row.slug, name: row.name };
}

function toColorRef(
  row: { id: string; slug: string; name: string; swatch: string | null } | null,
): ColorRefDto | null {
  if (!row) return null;
  return { id: row.id, slug: row.slug, name: row.name, swatch: row.swatch };
}

export function toFlowerItemDto(row: FlowerItemRow): FlowerItemDto {
  return {
    id: row.id,
    flowerTypeId: row.flowerTypeId,
    flowerFormId: row.flowerFormId,
    flowerVarietyId: row.flowerVarietyId,
    flowerOriginId: row.flowerOriginId,
    colorId: row.colorId,
    stemLengthCm: row.stemLengthCm,
    imageUrl: row.imageUrl ?? null,
    slug: row.slug,
    name: row.name,
    sortOrder: row.sortOrder,
    visibility: row.visibility,
    flowerType: toRef(row.flowerType),
    flowerForm: row.flowerForm ? toRef(row.flowerForm) : null,
    flowerVariety: row.flowerVariety ? toRef(row.flowerVariety) : null,
    flowerOrigin: row.flowerOrigin ? toRef(row.flowerOrigin) : null,
    color: toColorRef(row.color),
  };
}

export function toFlowerItemAdminDto(row: FlowerItemRow): FlowerItemAdminDto {
  return {
    ...toFlowerItemDto(row),
    version: row.version,
    componentsCount: row._count?.components ?? 0,
    identityKey: row.identityKey,
  };
}

export function buildFlowerItemFields(input: {
  flowerTypeId: string;
  flowerFormId?: string | null;
  flowerVarietyId?: string | null;
  flowerOriginId?: string | null;
  stemLengthCm?: number | null;
  typeName: string;
  formName?: string | null;
  varietyName?: string | null;
  originName?: string | null;
  name?: string;
  slug?: string;
}) {
  const identityKey = flowerItemIdentityKey({
    flowerTypeId: input.flowerTypeId,
    flowerFormId: input.flowerFormId,
    flowerVarietyId: input.flowerVarietyId,
    flowerOriginId: input.flowerOriginId,
    stemLengthCm: input.stemLengthCm,
  });
  const name =
    input.name?.trim() ||
    flowerItemDisplayName({
      typeName: input.typeName,
      formName: input.formName,
      varietyName: input.varietyName,
      originName: input.originName,
      stemLengthCm: input.stemLengthCm,
    });
  const slugBase =
    input.slug?.trim() ||
    [
      input.typeName,
      input.formName,
      input.varietyName,
      input.originName,
      input.stemLengthCm != null ? `${input.stemLengthCm}cm` : null,
    ]
      .filter(Boolean)
      .join(' ');
  const slug = normalizeSlug(slugBase);
  return { identityKey, name, slug };
}

export const FLOWER_ITEM_INCLUDE = {
  flowerType: { select: { id: true, slug: true, name: true } },
  flowerForm: { select: { id: true, slug: true, name: true } },
  flowerVariety: { select: { id: true, slug: true, name: true } },
  flowerOrigin: { select: { id: true, slug: true, name: true } },
  color: { select: { id: true, slug: true, name: true, swatch: true } },
} as const;

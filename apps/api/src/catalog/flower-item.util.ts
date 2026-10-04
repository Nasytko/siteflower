import {
  flowerItemDisplayName,
  flowerItemIdentityKey,
  normalizeSlug,
  type FlowerItemAdminDto,
  type FlowerItemDto,
  type TaxonomyRefDto,
  type TaxonomyVisibility,
} from '@bouquet-one/contracts';

export type FlowerItemRow = {
  id: string;
  flowerTypeId: string;
  flowerVarietyId: string | null;
  flowerOriginId: string | null;
  heightCm: number | null;
  identityKey: string;
  slug: string;
  name: string;
  sortOrder: number;
  visibility: TaxonomyVisibility;
  version: number;
  flowerType: { id: string; slug: string; name: string };
  flowerVariety: { id: string; slug: string; name: string } | null;
  flowerOrigin: { id: string; slug: string; name: string } | null;
  _count?: { components: number };
};

function toRef(row: { id: string; slug: string; name: string }): TaxonomyRefDto {
  return { id: row.id, slug: row.slug, name: row.name };
}

export function toFlowerItemDto(row: FlowerItemRow): FlowerItemDto {
  return {
    id: row.id,
    flowerTypeId: row.flowerTypeId,
    flowerVarietyId: row.flowerVarietyId,
    flowerOriginId: row.flowerOriginId,
    heightCm: row.heightCm,
    slug: row.slug,
    name: row.name,
    sortOrder: row.sortOrder,
    visibility: row.visibility,
    flowerType: toRef(row.flowerType),
    flowerVariety: row.flowerVariety ? toRef(row.flowerVariety) : null,
    flowerOrigin: row.flowerOrigin ? toRef(row.flowerOrigin) : null,
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
  flowerVarietyId?: string | null;
  flowerOriginId?: string | null;
  heightCm?: number | null;
  typeName: string;
  varietyName?: string | null;
  originName?: string | null;
  name?: string;
  slug?: string;
}) {
  const identityKey = flowerItemIdentityKey({
    flowerTypeId: input.flowerTypeId,
    flowerVarietyId: input.flowerVarietyId,
    flowerOriginId: input.flowerOriginId,
    heightCm: input.heightCm,
  });
  const name =
    input.name?.trim() ||
    flowerItemDisplayName({
      typeName: input.typeName,
      varietyName: input.varietyName,
      originName: input.originName,
      heightCm: input.heightCm,
    });
  const slugBase =
    input.slug?.trim() ||
    [input.typeName, input.varietyName, input.originName, input.heightCm != null ? `${input.heightCm}cm` : null]
      .filter(Boolean)
      .join(' ');
  const slug = normalizeSlug(slugBase);
  return { identityKey, name, slug };
}

export const FLOWER_ITEM_INCLUDE = {
  flowerType: { select: { id: true, slug: true, name: true } },
  flowerVariety: { select: { id: true, slug: true, name: true } },
  flowerOrigin: { select: { id: true, slug: true, name: true } },
} as const;

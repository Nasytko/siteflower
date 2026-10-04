import type { CatalogCategoryAdminDto } from '@bouquet-one/contracts';

/** Flat category options with «Parent → Child» labels for admin selects. */
export function categoryPickerOptions(
  categories: CatalogCategoryAdminDto[],
): Array<{ id: string; name: string }> {
  const byId = new Map(categories.map((row) => [row.id, row]));

  function pathLabel(id: string): string {
    const parts: string[] = [];
    let cur: CatalogCategoryAdminDto | undefined = byId.get(id);
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      parts.unshift(cur.name);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return parts.join(' → ');
  }

  return categories
    .map((row) => ({
      id: row.id,
      name:
        row.visibility === 'HIDDEN' ? `${pathLabel(row.id)} (скрыта)` : pathLabel(row.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

export function suggestedCommercialProductName(input: {
  typeName: string | null;
  varietyName: string | null;
  heightCm: string;
  originName: string | null;
}): string {
  const parts: string[] = [];
  if (input.typeName?.trim()) parts.push(input.typeName.trim());
  if (input.varietyName?.trim()) parts.push(input.varietyName.trim());
  const height = input.heightCm.trim();
  if (height.length > 0) parts.push(`${height} см`);
  if (input.originName?.trim()) parts.push(input.originName.trim());
  return parts.join(' ');
}

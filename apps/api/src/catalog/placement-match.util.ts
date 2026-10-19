import type { Prisma } from '@bouquet-one/database';

/**
 * Human-readable summary of SEO landing rules for the placement panel.
 * Does not invent matches — only describes what the rules ask for.
 */
export function describeSeoLandingRules(rules: Prisma.JsonValue): string {
  const record =
    rules && typeof rules === 'object' && !Array.isArray(rules)
      ? (rules as Record<string, unknown>)
      : {};
  const parts: string[] = [];

  const productKinds = asList(record.productKinds);
  if (productKinds?.length) {
    parts.push(`тип: ${productKinds.map(kindLabel).join(', ')}`);
  }

  const only =
    asList(record.onlyFlowerTypeSlugs) ??
    asList(record.onlyFlowerTypeIds) ??
    (typeof record.onlyFlowerType === 'string' ? [record.onlyFlowerType] : undefined);
  if (only?.length) {
    parts.push(`только вид «${only.join(', ')}» (моно)`);
  }

  const contains =
    asList(record.flowerTypeSlugs) ??
    asList(record.flowerTypeIds) ??
    asList(record.containsFlowerTypeSlugs) ??
    (typeof record.containsFlowerType === 'string' ? [record.containsFlowerType] : undefined);
  if (contains?.length && !only?.length) {
    parts.push(`содержит вид «${contains.join(', ')}»`);
  }

  const composition =
    asList(record.compositionKinds) ??
    (typeof record.compositionType === 'string' ? [record.compositionType] : undefined);
  if (composition?.length) {
    parts.push(
      composition
        .map((k) => (k === 'MONO' ? 'монобукет' : k === 'MIXED' ? 'смешанный' : k))
        .join(', '),
    );
  }

  const forms = asList(record.flowerFormSlugs) ?? asList(record.flowerFormIds);
  if (forms?.length) parts.push(`форма «${forms.join(', ')}»`);

  const varieties = asList(record.flowerVarietySlugs) ?? asList(record.flowerVarietyIds);
  if (varieties?.length) parts.push(`сорт «${varieties.join(', ')}»`);

  const colors =
    asList(record.componentColorSlugs) ??
    asList(record.componentColorIds) ??
    asList(record.flowerColorSlugs) ??
    (typeof record.flowerColor === 'string' ? [record.flowerColor] : undefined);
  if (colors?.length) parts.push(`цвет «${colors.join(', ')}»`);

  if (typeof record.dominantFlowerTypeSlug === 'string' && record.dominantFlowerTypeSlug.trim()) {
    parts.push(`доминирует «${record.dominantFlowerTypeSlug.trim()}»`);
  }

  if (
    typeof record.minFlowerTypeQuantity === 'number' &&
    typeof record.flowerTypeQuantitySlug === 'string'
  ) {
    parts.push(
      `≥${record.minFlowerTypeQuantity} шт. «${record.flowerTypeQuantitySlug}» (точный состав)`,
    );
  }

  const traits = asList(record.traitKeys);
  if (traits?.length) {
    parts.push(
      traits
        .map((k) => (k === 'AUTHORIAL' ? 'авторский' : k))
        .join(', '),
    );
  }

  if (typeof record.minPriceMinor === 'string' || typeof record.minPriceMinor === 'number') {
    parts.push(`от ${record.minPriceMinor} коп.`);
  }
  if (typeof record.maxPriceMinor === 'string' || typeof record.maxPriceMinor === 'number') {
    parts.push(`до ${record.maxPriceMinor} коп.`);
  }

  const occasions = asList(record.occasionSlugs) ?? asList(record.occasionIds);
  if (occasions?.length) parts.push(`повод «${occasions.join(', ')}»`);

  const recipients = asList(record.recipientSlugs) ?? asList(record.recipientIds);
  if (recipients?.length) parts.push(`получатель «${recipients.join(', ')}»`);

  return parts.length > 0 ? parts.join(' · ') : 'правила подборки';
}

function asList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
  return items.length > 0 ? items : undefined;
}

function kindLabel(kind: string): string {
  switch (kind) {
    case 'BOUQUET':
      return 'букет';
    case 'COMPOSITION':
      return 'композиция';
    case 'STEM':
      return 'поштучно';
    case 'GIFT':
      return 'подарок';
    default:
      return kind;
  }
}

/** Extract flower-type slugs referenced by landing rules (for recommendation dedupe). */
export function flowerTypeSlugsFromRules(rules: Prisma.JsonValue): string[] {
  const record =
    rules && typeof rules === 'object' && !Array.isArray(rules)
      ? (rules as Record<string, unknown>)
      : {};
  const slugs = new Set<string>();
  for (const key of [
    'flowerTypeSlugs',
    'containsFlowerTypeSlugs',
    'onlyFlowerTypeSlugs',
  ] as const) {
    const list = asList(record[key]);
    if (list) for (const s of list) slugs.add(s);
  }
  if (typeof record.containsFlowerType === 'string' && record.containsFlowerType.trim()) {
    slugs.add(record.containsFlowerType.trim());
  }
  if (typeof record.onlyFlowerType === 'string' && record.onlyFlowerType.trim()) {
    slugs.add(record.onlyFlowerType.trim());
  }
  if (typeof record.dominantFlowerTypeSlug === 'string' && record.dominantFlowerTypeSlug.trim()) {
    slugs.add(record.dominantFlowerTypeSlug.trim());
  }
  if (typeof record.flowerTypeQuantitySlug === 'string' && record.flowerTypeQuantitySlug.trim()) {
    slugs.add(record.flowerTypeQuantitySlug.trim());
  }
  return [...slugs];
}

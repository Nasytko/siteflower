/**
 * Unified catalog page rules — ID-first product selection for CatalogCategory.rules.
 * Page URL slug is never treated as FlowerType identity; legacy slug tokens are
 * resolved through a taxonomy index (+ known aliases) with fail-closed diagnostics.
 */

import type { CompositionKind, ProductKind } from './catalog';

/**
 * TEMPORARY (Phase 2→3 transition): catalog/legacy rule tokens that historically
 * differed from FlowerType.slug. Runtime still resolves these so PLPs stay filled
 * before/without data migration.
 *
 * Removal conditions (all must hold):
 * 1. `20261024120000_catalog_rules_stable_ids` (or TS migrate script) applied on
 *    every environment that serves traffic.
 * 2. Dry-run report shows zero UNRESOLVED/AMBIGUOUS for flower-type slug tokens.
 * 3. All CatalogCategory / SeoLandingPage rules that referenced aliases persist
 *    `flowerTypeIds` / `onlyFlowerTypeIds`.
 * 4. Admin saves only `*Ids` (no new slug-only flower rules).
 * 5. Integration suite asserts `/katalog/rozy` matches via flowerTypeIds only.
 */
export const FLOWER_TYPE_SLUG_ALIASES: Readonly<Record<string, string>> = {
  // Catalog page URL plurals / historical tokens → FlowerType.slug
  rozy: 'roza',
  rosa: 'roza',
  hrizantemy: 'hrizantema',
  gerbery: 'gerbera',
  tyulpany: 'tyulpan',
  lilii: 'liliya',
};

/** @see FLOWER_TYPE_SLUG_ALIASES — documented removal gate for ops checklists. */
export const FLOWER_TYPE_SLUG_ALIASES_REMOVAL =
  'Remove after ID migration verified on staging + admin writes *Ids only';

export type CatalogRulesDiagnosticCode =
  | 'UNRESOLVED_SLUG'
  | 'AMBIGUOUS_SLUG'
  | 'EMPTY_AFTER_RESOLVE';

export type CatalogRulesDiagnostic = {
  code: CatalogRulesDiagnosticCode;
  field: string;
  value: string;
  message: string;
};

/** Slug → candidate ids (multiple = ambiguous). */
export type TaxonomySlugIndex = ReadonlyMap<string, readonly string[]>;

export type CatalogTaxonomyLookup = {
  flowerTypes: TaxonomySlugIndex;
  flowerForms: TaxonomySlugIndex;
  flowerVarieties: TaxonomySlugIndex;
  colors: TaxonomySlugIndex;
  occasions: TaxonomySlugIndex;
  recipients: TaxonomySlugIndex;
  /** Optional page-slug → flower-type-slug aliases (defaults include rozy→roza). */
  flowerTypeAliases?: Readonly<Record<string, string>>;
};

/** Normalized list filters produced from page rules (ID-preferring). */
export type ResolvedCatalogPageFilters = {
  productKinds?: ProductKind[];
  compositionKinds?: CompositionKind[];
  flowerTypeIds?: string[];
  flowerTypeSlugs?: string[];
  onlyFlowerTypeIds?: string[];
  onlyFlowerTypeSlugs?: string[];
  flowerFormIds?: string[];
  flowerFormSlugs?: string[];
  flowerVarietyIds?: string[];
  flowerVarietySlugs?: string[];
  colorIds?: string[];
  colorSlugs?: string[];
  componentColorIds?: string[];
  componentColorSlugs?: string[];
  occasionIds?: string[];
  occasionSlugs?: string[];
  recipientIds?: string[];
  recipientSlugs?: string[];
  minPriceMinor?: string;
  maxPriceMinor?: string;
  minFlowerTypeQuantity?: number;
  flowerTypeQuantitySlug?: string;
  dominantFlowerTypeSlug?: string;
  traitKeys?: string[];
};

export type CatalogPageRulesResolution = {
  filters: ResolvedCatalogPageFilters;
  diagnostics: CatalogRulesDiagnostic[];
  /**
   * When true, flower/form/variety/color slug rules could not be safely resolved.
   * Callers must not widen the product set — typically force an empty match.
   */
  blocking: boolean;
};

const PRODUCT_KIND_SET = new Set<string>([
  'BOUQUET',
  'COMPOSITION',
  'STEM',
  'PLANT',
  'GIFT',
  'OTHER',
]);
const COMPOSITION_KIND_SET = new Set<string>(['MONO', 'MIXED', 'UNKNOWN']);

function asStringArray(value: unknown): string[] | undefined {
  if (typeof value === 'string') {
    const parts = value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    return parts.length > 0 ? [...new Set(parts)] : undefined;
  }
  if (Array.isArray(value)) {
    const parts = value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
    return parts.length > 0 ? [...new Set(parts)] : undefined;
  }
  return undefined;
}

function asStringOrArray(value: unknown): string[] | undefined {
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return asStringArray(value);
}

function asRulesRecord(rules: unknown): Record<string, unknown> {
  if (rules && typeof rules === 'object' && !Array.isArray(rules)) {
    return rules as Record<string, unknown>;
  }
  return {};
}

function buildSlugIndex(
  rows: Array<{ id: string; slug: string }>,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const slug = row.slug.trim().toLowerCase();
    if (!slug) continue;
    const list = map.get(slug) ?? [];
    list.push(row.id);
    map.set(slug, list);
  }
  return map;
}

export function buildTaxonomySlugIndex(
  rows: Array<{ id: string; slug: string }>,
): TaxonomySlugIndex {
  return buildSlugIndex(rows);
}

/**
 * Resolve a dictionary slug to exactly one id.
 * Tries exact slug, then optional alias → canonical slug.
 * Never invents an id for unknown tokens.
 */
export function resolveTaxonomySlug(
  rawSlug: string,
  index: TaxonomySlugIndex,
  aliases?: Readonly<Record<string, string>>,
): { ids: string[]; diagnostic?: CatalogRulesDiagnostic; canonicalSlug?: string } {
  const value = rawSlug.trim();
  if (!value) {
    return {
      ids: [],
      diagnostic: {
        code: 'UNRESOLVED_SLUG',
        field: 'slug',
        value: rawSlug,
        message: 'Пустой slug справочника',
      },
    };
  }
  const lower = value.toLowerCase();
  const direct = index.get(lower);
  if (direct && direct.length === 1) {
    return { ids: [direct[0]!], canonicalSlug: lower };
  }
  if (direct && direct.length > 1) {
    return {
      ids: [],
      diagnostic: {
        code: 'AMBIGUOUS_SLUG',
        field: 'slug',
        value,
        message: `Slug «${value}» соответствует ${direct.length} записям справочника`,
      },
    };
  }

  const aliasTarget = aliases?.[lower];
  if (aliasTarget) {
    const aliased = index.get(aliasTarget.toLowerCase());
    if (aliased && aliased.length === 1) {
      return { ids: [aliased[0]!], canonicalSlug: aliasTarget.toLowerCase() };
    }
    if (aliased && aliased.length > 1) {
      return {
        ids: [],
        diagnostic: {
          code: 'AMBIGUOUS_SLUG',
          field: 'slug',
          value,
          message: `Alias «${value}»→«${aliasTarget}» неоднозначен (${aliased.length} записей)`,
        },
      };
    }
  }

  return {
    ids: [],
    diagnostic: {
      code: 'UNRESOLVED_SLUG',
      field: 'slug',
      value,
      message: `Slug «${value}» не найден в справочнике`,
    },
  };
}

function resolveSlugList(params: {
  slugs: string[];
  index: TaxonomySlugIndex;
  field: string;
  aliases?: Readonly<Record<string, string>>;
  diagnostics: CatalogRulesDiagnostic[];
}): { ids: string[]; blocking: boolean; canonicalSlugs: string[] } {
  const ids: string[] = [];
  const canonicalSlugs: string[] = [];
  let blocking = false;
  for (const slug of params.slugs) {
    const result = resolveTaxonomySlug(slug, params.index, params.aliases);
    if (result.diagnostic) {
      params.diagnostics.push({ ...result.diagnostic, field: params.field });
      blocking = true;
      continue;
    }
    if (result.ids.length === 1) {
      ids.push(result.ids[0]!);
      if (result.canonicalSlug) canonicalSlugs.push(result.canonicalSlug);
    }
  }
  return { ids: [...new Set(ids)], blocking, canonicalSlugs: [...new Set(canonicalSlugs)] };
}

/**
 * Parse raw JSON rules into list filters without taxonomy lookup (slug passthrough).
 * Prefer `resolveCatalogPageRules` at read time so IDs win over slugs.
 */
export function parseCatalogPageRules(rules: unknown): ResolvedCatalogPageFilters {
  const record = asRulesRecord(rules);
  const filters: ResolvedCatalogPageFilters = {};

  const flowerTypeIds = asStringArray(record.flowerTypeIds);
  if (flowerTypeIds) filters.flowerTypeIds = flowerTypeIds;
  const flowerTypeSlugs = [
    ...(asStringArray(record.flowerTypeSlugs) ?? []),
    ...(asStringOrArray(record.containsFlowerType) ?? []),
    ...(asStringArray(record.containsFlowerTypeSlugs) ?? []),
  ];
  if (flowerTypeSlugs.length > 0) filters.flowerTypeSlugs = [...new Set(flowerTypeSlugs)];

  const onlyFlowerTypeIds = asStringArray(record.onlyFlowerTypeIds);
  if (onlyFlowerTypeIds) filters.onlyFlowerTypeIds = onlyFlowerTypeIds;
  const onlyFlowerTypeSlugs = [
    ...(asStringArray(record.onlyFlowerTypeSlugs) ?? []),
    ...(asStringOrArray(record.onlyFlowerType) ?? []),
  ];
  if (onlyFlowerTypeSlugs.length > 0) {
    filters.onlyFlowerTypeSlugs = [...new Set(onlyFlowerTypeSlugs)];
  }

  const flowerFormIds = asStringArray(record.flowerFormIds);
  if (flowerFormIds) filters.flowerFormIds = flowerFormIds;
  const flowerFormSlugs = asStringArray(record.flowerFormSlugs);
  if (flowerFormSlugs) filters.flowerFormSlugs = flowerFormSlugs;

  const flowerVarietyIds = asStringArray(record.flowerVarietyIds);
  if (flowerVarietyIds) filters.flowerVarietyIds = flowerVarietyIds;
  const flowerVarietySlugs = asStringArray(record.flowerVarietySlugs);
  if (flowerVarietySlugs) filters.flowerVarietySlugs = flowerVarietySlugs;

  const colorIds = asStringArray(record.colorIds);
  if (colorIds) filters.colorIds = colorIds;
  const colorSlugs = asStringArray(record.colorSlugs);
  if (colorSlugs) filters.colorSlugs = colorSlugs;

  const componentColorIds = asStringArray(record.componentColorIds);
  if (componentColorIds) filters.componentColorIds = componentColorIds;
  const componentColorSlugs = [
    ...(asStringArray(record.componentColorSlugs) ?? []),
    ...(asStringOrArray(record.flowerColor) ?? []),
    ...(asStringArray(record.flowerColorSlugs) ?? []),
  ];
  if (componentColorSlugs.length > 0) {
    filters.componentColorSlugs = [...new Set(componentColorSlugs)];
  }

  const occasionIds = asStringArray(record.occasionIds);
  if (occasionIds) filters.occasionIds = occasionIds;
  const occasionSlugs = asStringArray(record.occasionSlugs);
  if (occasionSlugs) filters.occasionSlugs = occasionSlugs;

  const recipientIds = asStringArray(record.recipientIds);
  if (recipientIds) filters.recipientIds = recipientIds;
  const recipientSlugs = asStringArray(record.recipientSlugs);
  if (recipientSlugs) filters.recipientSlugs = recipientSlugs;

  const kinds = asStringArray(record.compositionKinds) ?? asStringOrArray(record.compositionType);
  if (kinds) {
    filters.compositionKinds = kinds.filter((k): k is CompositionKind =>
      COMPOSITION_KIND_SET.has(k),
    );
  }

  const productKinds = asStringArray(record.productKinds);
  if (productKinds) {
    filters.productKinds = productKinds.filter((k): k is ProductKind => PRODUCT_KIND_SET.has(k));
  }

  if (typeof record.minPriceMinor === 'string' && /^\d+$/.test(record.minPriceMinor)) {
    filters.minPriceMinor = record.minPriceMinor;
  }
  if (typeof record.maxPriceMinor === 'string' && /^\d+$/.test(record.maxPriceMinor)) {
    filters.maxPriceMinor = record.maxPriceMinor;
  }

  if (
    typeof record.minFlowerTypeQuantity === 'number' &&
    Number.isInteger(record.minFlowerTypeQuantity) &&
    record.minFlowerTypeQuantity >= 1 &&
    typeof record.flowerTypeQuantitySlug === 'string' &&
    record.flowerTypeQuantitySlug.trim()
  ) {
    filters.minFlowerTypeQuantity = record.minFlowerTypeQuantity;
    filters.flowerTypeQuantitySlug = record.flowerTypeQuantitySlug.trim();
  }

  if (
    typeof record.dominantFlowerTypeSlug === 'string' &&
    record.dominantFlowerTypeSlug.trim()
  ) {
    filters.dominantFlowerTypeSlug = record.dominantFlowerTypeSlug.trim();
  }

  const traitKeys = asStringArray(record.traitKeys);
  if (traitKeys) filters.traitKeys = traitKeys;

  return filters;
}

/**
 * Resolve page rules to ID-preferring filters using a live taxonomy index.
 * Existing IDs are kept; slug tokens are resolved (with aliases). Unresolved /
 * ambiguous slugs set `blocking` and are omitted from filters (fail closed).
 */
export function resolveCatalogPageRules(
  rules: unknown,
  lookup: CatalogTaxonomyLookup,
): CatalogPageRulesResolution {
  const parsed = parseCatalogPageRules(rules);
  const diagnostics: CatalogRulesDiagnostic[] = [];
  let blocking = false;
  const aliases = lookup.flowerTypeAliases ?? FLOWER_TYPE_SLUG_ALIASES;
  const filters: ResolvedCatalogPageFilters = {
    productKinds: parsed.productKinds,
    compositionKinds: parsed.compositionKinds,
    minPriceMinor: parsed.minPriceMinor,
    maxPriceMinor: parsed.maxPriceMinor,
    traitKeys: parsed.traitKeys,
    colorIds: parsed.colorIds,
    occasionIds: parsed.occasionIds,
    recipientIds: parsed.recipientIds,
    flowerVarietyIds: parsed.flowerVarietyIds,
    flowerFormIds: parsed.flowerFormIds,
    componentColorIds: parsed.componentColorIds,
    flowerTypeIds: parsed.flowerTypeIds,
    onlyFlowerTypeIds: parsed.onlyFlowerTypeIds,
  };

  const resolveOrKeep = (params: {
    existingIds?: string[];
    slugs?: string[];
    index: TaxonomySlugIndex;
    field: string;
    useFlowerAliases?: boolean;
  }): { ids?: string[]; slugs?: string[]; fieldBlocking: boolean } => {
    if (params.existingIds && params.existingIds.length > 0) {
      return { ids: params.existingIds, fieldBlocking: false };
    }
    if (!params.slugs || params.slugs.length === 0) {
      return { fieldBlocking: false };
    }
    const resolved = resolveSlugList({
      slugs: params.slugs,
      index: params.index,
      field: params.field,
      aliases: params.useFlowerAliases ? aliases : undefined,
      diagnostics,
    });
    if (resolved.blocking) {
      return { fieldBlocking: true };
    }
    if (resolved.ids.length === 0) {
      diagnostics.push({
        code: 'EMPTY_AFTER_RESOLVE',
        field: params.field,
        value: params.slugs.join(','),
        message: `Не удалось сопоставить slug для поля ${params.field}`,
      });
      return { fieldBlocking: true };
    }
    return { ids: resolved.ids, fieldBlocking: false };
  };

  {
    const r = resolveOrKeep({
      existingIds: parsed.flowerTypeIds,
      slugs: parsed.flowerTypeSlugs,
      index: lookup.flowerTypes,
      field: 'flowerTypeSlugs',
      useFlowerAliases: true,
    });
    if (r.fieldBlocking) blocking = true;
    else if (r.ids) filters.flowerTypeIds = r.ids;
    else if (parsed.flowerTypeSlugs) filters.flowerTypeSlugs = parsed.flowerTypeSlugs;
  }

  {
    const r = resolveOrKeep({
      existingIds: parsed.onlyFlowerTypeIds,
      slugs: parsed.onlyFlowerTypeSlugs,
      index: lookup.flowerTypes,
      field: 'onlyFlowerTypeSlugs',
      useFlowerAliases: true,
    });
    if (r.fieldBlocking) blocking = true;
    else if (r.ids) filters.onlyFlowerTypeIds = r.ids;
    else if (parsed.onlyFlowerTypeSlugs) {
      filters.onlyFlowerTypeSlugs = parsed.onlyFlowerTypeSlugs;
    }
  }

  {
    const r = resolveOrKeep({
      existingIds: parsed.flowerFormIds,
      slugs: parsed.flowerFormSlugs,
      index: lookup.flowerForms,
      field: 'flowerFormSlugs',
    });
    if (r.fieldBlocking) blocking = true;
    else if (r.ids) filters.flowerFormIds = r.ids;
    else if (parsed.flowerFormSlugs) filters.flowerFormSlugs = parsed.flowerFormSlugs;
  }

  {
    const r = resolveOrKeep({
      existingIds: parsed.flowerVarietyIds,
      slugs: parsed.flowerVarietySlugs,
      index: lookup.flowerVarieties,
      field: 'flowerVarietySlugs',
    });
    if (r.fieldBlocking) blocking = true;
    else if (r.ids) filters.flowerVarietyIds = r.ids;
    else if (parsed.flowerVarietySlugs) {
      filters.flowerVarietySlugs = parsed.flowerVarietySlugs;
    }
  }

  {
    const r = resolveOrKeep({
      existingIds: parsed.componentColorIds,
      slugs: parsed.componentColorSlugs,
      index: lookup.colors,
      field: 'componentColorSlugs',
    });
    if (r.fieldBlocking) blocking = true;
    else if (r.ids) filters.componentColorIds = r.ids;
    else if (parsed.componentColorSlugs) {
      filters.componentColorSlugs = parsed.componentColorSlugs;
    }
  }

  {
    const r = resolveOrKeep({
      existingIds: parsed.colorIds,
      slugs: parsed.colorSlugs,
      index: lookup.colors,
      field: 'colorSlugs',
    });
    if (r.fieldBlocking) blocking = true;
    else if (r.ids) filters.colorIds = r.ids;
    else if (parsed.colorSlugs) filters.colorSlugs = parsed.colorSlugs;
  }

  {
    const r = resolveOrKeep({
      existingIds: parsed.occasionIds,
      slugs: parsed.occasionSlugs,
      index: lookup.occasions,
      field: 'occasionSlugs',
    });
    if (r.fieldBlocking) blocking = true;
    else if (r.ids) filters.occasionIds = r.ids;
    else if (parsed.occasionSlugs) filters.occasionSlugs = parsed.occasionSlugs;
  }

  {
    const r = resolveOrKeep({
      existingIds: parsed.recipientIds,
      slugs: parsed.recipientSlugs,
      index: lookup.recipients,
      field: 'recipientSlugs',
    });
    if (r.fieldBlocking) blocking = true;
    else if (r.ids) filters.recipientIds = r.ids;
    else if (parsed.recipientSlugs) filters.recipientSlugs = parsed.recipientSlugs;
  }

  if (parsed.minFlowerTypeQuantity != null && parsed.flowerTypeQuantitySlug) {
    const q = resolveTaxonomySlug(
      parsed.flowerTypeQuantitySlug,
      lookup.flowerTypes,
      aliases,
    );
    if (q.diagnostic) {
      diagnostics.push({ ...q.diagnostic, field: 'flowerTypeQuantitySlug' });
      blocking = true;
    } else if (q.canonicalSlug) {
      filters.minFlowerTypeQuantity = parsed.minFlowerTypeQuantity;
      filters.flowerTypeQuantitySlug = q.canonicalSlug;
    }
  }

  if (parsed.dominantFlowerTypeSlug) {
    const d = resolveTaxonomySlug(
      parsed.dominantFlowerTypeSlug,
      lookup.flowerTypes,
      aliases,
    );
    if (d.diagnostic) {
      diagnostics.push({ ...d.diagnostic, field: 'dominantFlowerTypeSlug' });
      blocking = true;
    } else if (d.canonicalSlug) {
      filters.dominantFlowerTypeSlug = d.canonicalSlug;
    }
  }

  return { filters, diagnostics, blocking };
}

/**
 * Migrate raw rules JSON: add *Ids where slug uniquely resolves; keep slug keys.
 * Does not rewrite unknown or ambiguous tokens.
 */
export function migrateCatalogPageRulesJson(
  rules: unknown,
  lookup: CatalogTaxonomyLookup,
): {
  next: Record<string, unknown>;
  changed: boolean;
  diagnostics: CatalogRulesDiagnostic[];
} {
  const record = { ...asRulesRecord(rules) };
  const diagnostics: CatalogRulesDiagnostic[] = [];
  const aliases = lookup.flowerTypeAliases ?? FLOWER_TYPE_SLUG_ALIASES;
  let changed = false;

  const enrich = (params: {
    idKey: string;
    slugKeys: string[];
    singularKey?: string;
    index: TaxonomySlugIndex;
    useFlowerAliases?: boolean;
  }) => {
    const existingIds = asStringArray(record[params.idKey]);
    if (existingIds && existingIds.length > 0) return;

    const slugs = new Set<string>();
    for (const key of params.slugKeys) {
      for (const s of asStringArray(record[key]) ?? []) slugs.add(s);
    }
    if (params.singularKey && typeof record[params.singularKey] === 'string') {
      const s = (record[params.singularKey] as string).trim();
      if (s) slugs.add(s);
    }
    if (slugs.size === 0) return;

    const ids: string[] = [];
    for (const slug of slugs) {
      const result = resolveTaxonomySlug(
        slug,
        params.index,
        params.useFlowerAliases ? aliases : undefined,
      );
      if (result.diagnostic) {
        diagnostics.push({ ...result.diagnostic, field: params.idKey });
        return;
      }
      if (result.ids[0]) ids.push(result.ids[0]);
    }
    if (ids.length === 0) return;
    record[params.idKey] = [...new Set(ids)];
    changed = true;
  };

  enrich({
    idKey: 'flowerTypeIds',
    slugKeys: ['flowerTypeSlugs', 'containsFlowerTypeSlugs'],
    singularKey: 'containsFlowerType',
    index: lookup.flowerTypes,
    useFlowerAliases: true,
  });
  enrich({
    idKey: 'onlyFlowerTypeIds',
    slugKeys: ['onlyFlowerTypeSlugs'],
    singularKey: 'onlyFlowerType',
    index: lookup.flowerTypes,
    useFlowerAliases: true,
  });
  enrich({
    idKey: 'flowerFormIds',
    slugKeys: ['flowerFormSlugs'],
    index: lookup.flowerForms,
  });
  enrich({
    idKey: 'flowerVarietyIds',
    slugKeys: ['flowerVarietySlugs'],
    index: lookup.flowerVarieties,
  });
  enrich({
    idKey: 'componentColorIds',
    slugKeys: ['componentColorSlugs', 'flowerColorSlugs'],
    singularKey: 'flowerColor',
    index: lookup.colors,
  });
  enrich({
    idKey: 'colorIds',
    slugKeys: ['colorSlugs'],
    index: lookup.colors,
  });
  enrich({
    idKey: 'occasionIds',
    slugKeys: ['occasionSlugs'],
    index: lookup.occasions,
  });
  enrich({
    idKey: 'recipientIds',
    slugKeys: ['recipientSlugs'],
    index: lookup.recipients,
  });

  return { next: record, changed, diagnostics };
}

/** Empty-match sentinel for fail-closed listing when rules cannot be resolved. */
export const CATALOG_RULES_EMPTY_MATCH_ID = '00000000-0000-4000-8000-000000000000';

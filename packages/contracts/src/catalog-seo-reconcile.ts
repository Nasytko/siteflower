/**
 * Task 03 — catalog/SEO reconciliation (read-only compare).
 * Compares legacy SeoLandingPage snapshots to CatalogCategory pages.
 * Never auto-overwrites; callers decide remediation from the report.
 */

export type CatalogSeoLegacySnapshot = {
  id: string;
  slug: string;
  title: string;
  h1: string | null;
  body: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  noIndex: boolean;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | string;
  navVisible: boolean;
  sortOrder: number;
  rules: Record<string, unknown> | null;
  pinnedProductIds: string[];
  excludedProductIds: string[];
  /** ISO timestamp; used to detect post-copy edits. */
  updatedAt: string;
};

export type CatalogCategoryPageSnapshot = {
  id: string;
  slug: string;
  name: string;
  h1: string | null;
  body: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  noIndex: boolean;
  pageKind: 'SYSTEM_HUB' | 'THEMATIC' | 'GIFT_SUBTYPE' | 'LEGACY' | string;
  pageStatus: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | string | null;
  navVisible: boolean;
  sortOrder: number;
  rules: Record<string, unknown> | null;
  pinnedProductIds: string[];
  excludedProductIds: string[];
  updatedAt: string;
};

export type CatalogSeoReconcileCode =
  | 'SLUG_ONLY_ON_LEGACY'
  | 'SLUG_ONLY_ON_CATEGORY'
  | 'SLUG_COLLISION_DIFFERENT_IDS'
  | 'FIELD_MISMATCH'
  | 'RULES_MISMATCH'
  | 'PIN_SET_MISMATCH'
  | 'EXCLUDE_SET_MISMATCH'
  | 'STATUS_MISMATCH'
  | 'LEGACY_NEWER_THAN_CATEGORY'
  | 'CATEGORY_NEWER_THAN_LEGACY';

export type CatalogSeoReconcileIssue = {
  code: CatalogSeoReconcileCode;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  slug: string;
  message: string;
  legacyId?: string;
  categoryId?: string;
  field?: string;
  legacyValue?: unknown;
  categoryValue?: unknown;
};

export type CatalogSeoReconcileReport = {
  generatedAt: string;
  legacyCount: number;
  categoryThematicCount: number;
  matchedBySlug: number;
  issues: CatalogSeoReconcileIssue[];
  /** True when any CRITICAL issue is present — do not DROP legacy tables. */
  blockedForLegacyDrop: boolean;
};

function sortedIds(ids: string[]): string[] {
  return [...new Set(ids)].sort();
}

function stableJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`).join(',')}}`;
}

function pushField(
  issues: CatalogSeoReconcileIssue[],
  slug: string,
  legacy: CatalogSeoLegacySnapshot,
  category: CatalogCategoryPageSnapshot,
  field: string,
  legacyValue: unknown,
  categoryValue: unknown,
): void {
  if (stableJson(legacyValue) === stableJson(categoryValue)) return;
  issues.push({
    code: 'FIELD_MISMATCH',
    severity: 'WARNING',
    slug,
    field,
    message: `Поле «${field}» отличается между SeoLanding и CatalogCategory`,
    legacyId: legacy.id,
    categoryId: category.id,
    legacyValue,
    categoryValue,
  });
}

/**
 * Pure reconciliation. Safe to run offline against exported snapshots.
 * Does not mutate inputs.
 */
export function reconcileCatalogSeoLegacy(input: {
  legacy: CatalogSeoLegacySnapshot[];
  categories: CatalogCategoryPageSnapshot[];
  now?: string;
}): CatalogSeoReconcileReport {
  const issues: CatalogSeoReconcileIssue[] = [];
  const legacyBySlug = new Map<string, CatalogSeoLegacySnapshot>();
  for (const row of input.legacy) {
    const prev = legacyBySlug.get(row.slug);
    if (prev) {
      issues.push({
        code: 'SLUG_COLLISION_DIFFERENT_IDS',
        severity: 'CRITICAL',
        slug: row.slug,
        message: 'Дублирующий slug в legacy SeoLandingPage',
        legacyId: row.id,
      });
    }
    legacyBySlug.set(row.slug, row);
  }

  const thematic = input.categories.filter(
    (c) => c.pageKind === 'THEMATIC' || c.pageKind === 'LEGACY',
  );
  const categoryBySlug = new Map<string, CatalogCategoryPageSnapshot>();
  for (const row of thematic) {
    const prev = categoryBySlug.get(row.slug);
    if (prev && prev.id !== row.id) {
      issues.push({
        code: 'SLUG_COLLISION_DIFFERENT_IDS',
        severity: 'CRITICAL',
        slug: row.slug,
        message: 'Дублирующий slug в CatalogCategory',
        categoryId: row.id,
      });
    }
    categoryBySlug.set(row.slug, row);
  }

  let matchedBySlug = 0;
  for (const [slug, legacy] of legacyBySlug) {
    const category = categoryBySlug.get(slug);
    if (!category) {
      issues.push({
        code: 'SLUG_ONLY_ON_LEGACY',
        severity: legacy.status === 'PUBLISHED' ? 'CRITICAL' : 'WARNING',
        slug,
        message:
          legacy.status === 'PUBLISHED'
            ? 'Опубликованный SeoLanding без пары в CatalogCategory — риск 404 после отключения legacy'
            : 'SeoLanding без пары в CatalogCategory',
        legacyId: legacy.id,
      });
      continue;
    }
    matchedBySlug += 1;

    pushField(issues, slug, legacy, category, 'title/name', legacy.title, category.name);
    pushField(issues, slug, legacy, category, 'h1', legacy.h1, category.h1);
    pushField(issues, slug, legacy, category, 'body', legacy.body, category.body);
    pushField(issues, slug, legacy, category, 'seoTitle', legacy.seoTitle, category.seoTitle);
    pushField(
      issues,
      slug,
      legacy,
      category,
      'seoDescription',
      legacy.seoDescription,
      category.seoDescription,
    );
    pushField(issues, slug, legacy, category, 'noIndex', legacy.noIndex, category.noIndex);
    pushField(issues, slug, legacy, category, 'navVisible', legacy.navVisible, category.navVisible);
    pushField(issues, slug, legacy, category, 'sortOrder', legacy.sortOrder, category.sortOrder);

    const categoryStatus = category.pageStatus ?? 'DRAFT';
    if (legacy.status !== categoryStatus) {
      issues.push({
        code: 'STATUS_MISMATCH',
        severity: legacy.status === 'PUBLISHED' || categoryStatus === 'PUBLISHED' ? 'CRITICAL' : 'WARNING',
        slug,
        field: 'status',
        message: `Статус legacy=${legacy.status}, category=${categoryStatus}`,
        legacyId: legacy.id,
        categoryId: category.id,
        legacyValue: legacy.status,
        categoryValue: categoryStatus,
      });
    }

    if (stableJson(legacy.rules ?? {}) !== stableJson(category.rules ?? {})) {
      issues.push({
        code: 'RULES_MISMATCH',
        severity: 'CRITICAL',
        slug,
        field: 'rules',
        message: 'Правила отбора товаров различаются',
        legacyId: legacy.id,
        categoryId: category.id,
        legacyValue: legacy.rules,
        categoryValue: category.rules,
      });
    }

    const legacyPins = sortedIds(legacy.pinnedProductIds);
    const categoryPins = sortedIds(category.pinnedProductIds);
    if (stableJson(legacyPins) !== stableJson(categoryPins)) {
      issues.push({
        code: 'PIN_SET_MISMATCH',
        severity: 'WARNING',
        slug,
        field: 'pinnedProductIds',
        message: 'Наборы закреплённых товаров различаются',
        legacyId: legacy.id,
        categoryId: category.id,
        legacyValue: legacyPins,
        categoryValue: categoryPins,
      });
    }

    const legacyEx = sortedIds(legacy.excludedProductIds);
    const categoryEx = sortedIds(category.excludedProductIds);
    if (stableJson(legacyEx) !== stableJson(categoryEx)) {
      issues.push({
        code: 'EXCLUDE_SET_MISMATCH',
        severity: 'WARNING',
        slug,
        field: 'excludedProductIds',
        message: 'Наборы исключённых товаров различаются',
        legacyId: legacy.id,
        categoryId: category.id,
        legacyValue: legacyEx,
        categoryValue: categoryEx,
      });
    }

    const legacyTs = Date.parse(legacy.updatedAt);
    const categoryTs = Date.parse(category.updatedAt);
    if (Number.isFinite(legacyTs) && Number.isFinite(categoryTs)) {
      if (legacyTs > categoryTs + 1000) {
        issues.push({
          code: 'LEGACY_NEWER_THAN_CATEGORY',
          severity: 'CRITICAL',
          slug,
          message:
            'SeoLanding обновлялся после CatalogCategory — возможен дрейф после первоначального копирования',
          legacyId: legacy.id,
          categoryId: category.id,
          legacyValue: legacy.updatedAt,
          categoryValue: category.updatedAt,
        });
      } else if (categoryTs > legacyTs + 1000) {
        issues.push({
          code: 'CATEGORY_NEWER_THAN_LEGACY',
          severity: 'INFO',
          slug,
          message: 'CatalogCategory новее legacy (ожидаемо после переключения админки)',
          legacyId: legacy.id,
          categoryId: category.id,
          legacyValue: legacy.updatedAt,
          categoryValue: category.updatedAt,
        });
      }
    }
  }

  for (const [slug, category] of categoryBySlug) {
    if (legacyBySlug.has(slug)) continue;
    if (category.pageKind !== 'THEMATIC') continue;
    issues.push({
      code: 'SLUG_ONLY_ON_CATEGORY',
      severity: 'INFO',
      slug,
      message: 'Thematic CatalogCategory без legacy SeoLanding (нормально для новых страниц)',
      categoryId: category.id,
    });
  }

  return {
    generatedAt: input.now ?? new Date().toISOString(),
    legacyCount: input.legacy.length,
    categoryThematicCount: thematic.filter((c) => c.pageKind === 'THEMATIC').length,
    matchedBySlug,
    issues,
    blockedForLegacyDrop: issues.some((i) => i.severity === 'CRITICAL'),
  };
}

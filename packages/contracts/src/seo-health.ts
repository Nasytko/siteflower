/**
 * Pure SEO health analyzer — shared by Admin UI (draft preview) and API aggregation.
 * Does not generate metadata; evaluates resolved SEO fields from the existing foundation.
 */

export const SEO_SEVERITIES = ['CRITICAL', 'WARNING', 'INFO', 'PASS'] as const;
export type SeoSeverity = (typeof SEO_SEVERITIES)[number];

export const SEO_ENTITY_TYPES = [
  'product',
  'flower',
  'occasion',
  'recipient',
  'color',
  'page',
] as const;
export type SeoEntityType = (typeof SEO_ENTITY_TYPES)[number];

export const SEO_HEALTH_STATUSES = ['attention', 'improve', 'good'] as const;
export type SeoHealthStatus = (typeof SEO_HEALTH_STATUSES)[number];

export const SEO_TITLE_SOFT_MAX = 70;
export const SEO_DESCRIPTION_SOFT_MAX = 160;
export const SEO_DESCRIPTION_HARD_MAX = 320;

export type SeoCheckResult = {
  code: string;
  severity: SeoSeverity;
  title: string;
  message: string;
  entityType: SeoEntityType;
  entityId: string;
  href: string | null;
};

export type SeoEntityHealth = {
  entityType: SeoEntityType;
  entityId: string;
  name: string;
  path: string | null;
  href: string | null;
  status: SeoHealthStatus;
  indexable: boolean;
  indexabilityLabel: string;
  checks: SeoCheckResult[];
  primaryIssue: string | null;
};

export type SeoHealthSummary = {
  attention: number;
  improve: number;
  good: number;
  total: number;
};

export type SeoSitemapHealth = {
  totalUrls: number;
  indexableEntityCount: number;
  excludedEntityCount: number;
  publishedEntityCount: number;
  missingFromSitemap: number;
  missingSamples: Array<{ name: string; path: string; href: string | null }>;
};

export type SeoHealthReportDto = {
  checkedAt: string;
  summary: SeoHealthSummary;
  sitemap: SeoSitemapHealth;
  items: SeoEntityHealth[];
  page: number;
  pageSize: number;
  total: number;
};

export type ProductSeoAnalysisInput = {
  id: string;
  name: string;
  slug: string;
  lifecycle: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  /** True when the product is presently visible on the storefront. */
  effectivelyPublished: boolean;
  noIndex: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  resolvedTitle: string;
  resolvedDescription: string;
  hasPrimaryMedia: boolean;
  mediaCount: number;
  mediaMissingAlt: number;
  hasPrice: boolean;
  /** Variant/offer data sufficient for Product JSON-LD. */
  jsonLdReady: boolean;
  /** Path relative to site origin, e.g. /bukety/slug */
  path: string;
  adminHref: string;
  /** Expected in sitemap when published && !noIndex. */
  inSitemap: boolean;
};

export type TaxonomySeoAnalysisInput = {
  id: string;
  entityType: Extract<SeoEntityType, 'flower' | 'occasion' | 'recipient' | 'color'>;
  name: string;
  slug: string;
  visibility: 'VISIBLE' | 'HIDDEN';
  description: string | null;
  noIndex: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  resolvedTitle: string;
  resolvedDescription: string;
  /** Public landing path, or null when this taxonomy has no dedicated SEO page. */
  path: string | null;
  adminHref: string;
  inSitemap: boolean;
  /** Colors are catalog filters today — no dedicated landing. */
  hasPublicLanding: boolean;
};

export function severityRank(severity: SeoSeverity): number {
  switch (severity) {
    case 'CRITICAL':
      return 3;
    case 'WARNING':
      return 2;
    case 'INFO':
      return 1;
    case 'PASS':
      return 0;
  }
}

export function worstSeverity(checks: readonly SeoCheckResult[]): SeoSeverity {
  let worst: SeoSeverity = 'PASS';
  for (const check of checks) {
    if (severityRank(check.severity) > severityRank(worst)) {
      worst = check.severity;
    }
  }
  return worst;
}

export function healthStatusFromSeverity(severity: SeoSeverity): SeoHealthStatus {
  if (severity === 'CRITICAL') return 'attention';
  if (severity === 'WARNING') return 'improve';
  return 'good';
}

export function summarizeEntityHealth(items: readonly SeoEntityHealth[]): SeoHealthSummary {
  const summary: SeoHealthSummary = { attention: 0, improve: 0, good: 0, total: items.length };
  for (const item of items) {
    summary[item.status] += 1;
  }
  return summary;
}

export function primaryIssueFromChecks(checks: readonly SeoCheckResult[]): string | null {
  const actionable = checks
    .filter((c) => c.severity === 'CRITICAL' || c.severity === 'WARNING')
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  return actionable[0]?.message ?? null;
}

function check(partial: Omit<SeoCheckResult, 'entityType' | 'entityId' | 'href'> & {
  entityType: SeoEntityType;
  entityId: string;
  href: string | null;
}): SeoCheckResult {
  return partial;
}

export function analyzeProductSeo(input: ProductSeoAnalysisInput): SeoEntityHealth {
  const { id, adminHref } = input;
  const checks: SeoCheckResult[] = [];
  const base = { entityType: 'product' as const, entityId: id, href: adminHref };
  const isLive = input.effectivelyPublished;
  const titleSource = input.seoTitle?.trim() ? 'manual' : 'automatic';
  const descriptionSource = input.seoDescription?.trim() ? 'manual' : 'automatic';

  // Draft / archived: SEO issues are informational, not critical for the live site.
  if (!isLive) {
    checks.push(
      check({
        ...base,
        code: 'PRODUCT_NOT_LIVE',
        severity: 'INFO',
        title: 'Страница ещё не на витрине',
        message:
          input.lifecycle === 'DRAFT'
            ? 'Черновик не показывается покупателям и поисковым системам — SEO-ошибки не критичны, пока товар не опубликован.'
            : 'Страница сейчас не на витрине. Рекомендации ниже пригодятся после публикации.',
      }),
    );
  }

  if (!input.slug.trim()) {
    checks.push(
      check({
        ...base,
        code: 'PRODUCT_SLUG_MISSING',
        severity: 'CRITICAL',
        title: 'Нет адреса страницы',
        message: 'У товара нет адреса в ссылке (slug). Без него страница не откроется в каталоге.',
      }),
    );
  } else {
    checks.push(
      check({
        ...base,
        code: 'PRODUCT_URL',
        severity: 'PASS',
        title: 'URL',
        message: `Адрес страницы: ${input.path}`,
      }),
    );
  }

  if (!input.resolvedTitle.trim()) {
    checks.push(
      check({
        ...base,
        code: 'PRODUCT_TITLE_MISSING',
        severity: isLive ? 'CRITICAL' : 'WARNING',
        title: 'Заголовок страницы',
        message: 'Нет заголовка для поисковых систем. Обычно он собирается из названия букета автоматически.',
      }),
    );
  } else {
    const long = input.resolvedTitle.length > SEO_TITLE_SOFT_MAX;
    checks.push(
      check({
        ...base,
        code: long ? 'PRODUCT_TITLE_LONG' : 'PRODUCT_TITLE_OK',
        severity: long ? 'WARNING' : 'PASS',
        title: 'Заголовок страницы',
        message: long
          ? `Заголовок длиннее ${SEO_TITLE_SOFT_MAX} символов (${input.resolvedTitle.length}). В поиске он может обрезаться. Источник: ${titleSource === 'manual' ? 'задан вручную' : 'автоматически'}.`
          : `Заголовок готов (${titleSource === 'manual' ? 'задан вручную' : 'используется автоматически'}).`,
      }),
    );
  }

  if (!input.resolvedDescription.trim()) {
    checks.push(
      check({
        ...base,
        code: 'PRODUCT_DESCRIPTION_MISSING',
        severity: isLive ? 'WARNING' : 'INFO',
        title: 'Описание страницы',
        message: 'Нет описания для поисковых систем. Добавьте краткое описание товара или SEO-описание.',
      }),
    );
  } else {
    const longHard = input.resolvedDescription.length > SEO_DESCRIPTION_HARD_MAX;
    const longSoft = input.resolvedDescription.length > SEO_DESCRIPTION_SOFT_MAX;
    checks.push(
      check({
        ...base,
        code: longHard || longSoft ? 'PRODUCT_DESCRIPTION_LONG' : 'PRODUCT_DESCRIPTION_OK',
        severity: longHard || longSoft ? 'WARNING' : 'PASS',
        title: 'Описание страницы',
        message:
          longHard || longSoft
            ? `Описание длиннее рекомендуемых ${SEO_DESCRIPTION_SOFT_MAX} символов (${input.resolvedDescription.length}). В сниппете поиска оно может обрезаться.`
            : `Описание готово (${descriptionSource === 'manual' ? 'задано вручную' : 'используется автоматически'}).`,
      }),
    );
  }

  if (input.noIndex) {
    checks.push(
      check({
        ...base,
        code: 'PRODUCT_NOINDEX',
        severity: isLive ? 'CRITICAL' : 'INFO',
        title: 'Индексация',
        message: isLive
          ? 'Страница опубликована, но скрыта от поисковых систем. Покупатели могут её открыть, а поиск — нет.'
          : 'Страница помечена как скрытая от поисковых систем (это нормально для черновика).',
      }),
    );
  } else {
    checks.push(
      check({
        ...base,
        code: 'PRODUCT_INDEXABLE',
        severity: 'PASS',
        title: 'Индексация',
        message: isLive
          ? 'Страница доступна поисковым системам.'
          : 'После публикации страница сможет попасть в поиск (если не скрыта).',
      }),
    );
  }

  if (input.mediaCount === 0) {
    checks.push(
      check({
        ...base,
        code: 'PRODUCT_MEDIA_MISSING',
        severity: isLive ? 'WARNING' : 'INFO',
        title: 'Основное изображение',
        message: 'Нет фотографий. В поиске и карточках букет будет без картинки.',
      }),
    );
  } else if (!input.hasPrimaryMedia) {
    checks.push(
      check({
        ...base,
        code: 'PRODUCT_PRIMARY_MEDIA_MISSING',
        severity: 'WARNING',
        title: 'Основное изображение',
        message: 'Фото есть, но не выбрано главное. Укажите главное фото для каталога и соцсетей.',
      }),
    );
  } else {
    checks.push(
      check({
        ...base,
        code: 'PRODUCT_PRIMARY_MEDIA_OK',
        severity: 'PASS',
        title: 'Основное изображение',
        message: 'Главное фото задано.',
      }),
    );
  }

  if (input.mediaCount > 0 && input.mediaMissingAlt > 0) {
    checks.push(
      check({
        ...base,
        code: 'PRODUCT_MEDIA_ALT_MISSING',
        severity: 'WARNING',
        title: 'Alt изображений',
        message: `У ${input.mediaMissingAlt} фото нет описания. Для поисковых систем и пользователей с ограничениями зрения сайт подставит «Букет «${input.name}»», но лучше указать своё описание.`,
      }),
    );
  } else if (input.mediaCount > 0) {
    checks.push(
      check({
        ...base,
        code: 'PRODUCT_MEDIA_ALT_OK',
        severity: 'PASS',
        title: 'Alt изображений',
        message: 'У фотографий есть описания (или будет использован понятный автоматический текст).',
      }),
    );
  }

  if (!input.hasPrice) {
    checks.push(
      check({
        ...base,
        code: 'PRODUCT_PRICE_MISSING',
        severity: isLive ? 'WARNING' : 'INFO',
        title: 'Цена',
        message: 'Нет цены варианта. В поиске и разметке товара цена не появится.',
      }),
    );
  } else {
    checks.push(
      check({
        ...base,
        code: 'PRODUCT_PRICE_OK',
        severity: 'PASS',
        title: 'Цена',
        message: 'Цена задана.',
      }),
    );
  }

  if (!input.jsonLdReady) {
    checks.push(
      check({
        ...base,
        code: 'PRODUCT_JSONLD_INCOMPLETE',
        severity: isLive ? 'WARNING' : 'INFO',
        title: 'Product JSON-LD',
        message: 'Недостаточно данных для карточки товара в поиске (нужны название, цена и наличие).',
      }),
    );
  } else {
    checks.push(
      check({
        ...base,
        code: 'PRODUCT_JSONLD_OK',
        severity: 'PASS',
        title: 'Product JSON-LD',
        message: 'Структурированные данные товара могут быть сформированы автоматически.',
      }),
    );
  }

  checks.push(
    check({
      ...base,
      code: 'PRODUCT_CANONICAL',
      severity: input.slug.trim() ? 'PASS' : 'CRITICAL',
      title: 'Canonical',
      message: input.slug.trim()
        ? `Поисковику будет указана основная версия страницы: ${input.path}`
        : 'Нельзя указать основную версию страницы без адреса (slug).',
    }),
  );

  const shouldBeInSitemap = isLive && !input.noIndex && Boolean(input.slug.trim());
  if (shouldBeInSitemap && !input.inSitemap) {
    checks.push(
      check({
        ...base,
        code: 'PRODUCT_SITEMAP_MISSING',
        severity: 'CRITICAL',
        title: 'Sitemap',
        message: 'Товар опубликован и открыт для поиска, но не найден в карте сайта. Это нужно исправить.',
      }),
    );
  } else if (!shouldBeInSitemap) {
    checks.push(
      check({
        ...base,
        code: 'PRODUCT_SITEMAP_EXCLUDED',
        severity: 'PASS',
        title: 'Sitemap',
        message: 'Страница намеренно не в карте сайта (черновик, скрыта от поиска или снята с витрины).',
      }),
    );
  } else {
    checks.push(
      check({
        ...base,
        code: 'PRODUCT_SITEMAP_OK',
        severity: 'PASS',
        title: 'Sitemap',
        message: 'Страница входит в карту сайта.',
      }),
    );
  }

  const status = healthStatusFromSeverity(worstSeverity(checks));
  const indexable = isLive && !input.noIndex && Boolean(input.slug.trim());

  return {
    entityType: 'product',
    entityId: id,
    name: input.name || 'Без названия',
    path: input.path,
    href: adminHref,
    status,
    indexable,
    indexabilityLabel: indexable
      ? 'Страница доступна поисковым системам'
      : input.noIndex
        ? 'Страница сейчас скрыта от поисковых систем'
        : 'Страница сейчас не на витрине',
    checks,
    primaryIssue: primaryIssueFromChecks(checks),
  };
}

export function analyzeTaxonomySeo(input: TaxonomySeoAnalysisInput): SeoEntityHealth {
  const { id, adminHref, entityType } = input;
  const checks: SeoCheckResult[] = [];
  const base = { entityType, entityId: id, href: adminHref };
  const isVisible = input.visibility === 'VISIBLE';
  const titleSource = input.seoTitle?.trim() ? 'manual' : 'automatic';
  const descriptionSource = input.seoDescription?.trim() ? 'manual' : 'automatic';

  if (!input.hasPublicLanding) {
    checks.push(
      check({
        ...base,
        code: 'TAXONOMY_NO_LANDING',
        severity: 'INFO',
        title: 'Тип страницы',
        message: 'Этот справочник используется как фильтр каталога и не имеет отдельной страницы для поиска.',
      }),
    );
  }

  if (!input.slug.trim()) {
    checks.push(
      check({
        ...base,
        code: 'TAXONOMY_SLUG_MISSING',
        severity: 'CRITICAL',
        title: 'URL',
        message: 'Нет адреса в ссылке (slug).',
      }),
    );
  } else if (input.path) {
    checks.push(
      check({
        ...base,
        code: 'TAXONOMY_URL_OK',
        severity: 'PASS',
        title: 'URL',
        message: `Адрес страницы: ${input.path}`,
      }),
    );
  }

  if (!input.name.trim()) {
    checks.push(
      check({
        ...base,
        code: 'TAXONOMY_NAME_MISSING',
        severity: 'CRITICAL',
        title: 'Название',
        message: 'Нет названия записи справочника.',
      }),
    );
  }

  if (!input.resolvedTitle.trim()) {
    checks.push(
      check({
        ...base,
        code: 'TAXONOMY_TITLE_MISSING',
        severity: isVisible && input.hasPublicLanding ? 'CRITICAL' : 'WARNING',
        title: 'Заголовок страницы',
        message: 'Нет заголовка для поисковых систем.',
      }),
    );
  } else {
    const long = input.resolvedTitle.length > SEO_TITLE_SOFT_MAX;
    checks.push(
      check({
        ...base,
        code: long ? 'TAXONOMY_TITLE_LONG' : 'TAXONOMY_TITLE_OK',
        severity: long ? 'WARNING' : 'PASS',
        title: 'Заголовок страницы',
        message: long
          ? `Заголовок длиннее ${SEO_TITLE_SOFT_MAX} символов. Источник: ${titleSource === 'manual' ? 'вручную' : 'автоматически'}.`
          : `Заголовок готов (${titleSource === 'manual' ? 'задан вручную' : 'используется автоматически'}).`,
      }),
    );
  }

  if (!input.resolvedDescription.trim()) {
    checks.push(
      check({
        ...base,
        code: 'TAXONOMY_DESCRIPTION_MISSING',
        severity: isVisible && input.hasPublicLanding ? 'WARNING' : 'INFO',
        title: 'Описание страницы',
        message: 'Нет описания страницы. Добавьте текст в описание справочника или SEO-описание.',
      }),
    );
  } else {
    const long = input.resolvedDescription.length > SEO_DESCRIPTION_SOFT_MAX;
    checks.push(
      check({
        ...base,
        code: long ? 'TAXONOMY_DESCRIPTION_LONG' : 'TAXONOMY_DESCRIPTION_OK',
        severity: long ? 'WARNING' : 'PASS',
        title: 'Описание страницы',
        message: long
          ? `Описание длиннее ${SEO_DESCRIPTION_SOFT_MAX} символов — в поиске может обрезаться.`
          : `Описание готово (${descriptionSource === 'manual' ? 'задано вручную' : 'используется автоматически'}).`,
      }),
    );
  }

  if (input.hasPublicLanding && isVisible && !input.description?.trim() && !input.seoDescription?.trim()) {
    checks.push(
      check({
        ...base,
        code: 'TAXONOMY_CONTENT_THIN',
        severity: 'WARNING',
        title: 'Содержание страницы',
        message: 'У страницы мало текста. Добавьте описание — так покупателям и поиску понятнее, о чём раздел.',
      }),
    );
  } else if (input.hasPublicLanding) {
    checks.push(
      check({
        ...base,
        code: 'TAXONOMY_CONTENT_OK',
        severity: 'PASS',
        title: 'Содержание страницы',
        message: 'Есть текст для страницы раздела.',
      }),
    );
  }

  if (input.noIndex) {
    checks.push(
      check({
        ...base,
        code: 'TAXONOMY_NOINDEX',
        severity: isVisible && input.hasPublicLanding ? 'CRITICAL' : 'INFO',
        title: 'Индексация',
        message:
          isVisible && input.hasPublicLanding
            ? 'Раздел виден на сайте, но скрыт от поисковых систем.'
            : 'Страница помечена как скрытая от поисковых систем.',
      }),
    );
  } else if (input.hasPublicLanding) {
    checks.push(
      check({
        ...base,
        code: 'TAXONOMY_INDEXABLE',
        severity: 'PASS',
        title: 'Индексация',
        message: isVisible
          ? 'Страница доступна поисковым системам.'
          : 'После включения видимости страница сможет попасть в поиск.',
      }),
    );
  }

  if (input.hasPublicLanding && input.path) {
    checks.push(
      check({
        ...base,
        code: 'TAXONOMY_CANONICAL',
        severity: 'PASS',
        title: 'Canonical',
        message: `Поисковику будет указана основная версия: ${input.path}`,
      }),
    );
  }

  const shouldBeInSitemap =
    input.hasPublicLanding && isVisible && !input.noIndex && Boolean(input.slug.trim());
  if (shouldBeInSitemap && !input.inSitemap) {
    checks.push(
      check({
        ...base,
        code: 'TAXONOMY_SITEMAP_MISSING',
        severity: 'CRITICAL',
        title: 'Sitemap',
        message: 'Раздел открыт для поиска, но отсутствует в карте сайта.',
      }),
    );
  } else if (input.hasPublicLanding) {
    checks.push(
      check({
        ...base,
        code: shouldBeInSitemap ? 'TAXONOMY_SITEMAP_OK' : 'TAXONOMY_SITEMAP_EXCLUDED',
        severity: 'PASS',
        title: 'Sitemap',
        message: shouldBeInSitemap
          ? 'Страница входит в карту сайта.'
          : 'Страница не должна быть в карте сайта (скрыта или выключена).',
      }),
    );
  }

  const status = healthStatusFromSeverity(worstSeverity(checks));
  const indexable = Boolean(shouldBeInSitemap);

  return {
    entityType,
    entityId: id,
    name: input.name || 'Без названия',
    path: input.path,
    href: adminHref,
    status,
    indexable,
    indexabilityLabel: !input.hasPublicLanding
      ? 'Отдельной страницы для поиска нет (фильтр каталога)'
      : indexable
        ? 'Страница доступна поисковым системам'
        : input.noIndex
          ? 'Страница сейчас скрыта от поисковых систем'
          : 'Страница сейчас скрыта на сайте',
    checks,
    primaryIssue: primaryIssueFromChecks(checks),
  };
}

export function seoStatusLabel(status: SeoHealthStatus): string {
  switch (status) {
    case 'attention':
      return 'Требует внимания';
    case 'improve':
      return 'Можно улучшить';
    case 'good':
      return 'Хорошо';
  }
}

export function seoStatusEmoji(status: SeoHealthStatus): string {
  switch (status) {
    case 'attention':
      return '🔴';
    case 'improve':
      return '🟡';
    case 'good':
      return '🟢';
  }
}

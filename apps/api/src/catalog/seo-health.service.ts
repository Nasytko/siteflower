import { Injectable } from '@nestjs/common';
import {
  analyzeProductSeo,
  analyzeTaxonomySeo,
  defaultProductSeoDescription,
  defaultProductSeoTitle,
  summarizeEntityHealth,
  type SeoEntityHealth,
  type SeoEntityType,
  type SeoHealthReportDto,
  type SeoHealthStatus,
  type SeoSitemapHealth,
} from '@bouquet-one/contracts';
import { PrismaService } from '../database/prisma.service';
import { effectivelyPublishedWhere } from './products.repository';

export type SeoHealthQuery = {
  status?: SeoHealthStatus | 'all';
  type?: SeoEntityType | 'all';
  page?: number;
  pageSize?: number;
};

function taxonomyResolvedTitle(name: string, seoTitle: string | null): string {
  return seoTitle?.trim() || `${name} | BUKET №1`;
}

function taxonomyResolvedDescription(
  name: string,
  description: string | null,
  seoDescription: string | null,
): string {
  return (
    seoDescription?.trim() ||
    description?.trim() ||
    `${name} — доставка цветов по Гродно | BUKET №1`
  );
}

@Injectable()
export class SeoHealthService {
  constructor(private readonly prisma: PrismaService) {}

  async getReport(query: SeoHealthQuery = {}): Promise<SeoHealthReportDto> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 50));
    const now = new Date();

    const [
      products,
      flowers,
      occasions,
      recipients,
      colors,
      sitemapProducts,
      sitemapFlowers,
      sitemapOccasions,
      sitemapRecipients,
    ] = await Promise.all([
      this.prisma.client.product.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          lifecycle: true,
          publishAt: true,
          publishedAt: true,
          unpublishAt: true,
          noIndex: true,
          seoTitle: true,
          seoDescription: true,
          shortDescription: true,
          media: {
            select: { isPrimary: true, alt: true },
            orderBy: { sortOrder: 'asc' },
          },
          variants: {
            where: { status: 'ACTIVE' },
            select: { id: true },
            take: 5,
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.client.flower.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          visibility: true,
          description: true,
          noIndex: true,
          seoTitle: true,
          seoDescription: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.client.occasion.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          visibility: true,
          description: true,
          noIndex: true,
          seoTitle: true,
          seoDescription: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.client.recipient.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          visibility: true,
          description: true,
          noIndex: true,
          seoTitle: true,
          seoDescription: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.client.color.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          visibility: true,
          description: true,
          noIndex: true,
          seoTitle: true,
          seoDescription: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.client.product.findMany({
        where: { ...effectivelyPublishedWhere(now), noIndex: false },
        select: { slug: true },
      }),
      this.prisma.client.flower.findMany({
        where: { visibility: 'VISIBLE', noIndex: false },
        select: { slug: true },
      }),
      this.prisma.client.occasion.findMany({
        where: { visibility: 'VISIBLE', noIndex: false },
        select: { slug: true },
      }),
      this.prisma.client.recipient.findMany({
        where: { visibility: 'VISIBLE', noIndex: false },
        select: { slug: true },
      }),
    ]);

    const sitemapPaths = new Set<string>([
      '/bukety',
      '/akcii',
      ...sitemapProducts.map((p) => `/bukety/${p.slug}`),
      ...sitemapFlowers.map((f) => `/cvety/${f.slug}`),
      ...sitemapOccasions.map((o) => `/povod/${o.slug}`),
      ...sitemapRecipients.map((r) => `/komu/${r.slug}`),
    ]);

    const items: SeoEntityHealth[] = [];

    for (const product of products) {
      const effectivelyPublished = isEffectivelyPublished(product, now);
      const path = `/bukety/${product.slug}`;
      const hasPrice = product.variants.length > 0;
      items.push(
        analyzeProductSeo({
          id: product.id,
          name: product.name,
          slug: product.slug,
          lifecycle: product.lifecycle,
          effectivelyPublished,
          noIndex: product.noIndex,
          seoTitle: product.seoTitle,
          seoDescription: product.seoDescription,
          resolvedTitle: product.seoTitle?.trim() || defaultProductSeoTitle(product.name),
          resolvedDescription:
            product.seoDescription?.trim() ||
            defaultProductSeoDescription(product.name, product.shortDescription),
          hasPrimaryMedia: product.media.some((m) => m.isPrimary),
          mediaCount: product.media.length,
          mediaMissingAlt: product.media.filter((m) => !m.alt?.trim()).length,
          hasPrice,
          jsonLdReady: hasPrice,
          path,
          adminHref: `/admin/catalog/products/${product.id}`,
          inSitemap: sitemapPaths.has(path),
        }),
      );
    }

    const pushTaxonomy = (
      rows: Array<{
        id: string;
        name: string;
        slug: string;
        visibility: 'VISIBLE' | 'HIDDEN';
        description: string | null;
        noIndex: boolean;
        seoTitle: string | null;
        seoDescription: string | null;
      }>,
      entityType: 'flower' | 'occasion' | 'recipient' | 'color',
      pathFor: (slug: string) => string | null,
      adminKind: string,
      hasPublicLanding: boolean,
    ) => {
      for (const row of rows) {
        const path = pathFor(row.slug);
        items.push(
          analyzeTaxonomySeo({
            id: row.id,
            entityType,
            name: row.name,
            slug: row.slug,
            visibility: row.visibility,
            description: row.description,
            noIndex: row.noIndex,
            seoTitle: row.seoTitle,
            seoDescription: row.seoDescription,
            resolvedTitle: taxonomyResolvedTitle(row.name, row.seoTitle),
            resolvedDescription: taxonomyResolvedDescription(
              row.name,
              row.description,
              row.seoDescription,
            ),
            path,
            adminHref: `/admin/catalog/${adminKind}`,
            inSitemap: path ? sitemapPaths.has(path) : false,
            hasPublicLanding,
          }),
        );
      }
    };

    pushTaxonomy(flowers, 'flower', (slug) => `/cvety/${slug}`, 'flowers', true);
    pushTaxonomy(occasions, 'occasion', (slug) => `/povod/${slug}`, 'occasions', true);
    pushTaxonomy(recipients, 'recipient', (slug) => `/komu/${slug}`, 'recipients', true);
    pushTaxonomy(colors, 'color', () => null, 'colors', false);

    // Static marketing pages (metadata is hardcoded in the storefront foundation).
    for (const page of STATIC_PAGES) {
      items.push({
        entityType: 'page',
        entityId: page.id,
        name: page.name,
        path: page.path,
        href: null,
        status: 'good',
        indexable: true,
        indexabilityLabel: 'Страница доступна поисковым системам',
        checks: [
          {
            code: 'STATIC_PAGE_OK',
            severity: 'PASS',
            title: 'Статическая страница',
            message: page.message,
            entityType: 'page',
            entityId: page.id,
            href: null,
          },
        ],
        primaryIssue: null,
      });
    }

    const summary = summarizeEntityHealth(items);

    const publishedEntityCount =
      products.filter((p) => isEffectivelyPublished(p, now)).length +
      flowers.filter((f) => f.visibility === 'VISIBLE').length +
      occasions.filter((o) => o.visibility === 'VISIBLE').length +
      recipients.filter((r) => r.visibility === 'VISIBLE').length;

    const indexableEntityCount =
      sitemapProducts.length +
      sitemapFlowers.length +
      sitemapOccasions.length +
      sitemapRecipients.length;

    const missingSamples = items
      .filter((item) =>
        item.checks.some(
          (c) => c.code === 'PRODUCT_SITEMAP_MISSING' || c.code === 'TAXONOMY_SITEMAP_MISSING',
        ),
      )
      .slice(0, 10)
      .map((item) => ({
        name: item.name,
        path: item.path ?? '',
        href: item.href,
      }));

    const sitemap: SeoSitemapHealth = {
      totalUrls: sitemapPaths.size,
      indexableEntityCount,
      excludedEntityCount: Math.max(0, publishedEntityCount - indexableEntityCount),
      publishedEntityCount,
      missingFromSitemap: missingSamples.length,
      missingSamples,
    };

    let filtered = items;
    if (query.status && query.status !== 'all') {
      filtered = filtered.filter((item) => item.status === query.status);
    }
    if (query.type && query.type !== 'all') {
      filtered = filtered.filter((item) => item.entityType === query.type);
    }

    // Attention first, then improve, then good; stable by name.
    const rank = { attention: 0, improve: 1, good: 2 } as const;
    filtered = [...filtered].sort((a, b) => {
      const byStatus = rank[a.status] - rank[b.status];
      if (byStatus !== 0) return byStatus;
      return a.name.localeCompare(b.name, 'ru');
    });

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const pageItems = filtered.slice(start, start + pageSize);

    return {
      checkedAt: now.toISOString(),
      summary,
      sitemap,
      items: pageItems,
      page,
      pageSize,
      total,
    };
  }

  async getSummary(): Promise<{
    checkedAt: string;
    summary: ReturnType<typeof summarizeEntityHealth>;
  }> {
    const report = await this.getReport({ page: 1, pageSize: 1 });
    return { checkedAt: report.checkedAt, summary: report.summary };
  }
}

const STATIC_PAGES = [
  {
    id: 'static-bukety',
    name: 'Каталог букетов',
    path: '/bukety',
    message: 'Каталог использует общую SEO-разметку витрины.',
  },
  {
    id: 'static-cvety',
    name: 'Раздел «Цветы»',
    path: '/cvety',
    message: 'Хаб цветов использует общую SEO-разметку витрины.',
  },
  {
    id: 'static-povod',
    name: 'Раздел «Поводы»',
    path: '/povod',
    message: 'Хаб поводов использует общую SEO-разметку витрины.',
  },
  {
    id: 'static-akcii',
    name: 'Акции',
    path: '/akcii',
    message: 'Страница акций использует общую SEO-разметку витрины.',
  },
] as const;

function isEffectivelyPublished(
  product: {
    lifecycle: string;
    publishAt: Date | null;
    publishedAt: Date | null;
    unpublishAt: Date | null;
  },
  now: Date,
): boolean {
  if (product.lifecycle !== 'PUBLISHED') return false;
  const started =
    (product.publishAt != null && product.publishAt <= now) ||
    (product.publishAt == null && product.publishedAt != null && product.publishedAt <= now) ||
    (product.publishAt == null && product.publishedAt == null);
  const notEnded = product.unpublishAt == null || product.unpublishAt > now;
  return started && notEnded;
}

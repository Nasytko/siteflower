import {
  reconcileCatalogSeoLegacy,
  type CatalogCategoryPageSnapshot,
  type CatalogSeoLegacySnapshot,
  type CatalogSeoReconcileReport,
} from '@bouquet-one/contracts';
import { PrismaService } from '../database/prisma.service';

/**
 * Load DB snapshots and run read-only reconciliation.
 * Never writes. Safe under R21 when pointed at an isolated audit DB.
 */
export async function buildCatalogSeoReconcileReport(
  prisma: PrismaService,
): Promise<CatalogSeoReconcileReport> {
  const [legacyRows, categoryRows] = await Promise.all([
    prisma.client.seoLandingPage.findMany({
      include: {
        pinnedProducts: { orderBy: { sortOrder: 'asc' }, select: { productId: true } },
        excludedProducts: { select: { productId: true } },
      },
    }),
    prisma.client.catalogCategory.findMany({
      where: { pageKind: { in: ['THEMATIC', 'LEGACY'] } },
      include: {
        pinnedProducts: { orderBy: { sortOrder: 'asc' }, select: { productId: true } },
        excludedProducts: { select: { productId: true } },
      },
    }),
  ]);

  const legacy: CatalogSeoLegacySnapshot[] = legacyRows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    h1: row.h1,
    body: row.body,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    noIndex: row.noIndex,
    status: row.status,
    navVisible: row.navVisible,
    sortOrder: row.sortOrder,
    rules:
      row.rules && typeof row.rules === 'object' && !Array.isArray(row.rules)
        ? (row.rules as Record<string, unknown>)
        : null,
    pinnedProductIds: row.pinnedProducts.map((p) => p.productId),
    excludedProductIds: row.excludedProducts.map((p) => p.productId),
    updatedAt: row.updatedAt.toISOString(),
  }));

  const categories: CatalogCategoryPageSnapshot[] = categoryRows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    h1: row.h1,
    body: row.body,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    noIndex: row.noIndex,
    pageKind: row.pageKind,
    pageStatus: row.pageStatus,
    navVisible: row.navVisible,
    sortOrder: row.sortOrder,
    rules:
      row.rules && typeof row.rules === 'object' && !Array.isArray(row.rules)
        ? (row.rules as Record<string, unknown>)
        : null,
    pinnedProductIds: row.pinnedProducts.map((p) => p.productId),
    excludedProductIds: row.excludedProducts.map((p) => p.productId),
    updatedAt: row.updatedAt.toISOString(),
  }));

  return reconcileCatalogSeoLegacy({ legacy, categories });
}

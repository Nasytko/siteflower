import type { CatalogCategoryTreeNodeDto } from '@bouquet-one/contracts';
import type { PrimaryNavItem } from '@/components/storefront/primary-nav';

/** Legacy category slugs that keep pre-katalog URLs for SEO. */
const LEGACY_CATEGORY_HREFS: Record<string, string> = {
  bukety: '/bukety',
  cvety: '/cvety',
};

const STATIC_NAV_TAIL: PrimaryNavItem[] = [
  { id: 'akcii', label: 'Акции', href: '/akcii', accent: true },
  { id: 'dostavka', label: 'Доставка', href: '/dostavka' },
  { id: 'o-nas', label: 'О нас', href: '/o-nas' },
];

export function categoryNavHref(slug: string): string {
  return LEGACY_CATEGORY_HREFS[slug] ?? `/katalog/${slug}`;
}

export function navItemsFromCategoryTree(tree: CatalogCategoryTreeNodeDto[]): PrimaryNavItem[] {
  const fromTree: PrimaryNavItem[] = tree
    .filter((node) => node.visibility === 'VISIBLE')
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((node) => {
      const children = node.children
        ?.filter((child) => child.visibility === 'VISIBLE')
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((child) => ({ label: child.name, href: categoryNavHref(child.slug) }));
      return {
        id: node.slug,
        label: node.name,
        href: categoryNavHref(node.slug),
        ...(children && children.length > 0 ? { children } : {}),
      };
    });

  const slugs = new Set(fromTree.map((item) => item.id));
  const tail = STATIC_NAV_TAIL.filter((item) => !slugs.has(item.id));
  return [...fromTree, ...tail];
}

export function findCategoryInTree(
  slug: string,
  nodes: CatalogCategoryTreeNodeDto[],
): { node: CatalogCategoryTreeNodeDto; ancestors: CatalogCategoryTreeNodeDto[] } | null {
  function walk(
    list: CatalogCategoryTreeNodeDto[],
    ancestors: CatalogCategoryTreeNodeDto[],
  ): ReturnType<typeof findCategoryInTree> {
    for (const node of list) {
      if (node.slug === slug) return { node, ancestors };
      const inChild = walk(node.children ?? [], [...ancestors, node]);
      if (inChild) return inChild;
    }
    return null;
  }
  return walk(nodes, []);
}

export function categoryUsesFlowerFilters(
  category: { listingKind: string | null },
  ancestors: Array<{ listingKind: string | null }>,
): boolean {
  if (category.listingKind === 'FLOWERS') return true;
  return ancestors.some((item) => item.listingKind === 'FLOWERS');
}

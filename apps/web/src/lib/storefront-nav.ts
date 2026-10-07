import {
  categoryPublicHref,
  type CatalogCategoryTreeNodeDto,
  type NavigationMenuItemPublicDto,
} from '@bouquet-one/contracts';
import type { PrimaryNavGroup, PrimaryNavItem } from '@/components/storefront/primary-nav';

export function categoryNavHref(slug: string): string {
  return categoryPublicHref(slug);
}

function mapLinkChildren(items: NavigationMenuItemPublicDto[]) {
  return items
    .filter((child) => child.targetType !== 'GROUP' && child.href)
    .map((child) => ({
      id: child.id,
      label: child.label,
      href: child.href,
    }));
}

function mapGroups(items: NavigationMenuItemPublicDto[]): PrimaryNavGroup[] {
  return items
    .filter((child) => child.targetType === 'GROUP')
    .map((group) => ({
      id: group.id,
      label: group.label,
      iconKey: group.iconKey,
      children: mapLinkChildren(group.children),
    }))
    .filter((group) => group.children.length > 0);
}

/** Map public NavigationMenu items → header PrimaryNavItem shape. */
export function navItemsFromNavigationMenu(
  items: NavigationMenuItemPublicDto[],
): PrimaryNavItem[] {
  return items.map((item) => {
    const groups = mapGroups(item.children);
    const flatChildren = mapLinkChildren(item.children);
    return {
      id: item.id,
      label: item.label,
      href: item.href || '#',
      accent: item.accent || undefined,
      ...(groups.length > 0 ? { groups } : {}),
      ...(groups.length === 0 && flatChildren.length > 0 ? { children: flatChildren } : {}),
    };
  });
}

/**
 * @deprecated Prefer NavigationMenu. Kept as emergency fallback when menu API is empty.
 */
export function navItemsFromCategoryTree(tree: CatalogCategoryTreeNodeDto[]): PrimaryNavItem[] {
  return tree
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

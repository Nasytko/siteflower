import {
  categoryPublicHref,
  type CatalogCategoryTreeNodeDto,
  type NavigationMenuItemAdminDto,
  type NavigationMenuItemPublicDto,
  type NavigationPanelLayout,
} from '@bouquet-one/contracts';
import type { PrimaryNavChild, PrimaryNavGroup, PrimaryNavItem } from '@/components/storefront/primary-nav';

export function categoryNavHref(slug: string): string {
  return categoryPublicHref(slug);
}

/** Minimal tree shape shared by public + admin preview mappers. */
type NavSourceItem = {
  id: string;
  label: string;
  href: string;
  accent: boolean;
  iconKey?: string | null;
  panelLayout?: NavigationPanelLayout | null;
  targetType: string;
  imageUrl?: string | null;
  children: NavSourceItem[];
};

function mapLinkChildren(items: NavSourceItem[]): PrimaryNavChild[] {
  return items
    .filter((child) => child.targetType !== 'GROUP' && child.href && child.href !== '#')
    .map((child) => ({
      id: child.id,
      label: child.label,
      href: child.href,
      imageUrl: child.imageUrl,
    }));
}

function mapGroups(items: NavSourceItem[]): PrimaryNavGroup[] {
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

function mapNavSource(items: NavSourceItem[]): PrimaryNavItem[] {
  return items.map((item) => {
    const panelLayout: NavigationPanelLayout = item.panelLayout ?? 'COLUMNS';
    const groups = mapGroups(item.children);
    const flatChildren = mapLinkChildren(item.children);

    if (panelLayout === 'TILES') {
      return {
        id: item.id,
        label: item.label,
        href: item.href || '#',
        accent: item.accent || undefined,
        panelLayout: 'TILES',
        ...(flatChildren.length > 0 ? { children: flatChildren } : {}),
      };
    }

    return {
      id: item.id,
      label: item.label,
      href: item.href || '#',
      accent: item.accent || undefined,
      panelLayout: 'COLUMNS',
      ...(groups.length > 0 ? { groups } : {}),
      ...(groups.length === 0 && flatChildren.length > 0 ? { children: flatChildren } : {}),
    };
  });
}

/** Map public NavigationMenu items → header PrimaryNavItem shape. */
export function navItemsFromNavigationMenu(
  items: NavigationMenuItemPublicDto[],
): PrimaryNavItem[] {
  return mapNavSource(items);
}

/** Admin preview: only enabled/available items, same shape as storefront. */
export function navItemsFromAdminMenu(items: NavigationMenuItemAdminDto[]): PrimaryNavItem[] {
  const filterTree = (list: NavigationMenuItemAdminDto[]): NavSourceItem[] =>
    list
      .filter((item) => item.enabled && !item.unavailable)
      .map((item) => ({
        id: item.id,
        label: item.label,
        href: item.href,
        accent: item.accent,
        iconKey: item.iconKey,
        panelLayout: item.panelLayout,
        targetType: item.targetType,
        imageUrl: item.imageUrl,
        children: filterTree(item.children),
      }));

  return mapNavSource(filterTree(items));
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
        panelLayout: 'COLUMNS' as const,
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

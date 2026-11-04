/**
 * Fixed storefront templates — not editable in admin.
 * Contacts, homepage structure and primary nav live here.
 */
import {
  defaultHomepageConfig,
  defaultStorefrontSettings,
  type HomepageConfigDto,
  type StorefrontSettingsPublicDto,
} from '@bouquet-one/contracts';
import type { PrimaryNavItem } from '@/components/storefront/primary-nav';

/** Shop contacts & PDP perk copy — edit in code / redeploy. */
export const FIXED_STOREFRONT_SETTINGS: StorefrontSettingsPublicDto = defaultStorefrontSettings();

/** Homepage layout — shelves still load products dynamically by slug. */
export const FIXED_HOMEPAGE_CONFIG: HomepageConfigDto = defaultHomepageConfig();

/**
 * Smart primary nav with rich dropdowns.
 * Flower list under «Цветы» can be enriched at runtime from taxonomy.
 */
export const FIXED_PRIMARY_NAV: PrimaryNavItem[] = [
  {
    id: 'bukety',
    label: 'Букеты',
    href: '/catalog/bouquets',
    panelLayout: 'COLUMNS',
    groups: [
      {
        id: 'bukety-kinds',
        label: 'По виду',
        iconKey: 'bouquet',
        children: [
          { id: 'all-bouquets', label: 'Все букеты', href: '/catalog/bouquets' },
          { id: 'rose-bouquets', label: 'Букеты из роз', href: '/catalog/rose-bouquets' },
          { id: 'mixed', label: 'Сборные букеты', href: '/catalog/bouquets' },
          { id: 'compositions', label: 'Композиции', href: '/catalog/compositions' },
          { id: 'signature', label: 'Авторские', href: '/catalog/signature-bouquets' },
        ],
      },
      {
        id: 'bukety-popular',
        label: 'Популярное',
        iconKey: 'heart',
        children: [
          { id: 'promo', label: 'Акции', href: '/akcii' },
          { id: 'bridal', label: 'Букет невесты', href: '/komu/neveste' },
          { id: 'autumn', label: 'Сезонная подборка', href: '/catalog/bouquets-with-roses' },
        ],
      },
    ],
  },
  {
    id: 'cvety',
    label: 'Цветы',
    href: '/catalog/stems',
    panelLayout: 'COLUMNS',
    groups: [
      {
        id: 'cvety-kinds',
        label: 'Популярные',
        iconKey: 'flower',
        children: [
          { id: 'stems-all', label: 'Все цветы поштучно', href: '/catalog/stems' },
          { id: 'roses', label: 'Розы', href: '/catalog/roses' },
          { id: 'tulips', label: 'Тюльпаны', href: '/catalog/stems?flower=tyulpan' },
          { id: 'chrys', label: 'Хризантемы', href: '/catalog/stems?flower=hrizantema' },
        ],
      },
      {
        id: 'cvety-more',
        label: 'Ещё',
        iconKey: 'leaf',
        children: [
          { id: 'peony', label: 'Пионы', href: '/catalog/stems?flower=pion' },
          { id: 'lilies', label: 'Лилии', href: '/catalog/stems?flower=liliya' },
          { id: 'eucalyptus', label: 'Зелень и акценты', href: '/catalog/stems' },
        ],
      },
    ],
  },
  {
    id: 'povod',
    label: 'Повод',
    href: '/povod',
    panelLayout: 'COLUMNS',
    groups: [
      {
        id: 'povod-main',
        label: 'Поводы',
        iconKey: 'heart',
        children: [
          { id: 'birthday', label: 'День рождения', href: '/povod/den-rozhdeniya' },
          { id: 'love', label: 'Любимым', href: '/povod/lyubimym' },
          { id: 'march8', label: '8 марта', href: '/povod/8-marta' },
          { id: 'wedding', label: 'Свадьба', href: '/povod/svadba' },
          { id: 'thanks', label: 'Благодарность', href: '/povod/blagodarnost' },
        ],
      },
      {
        id: 'povod-who',
        label: 'Кому',
        iconKey: 'gift',
        children: [
          { id: 'her', label: 'Ей', href: '/komu/ei' },
          { id: 'him', label: 'Ему', href: '/komu/emu' },
          { id: 'mom', label: 'Маме', href: '/komu/mame' },
          { id: 'bride', label: 'Невесте', href: '/komu/neveste' },
        ],
      },
    ],
  },
  {
    id: 'podarki',
    label: 'Подарки',
    href: '/catalog/gifts',
    panelLayout: 'COLUMNS',
    children: [
      { id: 'gifts-all', label: 'Все подарки', href: '/catalog/gifts' },
      { id: 'balloons', label: 'Шары', href: '/catalog/gifts' },
      { id: 'cards', label: 'Открытки', href: '/catalog/otkrytki' },
    ],
  },
  {
    id: 'akcii',
    label: 'Акции',
    href: '/akcii',
    accent: true,
    panelLayout: 'COLUMNS',
  },
];

export function getFixedStorefrontSettings(): StorefrontSettingsPublicDto {
  return FIXED_STOREFRONT_SETTINGS;
}

export function getFixedHomepageConfig(): HomepageConfigDto {
  return FIXED_HOMEPAGE_CONFIG;
}

export function getFixedPrimaryNav(): PrimaryNavItem[] {
  return FIXED_PRIMARY_NAV;
}

/**
 * Merge live flower types into the «Цветы» dropdown (popular column).
 * Keeps static fallbacks when taxonomy is empty.
 */
export function enrichNavWithFlowerTypes(
  nav: PrimaryNavItem[],
  flowers: Array<{ slug: string; name: string }>,
): PrimaryNavItem[] {
  if (flowers.length === 0) return nav;
  return nav.map((item) => {
    if (item.id !== 'cvety') return item;
    const popular = flowers.slice(0, 8).map((flower) => ({
      id: `ft-${flower.slug}`,
      label: flower.name,
      href: `/catalog/stems?flower=${encodeURIComponent(flower.slug)}`,
    }));
    const groups = item.groups?.map((group) =>
      group.id === 'cvety-kinds'
        ? {
            ...group,
            children: [
              { id: 'stems-all', label: 'Все цветы поштучно', href: '/catalog/stems' },
              ...popular,
            ],
          }
        : group,
    );
    return { ...item, groups };
  });
}

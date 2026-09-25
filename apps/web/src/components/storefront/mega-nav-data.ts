import type { CategoryNavItem } from './category-nav';
import { HOME_CATEGORY_NAV } from './category-nav';

export type MegaTile = {
  id: string;
  label: string;
  href: string;
  imageSrc: string;
  imageAlt: string;
};

export type MegaNavItem = {
  id: string;
  label: string;
  href: string;
  accent?: boolean;
  mega?: {
    tiles: MegaTile[];
    seeAllHref: string;
    seeAllLabel: string;
  };
};

function asMegaTiles(items: CategoryNavItem[]): MegaTile[] {
  return items.map((item) => ({
    id: item.id,
    label: item.label,
    href: item.href,
    imageSrc: item.imageSrc,
    imageAlt: item.imageAlt,
  }));
}

const ROSE_TILES: MegaTile[] = [
  {
    id: 'rozy',
    label: 'Розы',
    href: '/bukety?flower=rozy',
    imageSrc: '/categories/rozy.jpg',
    imageAlt: 'Букеты из роз',
  },
  {
    id: 'piony',
    label: 'Пионы',
    href: '/bukety?flower=piony',
    imageSrc: '/categories/piony.jpg',
    imageAlt: 'Букеты из пионов',
  },
  {
    id: 'nevesta',
    label: 'Для невесты',
    href: '/komu/neveste',
    imageSrc: '/categories/nevesta.jpg',
    imageAlt: 'Букет невесте',
  },
  {
    id: 'bukety',
    label: 'Все букеты',
    href: '/bukety',
    imageSrc: '/categories/bukety.jpg',
    imageAlt: 'Букеты',
  },
];

const BOX_TILES: MegaTile[] = [
  {
    id: 'box',
    label: 'В коробке',
    href: '/bukety?category=v-korobke',
    imageSrc: '/categories/box.jpg',
    imageAlt: 'Цветы в коробке',
  },
  {
    id: 'den-rozhdeniya',
    label: 'На праздник',
    href: '/povod/den-rozhdeniya',
    imageSrc: '/categories/den-rozhdeniya.jpg',
    imageAlt: 'Букет на праздник',
  },
];

/** Dicentra-like top categories mapped to our catalog routes. */
export const MEGA_NAV: MegaNavItem[] = [
  {
    id: 'bukety',
    label: 'Букеты',
    href: '/bukety',
    mega: {
      tiles: asMegaTiles(HOME_CATEGORY_NAV),
      seeAllHref: '/bukety',
      seeAllLabel: 'Смотреть все',
    },
  },
  {
    id: 'rozy',
    label: 'Розы',
    href: '/bukety?flower=rozy',
    mega: {
      tiles: ROSE_TILES,
      seeAllHref: '/bukety?flower=rozy',
      seeAllLabel: 'Все розы',
    },
  },
  {
    id: 'tsvety',
    label: 'Цветы',
    href: '/bukety',
  },
  {
    id: 'box',
    label: 'Цветы в коробке',
    href: '/bukety?category=v-korobke',
    mega: {
      tiles: BOX_TILES,
      seeAllHref: '/bukety?category=v-korobke',
      seeAllLabel: 'Смотреть все',
    },
  },
  {
    id: 'podarki',
    label: 'Подарки',
    href: '/collections/izbrannoe',
  },
  {
    id: 'sale',
    label: 'Акционные',
    href: '/bukety?featured=1',
    accent: true,
  },
];

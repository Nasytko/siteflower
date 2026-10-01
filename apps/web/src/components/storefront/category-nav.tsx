import Image from 'next/image';
import Link from 'next/link';
import type { DiscoveryTile } from './category-nav-types';
import { SectionRail } from './section-rail';

export type { DiscoveryTile } from './category-nav-types';
export { filterDiscoveryTiles } from './discovery-tiles';

/**
 * Illustrated discovery row — every href maps to a live storefront destination.
 * Photos are brand assets under /categories (not Dicentra imagery).
 */
export const HOME_DISCOVERY_TILES: DiscoveryTile[] = [
  {
    id: 'cvety-pcs',
    label: 'Цветы поштучно',
    href: '/cvety',
    imageSrc: '/categories/discovery-roza.png',
    imageAlt: 'Роза',
  },
  {
    id: 'rozy',
    label: 'Букеты из роз',
    href: '/cvety/rozy',
    imageSrc: '/categories/discovery-buket-roz.png',
    imageAlt: 'Букет роз',
  },
  {
    id: 'bukety',
    label: 'Букеты цветов',
    href: '/bukety',
    imageSrc: '/categories/discovery-sbornye.png',
    imageAlt: 'Сборный букет',
  },
  {
    id: 'kompozicii',
    label: 'Композиции',
    href: '/bukety?size=bolshoj',
    imageSrc: '/categories/discovery-kompozicii.png',
    imageAlt: 'Цветочная композиция',
  },
  {
    id: 'neveste',
    label: 'Букет невесты',
    href: '/komu/neveste',
    imageSrc: '/categories/discovery-nevesta.png',
    imageAlt: 'Свадебный букет',
  },
  {
    id: 'den-rozhdeniya',
    label: 'На день рождения',
    href: '/povod/den-rozhdeniya',
    imageSrc: '/categories/discovery-den-rozhdeniya.png',
    imageAlt: 'Букет на день рождения',
  },
  {
    id: 'podarki',
    label: 'Подарки',
    href: '/bukety',
    imageSrc: '/categories/discovery-podarki.png',
    imageAlt: 'Букет в подарок',
  },
];

type Props = {
  city: string;
  items?: DiscoveryTile[];
};

export function CategoryNav({ city, items = HOME_DISCOVERY_TILES }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="sf-discovery-row py-12 md:py-16">
      <div className="sf-container-wide">
        <SectionRail
          title={`Доставка цветов и букетов в ${city}`}
          href="/bukety"
          linkLabel="Смотреть все"
        />

        <ul className="sf-discovery-scroller mt-2 md:mt-3">
          {items.map((item) => (
            <li key={item.id}>
              <Link href={item.href} className="sf-discovery-tile group">
                <span className="sf-discovery-tile__media">
                  <Image
                    src={item.imageSrc}
                    alt={item.imageAlt}
                    fill
                    sizes="(max-width: 768px) 38vw, 12vw"
                    className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                  />
                </span>
                <span className="sf-discovery-tile__label">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

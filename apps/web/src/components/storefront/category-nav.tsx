import Image from 'next/image';
import Link from 'next/link';
import type { DiscoveryTile } from './category-nav-types';

export type { DiscoveryTile } from './category-nav-types';
export { filterDiscoveryTiles } from './discovery-tiles';

type Props = {
  items: DiscoveryTile[];
};

/**
 * Illustrated discovery row — every href maps to a live storefront destination.
 * Tile copy and images come from HomepageConfig (admin-editable).
 */
export function CategoryNav({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="sf-discovery-row py-12 md:py-16" aria-label="Категории">
      <div className="sf-container-wide">
        <ul className="sf-discovery-scroller">
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

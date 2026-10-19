import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { DiscoveryTile } from './category-nav-types';

export type { DiscoveryTile } from './category-nav-types';
export { filterDiscoveryTiles } from './discovery-tiles';

type Props = {
  items: DiscoveryTile[];
};

/**
 * Quick categories — photo tiles with label and arrow cue (7-up on desktop).
 */
export function CategoryNav({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="sf-discovery-row" aria-label="Быстрые категории">
      <div className="sf-container-wide">
        <ul
          className="sf-discovery-scroller"
          style={{ '--tile-count': Math.min(items.length, 7) } as CSSProperties}
        >
          {items.map((item) => (
            <li key={item.id}>
              <Link href={item.href} className="sf-discovery-tile group">
                <span className="sf-discovery-tile__media">
                  <Image
                    src={item.imageSrc}
                    alt={item.imageAlt}
                    fill
                    sizes="(max-width: 768px) 9rem, 11rem"
                    className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                  />
                </span>
                <span className="sf-discovery-tile__footer">
                  <span className="sf-discovery-tile__label">{item.label}</span>
                  <span className="sf-discovery-tile__arrow" aria-hidden>
                    →
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

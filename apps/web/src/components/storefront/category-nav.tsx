import Image from 'next/image';
import Link from 'next/link';

export type CategoryNavItem = {
  id: string;
  label: string;
  href: string;
  imageSrc: string;
  imageAlt: string;
};

/** Boutique category strip — links map to real catalog filters/taxonomies. */
export const HOME_CATEGORY_NAV: CategoryNavItem[] = [
  {
    id: 'po-shtuchno',
    label: 'Цветы поштучно',
    href: '/cvety/rozy',
    imageSrc: '/categories/po-shtuchno.jpg',
    imageAlt: 'Красная роза',
  },
  {
    id: 'rozy',
    label: 'Букеты из роз',
    href: '/bukety?flower=rozy',
    imageSrc: '/categories/rozy.jpg',
    imageAlt: 'Букет роз',
  },
  {
    id: 'bukety',
    label: 'Букеты цветов',
    href: '/bukety?category=bukety',
    imageSrc: '/categories/bukety.jpg',
    imageAlt: 'Смешанный букет',
  },
  {
    id: 'kompozitsii',
    label: 'Композиции',
    href: '/bukety?category=kompozitsii',
    imageSrc: '/categories/box.jpg',
    imageAlt: 'Цветочная композиция',
  },
  {
    id: 'nevesta',
    label: 'Букет невесты',
    href: '/bukety?band=200-plus',
    imageSrc: '/categories/nevesta.jpg',
    imageAlt: 'Свадебный букет',
  },
  {
    id: 'piony',
    label: 'Пионы',
    href: '/cvety/piony',
    imageSrc: '/categories/piony.jpg',
    imageAlt: 'Пионы',
  },
  {
    id: 'prazdnik',
    label: 'На праздник',
    href: '/povod/den-rozhdeniya',
    imageSrc: '/categories/den-rozhdeniya.jpg',
    imageAlt: 'Букет на праздник',
  },
];

type Props = {
  city: string;
  items?: CategoryNavItem[];
};

export function CategoryNav({ city, items = HOME_CATEGORY_NAV }: Props) {
  return (
    <section className="sf-category-nav">
      <div className="sf-container-wide py-12 md:py-16">
        <div className="mx-auto max-w-xl text-center md:mx-0 md:text-left">
          <p className="sf-label mb-2">Каталог настроений</p>
          <h2 className="sf-h2">Доставка цветов и букетов в {city}</h2>
          <div className="sf-rule mx-auto mt-4 md:mx-0" />
        </div>

        <ul className="sf-category-scroller mt-8 md:mt-12">
          {items.map((item, index) => (
            <li
              key={item.id}
              className="sf-category-nav__item"
              style={{ animationDelay: `${0.05 + index * 0.05}s` }}
            >
              <Link
                href={item.href}
                className="group relative block h-full overflow-hidden rounded-[var(--radius-lg)] outline-offset-4"
              >
                <span className="relative block aspect-[3/4] bg-surface md:aspect-[4/5]">
                  <span className="sf-category-orb absolute inset-0">
                    <Image
                      src={item.imageSrc}
                      alt={item.imageAlt}
                      fill
                      sizes="(max-width: 768px) 42vw, 12vw"
                      className="object-cover transition duration-700 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                    />
                  </span>
                  <span
                    className="absolute inset-0 bg-gradient-to-t from-ink/55 via-ink/10 to-transparent"
                    aria-hidden
                  />
                  <span className="absolute inset-x-0 bottom-0 p-2.5 text-left font-[family-name:var(--font-display)] text-[0.9rem] leading-snug tracking-wide text-white drop-shadow-sm sm:p-3 sm:text-[0.95rem] md:p-3.5 md:text-base">
                    {item.label}
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

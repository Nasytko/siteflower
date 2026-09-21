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
    imageSrc: '/categories/po-shtuchno.png',
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
    imageSrc: '/categories/nevesta.png',
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
    <section className="sf-category-nav border-b border-border/70 bg-background">
      <div className="sf-container-wide py-12 md:py-16">
        <h2 className="sf-h2 text-center md:text-left">
          Доставка цветов и букетов в {city}
        </h2>

        <ul className="sf-category-nav__list mt-10 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:mt-12 md:flex md:flex-wrap md:justify-between md:gap-6 lg:gap-4">
          {items.map((item, index) => (
            <li
              key={item.id}
              className="sf-category-nav__item flex justify-center md:flex-1 md:basis-0"
              style={{ animationDelay: `${0.05 + index * 0.06}s` }}
            >
              <Link
                href={item.href}
                className="group flex w-full max-w-[9.5rem] flex-col items-center text-center outline-offset-4"
              >
                <span className="relative mb-3 block size-[5.5rem] overflow-hidden rounded-full bg-surface shadow-[var(--shadow-soft)] transition duration-500 ease-out group-hover:-translate-y-1 group-hover:shadow-md sm:size-[6.5rem] md:size-[7rem] motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
                  <Image
                    src={item.imageSrc}
                    alt={item.imageAlt}
                    fill
                    sizes="112px"
                    className="object-cover transition duration-700 ease-out group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                  />
                </span>
                <span className="sf-small max-w-[8.5rem] font-medium leading-snug text-foreground transition group-hover:text-brand">
                  {item.label}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

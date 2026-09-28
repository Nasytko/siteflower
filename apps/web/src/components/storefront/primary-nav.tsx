'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type PrimaryNavItem = {
  id: string;
  label: string;
  href: string;
  /** Promotional emphasis — used once, for Акции. */
  accent?: boolean;
};

/**
 * Deliberately small IA: catalog, two discovery hubs, promos, and the two
 * service pages. No category / style / collection trees.
 */
export const PRIMARY_NAV: PrimaryNavItem[] = [
  { id: 'bukety', label: 'Букеты', href: '/bukety' },
  { id: 'cvety', label: 'Цветы', href: '/cvety' },
  { id: 'povod', label: 'Повод', href: '/povod' },
  { id: 'akcii', label: 'Акции', href: '/akcii', accent: true },
  { id: 'dostavka', label: 'Доставка', href: '/dostavka' },
  { id: 'o-nas', label: 'О нас', href: '/o-nas' },
];

function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

type Props = {
  /** Compact spacing for the expanded header’s second row. */
  compact?: boolean;
  /** Single-row header: nav sits between contacts and actions. */
  inline?: boolean;
};

export function PrimaryNav({ compact = false, inline = false }: Props) {
  const pathname = usePathname();

  return (
    <nav aria-label="Основное меню" className={inline ? 'min-w-0' : undefined}>
      <ul
        className={
          inline
            ? 'flex flex-nowrap items-center justify-center gap-x-4 overflow-x-auto xl:gap-x-6'
            : `sf-container-wide flex flex-wrap items-center justify-center ${
                compact ? 'gap-x-5 gap-y-1 xl:gap-x-7' : 'gap-x-6 gap-y-1 py-1 md:gap-x-8'
              }`
        }
        style={inline ? { scrollbarWidth: 'none' } : undefined}
      >
        {PRIMARY_NAV.map((item) => {
          const current = isCurrent(pathname, item.href);
          return (
            <li key={item.id} className="shrink-0">
              <Link
                href={item.href}
                aria-current={current ? 'page' : undefined}
                className={`sf-nav-link relative ${inline ? 'min-h-10 text-[0.8125rem]' : ''} ${
                  item.accent ? 'text-accent hover:text-accent' : 'hover:text-brand'
                } ${current ? 'text-brand' : ''}`}
              >
                {item.label}
                <span
                  className={`absolute inset-x-0 bottom-1.5 h-px rounded-full bg-current transition-opacity ${
                    current ? 'opacity-100' : 'opacity-0'
                  }`}
                  aria-hidden
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

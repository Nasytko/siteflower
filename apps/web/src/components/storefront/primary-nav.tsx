'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type PrimaryNavChild = {
  label: string;
  href: string;
};

export type PrimaryNavItem = {
  id: string;
  label: string;
  href: string;
  /** Promotional emphasis — used once, for Акции. */
  accent?: boolean;
  children?: PrimaryNavChild[];
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

function isCurrentBranch(pathname: string, item: PrimaryNavItem): boolean {
  if (isCurrent(pathname, item.href)) return true;
  return item.children?.some((child) => isCurrent(pathname, child.href)) ?? false;
}

type Props = {
  items?: PrimaryNavItem[];
  /** Compact spacing for the expanded header’s second row. */
  compact?: boolean;
  /** Single-row header: nav sits between contacts and actions. */
  inline?: boolean;
};

export function PrimaryNav({ items = PRIMARY_NAV, compact = false, inline = false }: Props) {
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
        {items.map((item) => {
          const current = isCurrentBranch(pathname, item);
          const hasChildren = (item.children?.length ?? 0) > 0;
          return (
            <li key={item.id} className={`shrink-0 ${hasChildren ? 'group relative' : ''}`}>
              <Link
                href={item.href}
                aria-current={current ? 'page' : undefined}
                aria-haspopup={hasChildren ? 'true' : undefined}
                className={`sf-nav-link relative ${inline ? 'min-h-10 text-[0.8125rem]' : ''} ${
                  item.accent ? 'text-accent hover:text-accent' : 'hover:text-brand'
                } ${current ? 'text-brand' : ''}`}
              >
                {item.label}
                {hasChildren ? (
                  <span className="ml-0.5 inline-block text-[0.6em] opacity-60" aria-hidden>
                    ▾
                  </span>
                ) : null}
                <span
                  className={`absolute inset-x-0 bottom-1.5 h-px rounded-full bg-current transition-opacity ${
                    current ? 'opacity-100' : 'opacity-0'
                  }`}
                  aria-hidden
                />
              </Link>
              {hasChildren ? (
                <div className="pointer-events-none absolute left-1/2 top-full z-50 hidden min-w-[11rem] -translate-x-1/2 pt-2 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 lg:block">
                  <ul
                    className="rounded-[var(--radius-md)] border border-border bg-surface py-1.5 shadow-[var(--shadow-soft)]"
                    role="list"
                  >
                    {item.children!.map((child) => (
                      <li key={child.href}>
                        <Link
                          href={child.href}
                          className={`block px-3.5 py-2 text-sm transition-colors hover:bg-[var(--color-surface-muted)] hover:text-brand ${
                            isCurrent(pathname, child.href) ? 'font-semibold text-brand' : 'text-foreground'
                          }`}
                        >
                          {child.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

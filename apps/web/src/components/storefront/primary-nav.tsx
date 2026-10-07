'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { NavigationGlyph } from './navigation-icons';

export type PrimaryNavChild = {
  id?: string;
  label: string;
  href: string;
};

export type PrimaryNavGroup = {
  id: string;
  label: string;
  iconKey?: string | null;
  children: PrimaryNavChild[];
};

export type PrimaryNavItem = {
  id: string;
  label: string;
  href: string;
  /** Promotional emphasis — used once, for Акции. */
  accent?: boolean;
  /** Flat links when there are no groups. */
  children?: PrimaryNavChild[];
  /** Column groups for contextual dropdown. */
  groups?: PrimaryNavGroup[];
};

/**
 * Outage-only fallback — used when NavigationMenu API throws/unavailable.
 * Successful empty menu must NOT fall back here (manager may have cleared items).
 * Service pages (О нас / Доставка / Контакты) live in the top utility bar only.
 */
export const PRIMARY_NAV: PrimaryNavItem[] = [
  { id: 'bukety', label: 'Букеты', href: '/bukety' },
  { id: 'cvety', label: 'Цветы', href: '/cvety' },
  { id: 'povod', label: 'Повод', href: '/povod' },
  { id: 'podarki', label: 'Подарки', href: '/bukety' },
  { id: 'akcii', label: 'Акции', href: '/akcii', accent: true },
];

function isCurrent(pathname: string, href: string): boolean {
  if (!href || href === '#') return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isCurrentBranch(pathname: string, item: PrimaryNavItem): boolean {
  if (isCurrent(pathname, item.href)) return true;
  if (item.children?.some((child) => isCurrent(pathname, child.href))) return true;
  return (
    item.groups?.some((group) =>
      group.children.some((child) => isCurrent(pathname, child.href)),
    ) ?? false
  );
}

function hasDropdown(item: PrimaryNavItem): boolean {
  return (item.groups?.length ?? 0) > 0 || (item.children?.length ?? 0) > 0;
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
  const [openId, setOpenId] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const baseId = useId();

  const close = useCallback(() => setOpenId(null), []);

  useEffect(() => {
    close();
  }, [pathname, close]);

  useEffect(() => {
    if (!openId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointer);
    };
  }, [openId, close]);

  return (
    <nav ref={rootRef} aria-label="Основное меню" className={inline ? 'min-w-0' : undefined}>
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
          const dropdown = hasDropdown(item);
          const open = openId === item.id;
          const panelId = `${baseId}-${item.id}-panel`;

          return (
            <li
              key={item.id}
              className={`shrink-0 ${dropdown ? 'relative' : ''}`}
              onMouseEnter={() => {
                if (dropdown) setOpenId(item.id);
              }}
              onMouseLeave={() => {
                if (openId === item.id) setOpenId(null);
              }}
            >
              <div className="flex items-center">
                <Link
                  href={item.href || '#'}
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
                {dropdown ? (
                  <button
                    type="button"
                    className="ml-0.5 inline-flex h-8 w-7 items-center justify-center rounded text-[0.65rem] text-muted hover:text-brand"
                    aria-expanded={open}
                    aria-haspopup="true"
                    aria-controls={panelId}
                    onClick={() => setOpenId(open ? null : item.id)}
                  >
                    <span aria-hidden>▾</span>
                    <span className="sr-only">Подменю «{item.label}»</span>
                  </button>
                ) : null}
              </div>

              {dropdown ? (
                <div
                  id={panelId}
                  role="region"
                  aria-label={`Подменю ${item.label}`}
                  hidden={!open}
                  className={`absolute left-1/2 top-full z-50 hidden min-w-[16rem] -translate-x-1/2 pt-2 lg:block ${
                    open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
                  } transition-opacity duration-150`}
                >
                  <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-soft)]">
                    {item.groups && item.groups.length > 0 ? (
                      <div
                        className={`grid gap-6 ${
                          item.groups.length >= 3
                            ? 'grid-cols-3'
                            : item.groups.length === 2
                              ? 'grid-cols-2'
                              : 'grid-cols-1'
                        }`}
                      >
                        {item.groups.map((group) => (
                          <div key={group.id} className="min-w-[9.5rem]">
                            <p className="mb-2.5 flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted">
                              <NavigationGlyph iconKey={group.iconKey} className="h-3.5 w-3.5" />
                              {group.label}
                            </p>
                            <ul className="space-y-1">
                              {group.children.map((child) => (
                                <li key={child.href + child.label}>
                                  <Link
                                    href={child.href}
                                    className={`block rounded-md px-1 py-1 text-sm transition-colors hover:text-brand ${
                                      isCurrent(pathname, child.href)
                                        ? 'font-semibold text-brand'
                                        : 'text-foreground'
                                    }`}
                                    onClick={close}
                                  >
                                    {child.label}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <ul className="min-w-[11rem] space-y-1">
                        {item.children?.map((child) => (
                          <li key={child.href + child.label}>
                            <Link
                              href={child.href}
                              className={`block rounded-md px-1 py-1.5 text-sm transition-colors hover:text-brand ${
                                isCurrent(pathname, child.href)
                                  ? 'font-semibold text-brand'
                                  : 'text-foreground'
                              }`}
                              onClick={close}
                            >
                              {child.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                    {item.href ? (
                      <div className="mt-4 border-t border-border/70 pt-3 text-center">
                        <Link
                          href={item.href}
                          className="text-sm font-medium text-brand hover:underline"
                          onClick={close}
                        >
                          Смотреть все {item.label.toLowerCase()} →
                        </Link>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

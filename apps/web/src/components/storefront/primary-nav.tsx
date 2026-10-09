'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { NavigationPanelLayout } from '@bouquet-one/contracts';
import { NavigationGlyph } from './navigation-icons';

export type PrimaryNavChild = {
  id?: string;
  label: string;
  href: string;
  imageUrl?: string | null;
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
  panelLayout?: NavigationPanelLayout;
  /** Flat links when there are no groups (COLUMNS) or TILES grid. */
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
  { id: 'bukety', label: 'Букеты', href: '/bukety', panelLayout: 'COLUMNS' },
  { id: 'cvety', label: 'Цветы', href: '/cvety', panelLayout: 'COLUMNS' },
  { id: 'povod', label: 'Повод', href: '/povod', panelLayout: 'COLUMNS' },
  { id: 'podarki', label: 'Подарки', href: '/bukety', panelLayout: 'COLUMNS' },
  { id: 'akcii', label: 'Акции', href: '/akcii', accent: true, panelLayout: 'COLUMNS' },
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
  /** Single-row header: nav sits between contacts and actions. */
  inline?: boolean;
};

export function PrimaryNav({ items = PRIMARY_NAV, inline = false }: Props) {
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

  const openItem = items.find((item) => item.id === openId);
  const showDim = Boolean(openItem && hasDropdown(openItem));

  return (
    <>
      {showDim ? (
        <button
          type="button"
          className="fixed inset-0 z-40 hidden bg-ink/25 lg:block"
          aria-label="Закрыть меню"
          onClick={close}
        />
      ) : null}

      <nav ref={rootRef} aria-label="Основное меню" className={`relative z-50 ${inline ? 'min-w-0' : ''}`}>
        <ul
          className={
            inline
              ? 'flex flex-nowrap items-center justify-center gap-x-4 overflow-x-auto xl:gap-x-6'
              : 'sf-container-wide flex flex-wrap items-center justify-center gap-x-6 gap-y-1 py-1 md:gap-x-8'
          }
          style={inline ? { scrollbarWidth: 'none' } : undefined}
        >
          {items.map((item) => {
            const current = isCurrentBranch(pathname, item);
            const dropdown = hasDropdown(item);
            const open = openId === item.id;
            const panelId = `${baseId}-${item.id}-panel`;
            const isTiles = item.panelLayout === 'TILES';

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
                    className={`absolute top-full z-50 hidden pt-2 lg:block ${
                      isTiles
                        ? 'left-1/2 w-[min(72rem,calc(100vw-2rem))] -translate-x-1/2'
                        : 'left-1/2 min-w-[16rem] -translate-x-1/2'
                    } ${
                      open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
                    } transition-opacity duration-150`}
                  >
                    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-soft)]">
                      {isTiles && item.children && item.children.length > 0 ? (
                        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                          {item.children.map((child) => (
                            <li key={(child.id ?? '') + child.href + child.label}>
                              <Link
                                href={child.href}
                                className="group relative block aspect-square overflow-hidden rounded-xl bg-[var(--color-surface-muted)]"
                                onClick={close}
                              >
                                {child.imageUrl ? (
                                  <img
                                    src={child.imageUrl}
                                    alt=""
                                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                                    loading="lazy"
                                    decoding="async"
                                  />
                                ) : (
                                  <span className="absolute inset-0 bg-[color-mix(in_oklab,var(--color-brand-soft)_70%,var(--color-surface-muted))]" />
                                )}
                                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/75 via-ink/35 to-transparent px-3 pb-2.5 pt-10">
                                  <span className="block text-sm font-semibold text-white">
                                    {child.label}
                                  </span>
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : item.groups && item.groups.length > 0 ? (
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
                        <div
                          className={`mt-4 border-t border-border/70 pt-3 ${
                            isTiles ? 'text-left' : 'text-center'
                          }`}
                        >
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
    </>
  );
}

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
 * Minimal fallback if FIXED_PRIMARY_NAV is not passed from the layout.
 * Full smart menu lives in `@/lib/storefront-content`.
 */
export const PRIMARY_NAV: PrimaryNavItem[] = [
  { id: 'bukety', label: 'Букеты', href: '/catalog/bouquets', panelLayout: 'COLUMNS' },
  { id: 'cvety', label: 'Цветы', href: '/catalog/stems', panelLayout: 'COLUMNS' },
  { id: 'povod', label: 'Повод', href: '/povod', panelLayout: 'COLUMNS' },
  { id: 'podarki', label: 'Подарки', href: '/catalog/gifts', panelLayout: 'COLUMNS' },
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
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseId = useId();

  const close = useCallback(() => setOpenId(null), []);

  const openNow = useCallback((id: string) => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setOpenId(id);
  }, []);

  const closeSoon = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setOpenId(null);
      closeTimer.current = null;
    }, 180);
  }, []);

  useEffect(() => {
    close();
  }, [pathname, close]);

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

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

  const openItem = items.find((item) => item.id === openId && hasDropdown(item)) ?? null;
  const showDim = Boolean(openItem);
  const panelId = openItem ? `${baseId}-${openItem.id}-panel` : undefined;
  const isTiles = openItem?.panelLayout === 'TILES';

  return (
    <>
      {showDim ? (
        <button
          type="button"
          className="sf-nav-dim fixed inset-0 z-[45] hidden lg:block"
          aria-label="Закрыть меню"
          onClick={close}
        />
      ) : null}

      <nav
        ref={rootRef}
        aria-label="Основное меню"
        className={`sf-primary-nav relative z-[60] ${inline ? 'sf-primary-nav--inline min-w-0' : ''}`}
        onMouseLeave={closeSoon}
        onMouseEnter={() => {
          if (closeTimer.current) {
            clearTimeout(closeTimer.current);
            closeTimer.current = null;
          }
        }}
      >
        <ul
          className={
            inline
              ? 'sf-primary-nav__list flex flex-nowrap items-center justify-center gap-x-1 xl:gap-x-2'
              : 'sf-container-wide flex flex-wrap items-center justify-center gap-x-6 gap-y-1 py-1 md:gap-x-8'
          }
        >
          {items.map((item) => {
            const current = isCurrentBranch(pathname, item);
            const dropdown = hasDropdown(item);
            const open = openId === item.id;

            return (
              <li key={item.id} className="shrink-0">
                <div
                  className={`sf-primary-nav__trigger ${open ? 'sf-primary-nav__trigger--open' : ''}`}
                  onMouseEnter={() => {
                    if (dropdown) openNow(item.id);
                    else close();
                  }}
                >
                  <Link
                    href={item.href || '#'}
                    aria-current={current ? 'page' : undefined}
                    aria-expanded={dropdown ? open : undefined}
                    aria-haspopup={dropdown ? 'true' : undefined}
                    aria-controls={dropdown && open ? panelId : undefined}
                    className={`sf-nav-link relative ${inline ? 'min-h-10 px-2.5 text-[0.8125rem]' : ''} ${
                      item.accent ? 'text-accent hover:text-accent' : 'hover:text-brand'
                    } ${current || open ? 'text-brand' : ''}`}
                    onFocus={() => {
                      if (dropdown) openNow(item.id);
                    }}
                  >
                    {item.label}
                    {dropdown ? (
                      <span className="sf-primary-nav__chevron" aria-hidden>
                        ▾
                      </span>
                    ) : null}
                    <span
                      className={`absolute inset-x-2.5 bottom-1.5 h-px rounded-full bg-current transition-opacity ${
                        current || open ? 'opacity-100' : 'opacity-0'
                      }`}
                      aria-hidden
                    />
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>

        {openItem ? (
          <div
            id={panelId}
            role="region"
            aria-label={`Подменю ${openItem.label}`}
            className={`sf-nav-panel sf-nav-panel--mega ${openItem ? 'sf-nav-panel--open' : ''}`}
          >
            <div className="sf-nav-panel__inner">
              {isTiles && openItem.children && openItem.children.length > 0 ? (
                <ul className="sf-nav-panel__tiles">
                  {openItem.children.map((child) => (
                    <li key={(child.id ?? '') + child.href + child.label}>
                      <Link
                        href={child.href}
                        className="sf-nav-panel__tile"
                        onClick={close}
                      >
                        {child.imageUrl ? (
                          <img
                            src={child.imageUrl}
                            alt=""
                            className="sf-nav-panel__tile-img"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <span className="sf-nav-panel__tile-fallback" />
                        )}
                        <span className="sf-nav-panel__tile-label">{child.label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : openItem.groups && openItem.groups.length > 0 ? (
                <div
                  className={`sf-nav-panel__cols sf-nav-panel__cols--${Math.min(openItem.groups.length, 4)}`}
                >
                  {openItem.groups.map((group) => (
                    <div key={group.id} className="sf-nav-panel__col">
                      <p className="sf-nav-panel__col-title">
                        <NavigationGlyph iconKey={group.iconKey} className="h-3.5 w-3.5" />
                        {group.label}
                      </p>
                      <ul className="sf-nav-panel__links">
                        {group.children.map((child) => (
                          <li key={child.href + child.label}>
                            <Link
                              href={child.href}
                              className={`sf-nav-panel__link ${
                                isCurrent(pathname, child.href) ? 'sf-nav-panel__link--current' : ''
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
                <ul className="sf-nav-panel__links sf-nav-panel__links--flat">
                  {openItem.children?.map((child) => (
                    <li key={child.href + child.label}>
                      <Link
                        href={child.href}
                        className={`sf-nav-panel__link ${
                          isCurrent(pathname, child.href) ? 'sf-nav-panel__link--current' : ''
                        }`}
                        onClick={close}
                      >
                        {child.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              {openItem.href ? (
                <div className="sf-nav-panel__footer">
                  <Link href={openItem.href} className="sf-nav-panel__all" onClick={close}>
                    Смотреть все {openItem.label.toLowerCase()}
                    <span aria-hidden> →</span>
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </nav>
    </>
  );
}

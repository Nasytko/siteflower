'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { cartItemCount, readCart } from '@/lib/cart';
import { nextCompactFromScroll } from '@/lib/scroll-chrome';
import { BrandLogo } from './brand-logo';
import { PRIMARY_NAV, PrimaryNav, type PrimaryNavItem } from './primary-nav';
import { SearchDialog } from './search-dialog';

type Props = {
  city: string;
  brandName: string;
  phone?: string | null;
  workingHours?: string | null;
  navItems?: PrimaryNavItem[];
};

/**
 * Sticky 2-row header → collapses to 1 row on scroll.
 * Single DOM tree (no dual panels / spacer / scroll compensation).
 */
export function StorefrontHeader({ city, brandName, phone, workingHours, navItems = PRIMARY_NAV }: Props) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const menuId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const compactRef = useRef(false);

  useEffect(() => {
    setMenuOpen(false);
    setPlaceOpen(false);
  }, [pathname]);

  useEffect(() => {
    const syncCart = () => setCartCount(cartItemCount(readCart()));
    syncCart();
    window.addEventListener('bouquet:cart', syncCart as EventListener);
    return () => window.removeEventListener('bouquet:cart', syncCart as EventListener);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const next = nextCompactFromScroll(window.scrollY, compactRef.current);
      if (next === compactRef.current) return;
      compactRef.current = next;
      setCompact(next);
      if (!next) setPlaceOpen(false);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const telHref = phone ? `tel:${phone.replace(/\s+/g, '')}` : null;

  const [openMobileBranch, setOpenMobileBranch] = useState<string | null>(null);

  return (
    <>
      <header
        className={`sf-site-header sticky top-0 z-40 ${
          compact ? 'sf-site-header--compact border-b border-border' : ''
        }`}
      >
        {/* Utility bar — service links, not CatalogCategory menu */}
        <div className="hidden border-b border-border/70 bg-[color-mix(in_oklab,var(--surface)_88%,var(--background))] lg:block">
          <div className="sf-container-wide flex h-8 items-center justify-between gap-4 text-[0.7rem] text-muted">
            <span className="truncate">
              {city}
              {workingHours ? ` · ${workingHours}` : ''}
            </span>
            <nav className="flex items-center gap-4" aria-label="Служебные ссылки">
              <Link href="/o-nas" className="hover:text-brand">
                О нас
              </Link>
              <Link href="/dostavka" className="hover:text-brand">
                Доставка и оплата
              </Link>
              <Link href="/kontakty" className="hover:text-brand">
                Контакты
              </Link>
            </nav>
          </div>
        </div>

        {/* Row 1 — brand chrome (always visible) */}
        <div className="sf-header-row sf-container-wide">
          <div className="flex min-w-0 flex-col items-start gap-0.5 justify-self-start">
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-foreground transition-colors hover:text-brand lg:hidden"
                aria-expanded={menuOpen}
                aria-controls={menuId}
                aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <MenuIcon open={menuOpen} />
              </button>

              {telHref ? (
                <a
                  href={telHref}
                  className="sf-header-phone hidden max-w-[12rem] items-center gap-1.5 truncate font-semibold text-ink transition-colors hover:text-brand sm:inline-flex"
                >
                  <PhoneIcon />
                  <span className="truncate">{phone}</span>
                </a>
              ) : null}
            </div>

            <div className="relative hidden md:block">
              <button
                type="button"
                className="sf-header-place inline-flex max-w-[11rem] items-center gap-1 truncate text-muted hover:text-brand"
                aria-expanded={placeOpen}
                onClick={() => setPlaceOpen((open) => !open)}
              >
                <PinIcon />
                <span className="truncate">{city}</span>
                {workingHours && !compact ? (
                  <span className="truncate opacity-70"> · {workingHours}</span>
                ) : (
                  <ChevronIcon open={placeOpen} />
                )}
              </button>
              {placeOpen ? (
                <div className="absolute left-0 top-full z-50 mt-2 w-56 rounded-[var(--radius-md)] border border-border bg-surface p-3 shadow-[var(--shadow-soft)]">
                  <p className="text-sm font-semibold text-ink">{city}</p>
                  {workingHours ? (
                    <p className="mt-1 text-xs text-muted">{workingHours}</p>
                  ) : null}
                  <Link
                    href="/o-nas"
                    className="mt-2 inline-block text-xs font-semibold text-brand hover:underline"
                    onClick={() => setPlaceOpen(false)}
                  >
                    Контакты и адрес
                  </Link>
                </div>
              ) : null}
            </div>
          </div>

          <Link href="/" className="justify-self-center text-center hover:opacity-90">
            <BrandLink brandName={brandName} compact={compact} />
          </Link>

          {/* Compact desktop: nav sits in the single row */}
          <div className="sf-header-inline-nav hidden min-w-0 flex-1 justify-self-stretch lg:block">
            <PrimaryNav items={navItems} inline />
          </div>

          <HeaderActions
            cartCount={cartCount}
            showLabels={!compact}
            onSearch={() => setSearchOpen(true)}
          />
        </div>

        {/* Row 2 — primary nav (collapses via grid-template-rows) */}
        <div className="sf-header-nav" aria-hidden={compact}>
          <div className="sf-header-nav__inner">
            <div className="hidden border-t border-border lg:block">
              <PrimaryNav items={navItems} />
            </div>
          </div>
        </div>
      </header>

      {menuOpen ? (
        <div
          id={menuId}
          className="fixed inset-0 z-50 overflow-y-auto bg-background lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Меню"
        >
          <div className="sf-container flex h-14 items-center justify-between">
            <BrandLogo compact alt={brandName} />
            <button
              ref={closeRef}
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center"
              aria-label="Закрыть меню"
              onClick={() => setMenuOpen(false)}
            >
              <MenuIcon open />
            </button>
          </div>
          <nav className="sf-container flex flex-col gap-1 pb-16 pt-2" aria-label="Мобильное меню">
            {navItems.map((item) => {
              const hasChildren = (item.children?.length ?? 0) > 0;
              const branchOpen = openMobileBranch === item.id;
              return (
                <div key={item.id} className="border-b border-border py-1">
                  <div className="flex items-center gap-1">
                    <Link
                      href={item.href}
                      className={`sf-nav-link block flex-1 px-2 py-3 text-base transition-colors ${
                        item.accent ? 'text-accent' : 'text-foreground'
                      }`}
                      onClick={() => setMenuOpen(false)}
                    >
                      {item.label}
                    </Link>
                    {hasChildren ? (
                      <button
                        type="button"
                        className="inline-flex h-10 w-10 items-center justify-center text-muted"
                        aria-expanded={branchOpen}
                        aria-label={branchOpen ? 'Свернуть' : 'Развернуть'}
                        onClick={() =>
                          setOpenMobileBranch((current) => (current === item.id ? null : item.id))
                        }
                      >
                        <ChevronIcon open={branchOpen} />
                      </button>
                    ) : null}
                  </div>
                  {hasChildren && branchOpen
                    ? item.children?.map((child) => (
                        <Link
                          key={`${item.id}-${child.href}`}
                          href={child.href}
                          className="sf-nav-link block py-2 pl-6 pr-2 text-sm text-muted hover:text-brand"
                          onClick={() => setMenuOpen(false)}
                        >
                          {child.label}
                        </Link>
                      ))
                    : null}
                </div>
              );
            })}
            {telHref ? (
              <a href={telHref} className="mt-4 px-2 py-3 text-base font-medium">
                {phone}
              </a>
            ) : null}
            <p className="px-2 py-2 text-sm text-muted">
              {city}
              {workingHours ? ` · ${workingHours}` : ''}
            </p>
          </nav>
        </div>
      ) : null}

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

function BrandLink({ brandName, compact }: { brandName: string; compact: boolean }) {
  return (
    <span className="inline-flex items-center" aria-label={brandName}>
      <BrandLogo compact={compact} alt={brandName} priority />
    </span>
  );
}

function HeaderActions({
  cartCount,
  showLabels,
  onSearch,
}: {
  cartCount: number;
  showLabels: boolean;
  onSearch: () => void;
}) {
  return (
    <div className="ml-auto flex shrink-0 items-center justify-self-end gap-1 sm:gap-2.5">
      <button
        type="button"
        className="inline-flex flex-col items-center gap-0.5 px-1 text-ink hover:text-brand"
        aria-label="Найти букет"
        onClick={onSearch}
      >
        <SearchIcon />
        {showLabels ? (
          <span className="hidden text-[0.65rem] font-medium sm:block">Поиск</span>
        ) : null}
      </button>
      <Link
        href="/favorites"
        className="inline-flex flex-col items-center gap-0.5 px-1 text-ink hover:text-brand"
        aria-label="Избранное"
      >
        <HeartIcon />
        {showLabels ? (
          <span className="hidden text-[0.65rem] font-medium sm:block">Избранное</span>
        ) : null}
      </Link>
      <Link
        href="/cart"
        className="relative inline-flex items-center px-1 text-ink hover:text-brand"
        aria-label="Корзина"
      >
        <BagIcon />
        {cartCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[0.65rem] font-semibold text-white">
            {cartCount > 99 ? '99+' : cartCount}
          </span>
        ) : null}
      </Link>
    </div>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="currentColor" aria-hidden>
      <path d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5c0 3.2 4.5 8.5 4.5 8.5s4.5-5.3 4.5-8.5A4.5 4.5 0 0 0 8 1.5Zm0 6.2a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4Z" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <path
        d="M7.2 4.8h2.4l1.2 3-1.6 1.2a11 11 0 0 0 5.6 5.6l1.2-1.6 3 1.2v2.4A1.6 1.6 0 0 1 17.4 18 13.2 13.2 0 0 1 6 6.6a1.6 1.6 0 0 1 1.2-1.8Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <path d="M2.5 4.5 6 8l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16.5 16.5 20 20" strokeLinecap="round" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M12 19.5s-6.6-4.1-6.6-8.7a3.95 3.95 0 0 1 6.6-2.9 3.95 3.95 0 0 1 6.6 2.9c0 4.6-6.6 8.7-6.6 8.7Z" />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path
        d="M6.5 8.5h11l-.8 10.2a1.6 1.6 0 0 1-1.6 1.5H8.9a1.6 1.6 0 0 1-1.6-1.5L6.5 8.5Z"
        strokeLinejoin="round"
      />
      <path d="M9 8.5V7a3 3 0 0 1 6 0v1.5" strokeLinecap="round" />
    </svg>
  );
}

function MenuIcon({ open }: { open?: boolean }) {
  return open ? (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M6 6 18 18M18 6 6 18" strokeLinecap="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

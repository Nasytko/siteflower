'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { cartItemCount, readCart } from '@/lib/cart';
import { SearchDialog } from './search-dialog';

const NAV = [
  { href: '/bukety', label: 'Все букеты' },
  { href: '/povod/den-rozhdeniya', label: 'Поводы' },
  { href: '/komu/mame', label: 'Кому' },
  { href: '/collections/izbrannoe', label: 'Подборки' },
  { href: '/dostavka', label: 'Доставка' },
  { href: '/o-nas', label: 'О нас' },
] as const;

type Props = {
  city: string;
  brandName: string;
  phone?: string | null;
  workingHours?: string | null;
};

export function StorefrontHeader({ city, brandName, phone, workingHours }: Props) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const menuId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const syncCart = () => setCartCount(cartItemCount(readCart()));
    syncCart();
    window.addEventListener('bouquet:cart', syncCart as EventListener);
    return () => window.removeEventListener('bouquet:cart', syncCart as EventListener);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
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

  return (
    <>
      <header
        className={`sticky top-0 z-40 border-b border-border/70 bg-background/95 backdrop-blur-md transition-[box-shadow] duration-300 ${
          scrolled ? 'shadow-[var(--shadow-soft)]' : ''
        }`}
      >
        {/* Expanded two-row header */}
        <div
          className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-out ${
            scrolled ? 'max-h-0 opacity-0 pointer-events-none' : 'max-h-40 opacity-100'
          }`}
          aria-hidden={scrolled}
        >
          <div className="sf-container-wide grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-3 md:py-4">
            <div className="flex min-w-0 flex-col gap-0.5 justify-self-start">
              {telHref ? (
                <a
                  href={telHref}
                  className="sf-small font-medium tracking-wide text-foreground hover:text-brand"
                >
                  {phone}
                </a>
              ) : (
                <span className="sf-label">{city}</span>
              )}
              {workingHours ? (
                <span className="hidden text-[0.7rem] text-muted sm:block">{workingHours}</span>
              ) : (
                <span className="hidden text-[0.7rem] text-muted sm:block">
                  Доставка цветов · {city}
                </span>
              )}
            </div>

            <Link
              href="/"
              className="justify-self-center text-center transition hover:opacity-90"
            >
              <span className="block font-[family-name:var(--font-display)] text-[1.65rem] font-medium tracking-[0.18em] text-foreground md:text-[1.85rem]">
                {brandName}
              </span>
              <span className="sf-label mt-0.5 block text-[0.65rem] tracking-[0.22em]">
                {city}
              </span>
            </Link>

            <div className="flex items-center justify-self-end gap-0.5 sm:gap-1">
              <HeaderIconButton label="Найти букет" onClick={() => setSearchOpen(true)}>
                <SearchIcon />
              </HeaderIconButton>
              <Link
                href="/favorites"
                className="inline-flex h-10 w-10 items-center justify-center text-foreground transition hover:text-brand"
                aria-label="Избранное"
              >
                <HeartIcon />
              </Link>
              <Link
                href="/cart"
                className="relative inline-flex h-10 w-10 items-center justify-center text-foreground transition hover:text-brand"
                aria-label="Корзина"
              >
                <CartIcon />
                {cartCount > 0 ? (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-sm bg-foreground px-1 text-[0.65rem] font-medium text-background">
                    {cartCount > 9 ? '9+' : cartCount}
                  </span>
                ) : null}
              </Link>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center text-foreground transition hover:text-brand lg:hidden"
                aria-expanded={menuOpen}
                aria-controls={menuId}
                aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <MenuIcon open={menuOpen} />
              </button>
            </div>
          </div>

          <nav
            aria-label="Основное"
            className="hidden border-t border-border/50 lg:block"
          >
            <ul className="sf-container-wide flex flex-wrap items-center justify-center gap-x-7 gap-y-2 py-3">
              {NAV.map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className="sf-nav-link text-foreground/85 transition hover:text-brand"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/* Collapsed single-row header */}
        <div
          className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-out ${
            scrolled ? 'max-h-16 opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
          }`}
          aria-hidden={!scrolled}
        >
          <div className="sf-container-wide flex h-14 items-center justify-between gap-4">
            <Link
              href="/"
              className="shrink-0 font-[family-name:var(--font-display)] text-lg font-medium tracking-[0.14em] text-foreground md:text-xl"
            >
              {brandName}
            </Link>
            <nav aria-label="Основное (свёрнутое)" className="hidden items-center gap-5 lg:flex">
              {NAV.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="sf-nav-link text-[0.8rem] text-foreground/80 transition hover:text-brand"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="flex items-center gap-0.5">
              {telHref ? (
                <a
                  href={telHref}
                  className="sf-small mr-2 hidden font-medium text-muted hover:text-brand xl:inline"
                >
                  {phone}
                </a>
              ) : null}
              <HeaderIconButton label="Найти букет" onClick={() => setSearchOpen(true)}>
                <SearchIcon />
              </HeaderIconButton>
              <Link
                href="/favorites"
                className="inline-flex h-9 w-9 items-center justify-center text-foreground hover:text-brand"
                aria-label="Избранное"
              >
                <HeartIcon />
              </Link>
              <Link
                href="/cart"
                className="relative inline-flex h-9 w-9 items-center justify-center text-foreground hover:text-brand"
                aria-label="Корзина"
              >
                <CartIcon />
                {cartCount > 0 ? (
                  <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-sm bg-foreground px-1 text-[0.65rem] font-medium text-background">
                    {cartCount > 9 ? '9+' : cartCount}
                  </span>
                ) : null}
              </Link>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center text-foreground hover:text-brand lg:hidden"
                aria-expanded={menuOpen}
                aria-controls={menuId}
                aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <MenuIcon open={menuOpen} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {menuOpen ? (
        <div
          id={menuId}
          className="fixed inset-0 z-50 bg-background lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Меню"
        >
          <div className="sf-container flex h-14 items-center justify-between">
            <p className="font-[family-name:var(--font-display)] text-xl tracking-[0.12em]">
              {brandName}
            </p>
            <button
              ref={closeRef}
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center hover:text-brand"
              aria-label="Закрыть меню"
              onClick={() => setMenuOpen(false)}
            >
              <MenuIcon open />
            </button>
          </div>
          <nav className="sf-container flex flex-col gap-1 pt-6" aria-label="Мобильное меню">
            {NAV.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="sf-nav-link rounded-[var(--radius-md)] px-3 py-3.5 text-foreground hover:bg-brand-soft"
              >
                {item.label}
              </Link>
            ))}
            {telHref ? (
              <a
                href={telHref}
                className="mt-4 px-3 py-3 text-lg font-medium text-foreground"
              >
                {phone}
              </a>
            ) : null}
            <Link
              href="/favorites"
              className="rounded-[var(--radius-md)] px-3 py-3 text-lg text-foreground hover:bg-brand-soft"
            >
              Избранное
            </Link>
            <Link
              href="/cart"
              className="rounded-[var(--radius-md)] px-3 py-3 text-lg text-foreground hover:bg-brand-soft"
            >
              Корзина{cartCount > 0 ? ` (${cartCount})` : ''}
            </Link>
          </nav>
        </div>
      ) : null}

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

function HeaderIconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="inline-flex h-10 w-10 items-center justify-center text-foreground transition hover:text-brand"
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
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
      <path d="M12 20s-7-4.35-7-9.2A4.2 4.2 0 0 1 12 7.1a4.2 4.2 0 0 1 7 3.7C19 15.65 12 20 12 20Z" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[1.15rem] w-[1.15rem]" fill="currentColor" aria-hidden>
      <path d="M7.5 6h13.2l-1.1 7.2a1.6 1.6 0 0 1-1.6 1.35H9.4A1.6 1.6 0 0 1 7.8 13.1L6.2 4H4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10.2" cy="19.2" r="1.15" />
      <circle cx="16.8" cy="19.2" r="1.15" />
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

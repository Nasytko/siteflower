'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { cartItemCount, readCart } from '@/lib/cart';
import { MEGA_NAV } from './mega-nav-data';
import { MegaNav } from './mega-nav';
import { SearchDialog } from './search-dialog';

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
    const onScroll = () => setScrolled(window.scrollY > 28);
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
        className={`sticky top-0 z-40 bg-background/95 backdrop-blur-md transition-[box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          scrolled ? 'shadow-[var(--shadow-soft)]' : ''
        }`}
      >
        {/* Utility bar — collapses on scroll */}
        <div
          className={`sf-utility-bar hidden overflow-hidden transition-[max-height,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] md:block ${
            scrolled ? 'pointer-events-none max-h-0 opacity-0' : 'max-h-10 opacity-100'
          }`}
          aria-hidden={scrolled}
        >
          <div className="sf-container-wide flex h-9 items-center justify-between gap-4">
            <p className="inline-flex items-center gap-1.5 truncate">
              <PinIcon />
              {city}
              {workingHours ? <span className="opacity-70"> · {workingHours}</span> : null}
            </p>
            <nav className="flex items-center gap-5" aria-label="Сервис">
              <Link href="/o-nas" className="opacity-90 transition-opacity hover:opacity-100">
                О нас
              </Link>
              <Link href="/dostavka" className="opacity-90 transition-opacity hover:opacity-100">
                Доставка и оплата
              </Link>
              <Link href="/o-nas" className="opacity-90 transition-opacity hover:opacity-100">
                Контакты
              </Link>
            </nav>
          </div>
        </div>

        {/* Main row */}
        <div
          className={`sf-container-wide relative grid grid-cols-[1fr_auto_1fr] items-center gap-2 transition-[height] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            scrolled ? 'h-14' : 'h-[4.5rem] sm:h-[5rem]'
          }`}
        >
          <div className="flex min-w-0 items-center gap-1 justify-self-start">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center text-foreground transition-colors hover:text-brand lg:hidden"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MenuIcon open={menuOpen} />
            </button>
            <div
              className={`hidden min-w-0 transition-opacity duration-400 sm:block ${
                scrolled ? 'opacity-0 pointer-events-none lg:opacity-100 lg:pointer-events-auto' : 'opacity-100'
              }`}
            >
              {telHref ? (
                <>
                  <a
                    href={telHref}
                    className={`inline-flex items-center gap-1.5 font-semibold text-ink transition-all hover:text-brand ${
                      scrolled ? 'text-xs' : 'text-sm'
                    }`}
                  >
                    <PhoneIcon />
                    <span className="truncate">{phone}</span>
                  </a>
                  {!scrolled ? (
                    <p className="pl-5 text-xs text-brand">
                      <a href={telHref} className="transition-opacity hover:underline">
                        Обратный звонок
                      </a>
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="sf-small text-muted">{city}</p>
              )}
            </div>
          </div>

          <Link href="/" className="justify-self-center text-center transition-transform duration-500 hover:opacity-90">
            <span className="inline-flex items-center gap-2 text-brand sm:gap-2.5">
              <BrandMark
                className={`transition-all duration-500 ${scrolled ? 'h-6 w-6' : 'h-8 w-8 sm:h-9 sm:w-9'}`}
              />
              <span
                className={`font-[family-name:var(--font-display)] font-semibold tracking-wide transition-all duration-500 ${
                  scrolled ? 'text-[1.2rem]' : 'text-[1.45rem] sm:text-[1.75rem]'
                }`}
              >
                {brandName}
              </span>
            </span>
          </Link>

          <div className="flex items-center justify-self-end gap-1 sm:gap-3">
            <button
              type="button"
              className="inline-flex flex-col items-center gap-0.5 px-1 text-ink transition-colors hover:text-brand"
              aria-label="Поиск"
              onClick={() => setSearchOpen(true)}
            >
              <SearchIcon />
              <span
                className={`hidden text-[0.65rem] font-medium transition-opacity duration-300 sm:block ${
                  scrolled ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'
                }`}
              >
                Поиск
              </span>
            </button>
            <Link
              href="/favorites"
              className="inline-flex flex-col items-center gap-0.5 px-1 text-ink transition-colors hover:text-brand"
              aria-label="Избранное"
            >
              <UserIcon />
              <span
                className={`hidden text-[0.65rem] font-medium transition-opacity duration-300 sm:block ${
                  scrolled ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'
                }`}
              >
                Кабинет
              </span>
            </Link>
            <Link
              href="/cart"
              className="relative inline-flex items-center px-1 text-ink transition-colors hover:text-brand"
              aria-label="Корзина"
            >
              <BagIcon />
              {cartCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[0.65rem] font-semibold text-white transition-transform duration-300">
                  {cartCount > 99 ? '99+' : cartCount}
                </span>
              ) : null}
            </Link>
          </div>
        </div>

        {/* Mega nav — compact when scrolled */}
        <div
          className={`hidden overflow-hidden border-t border-border/60 transition-[max-height,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] lg:block ${
            scrolled ? 'max-h-11' : 'max-h-14'
          }`}
        >
          <MegaNav compact={scrolled} />
        </div>
      </header>

      {menuOpen ? (
        <div
          id={menuId}
          className="fixed inset-0 z-50 overflow-y-auto bg-background/98 backdrop-blur-sm lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Меню"
        >
          <div className="sf-container flex h-14 items-center justify-between">
            <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-brand">
              {brandName}
            </p>
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
            {MEGA_NAV.map((item) => (
              <div key={item.id} className="border-b border-border py-1">
                <Link
                  href={item.href}
                  className={`sf-nav-link block px-2 py-3 transition-colors ${
                    item.accent ? 'text-accent' : 'text-foreground'
                  }`}
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </Link>
              </div>
            ))}
            {telHref ? (
              <a href={telHref} className="mt-4 px-2 py-3 text-base font-medium">
                {phone}
              </a>
            ) : null}
          </nav>
        </div>
      ) : null}

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden>
      <path
        d="M16 3.5c1.6 2.8 2.2 5.1 2 7.2-.2 2.3-1.2 4.1-2 5.1-.8-1-1.8-2.8-2-5.1-.2-2.1.4-4.4 2-7.2Z"
        fill="currentColor"
      />
      <path
        d="M16 3.5c1.6 2.8 2.2 5.1 2 7.2-.2 2.3-1.2 4.1-2 5.1-.8-1-1.8-2.8-2-5.1-.2-2.1.4-4.4 2-7.2Z"
        fill="currentColor"
        opacity="0.7"
        transform="rotate(60 16 16)"
      />
      <path
        d="M16 3.5c1.6 2.8 2.2 5.1 2 7.2-.2 2.3-1.2 4.1-2 5.1-.8-1-1.8-2.8-2-5.1-.2-2.1.4-4.4 2-7.2Z"
        fill="currentColor"
        opacity="0.55"
        transform="rotate(120 16 16)"
      />
      <path
        d="M16 3.5c1.6 2.8 2.2 5.1 2 7.2-.2 2.3-1.2 4.1-2 5.1-.8-1-1.8-2.8-2-5.1-.2-2.1.4-4.4 2-7.2Z"
        fill="currentColor"
        opacity="0.7"
        transform="rotate(180 16 16)"
      />
      <path
        d="M16 3.5c1.6 2.8 2.2 5.1 2 7.2-.2 2.3-1.2 4.1-2 5.1-.8-1-1.8-2.8-2-5.1-.2-2.1.4-4.4 2-7.2Z"
        fill="currentColor"
        opacity="0.55"
        transform="rotate(240 16 16)"
      />
      <path
        d="M16 3.5c1.6 2.8 2.2 5.1 2 7.2-.2 2.3-1.2 4.1-2 5.1-.8-1-1.8-2.8-2-5.1-.2-2.1.4-4.4 2-7.2Z"
        fill="currentColor"
        opacity="0.7"
        transform="rotate(300 16 16)"
      />
      <circle cx="16" cy="16" r="2" fill="currentColor" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
      <path d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5c0 3.2 4.5 8.5 4.5 8.5s4.5-5.3 4.5-8.5A4.5 4.5 0 0 0 8 1.5Zm0 6.2a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4Z" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path
        d="M7.2 4.8h2.4l1.2 3-1.6 1.2a11 11 0 0 0 5.6 5.6l1.2-1.6 3 1.2v2.4A1.6 1.6 0 0 1 17.4 18 13.2 13.2 0 0 1 6 6.6a1.6 1.6 0 0 1 1.2-1.8Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="12" cy="9" r="3.2" />
      <path d="M5.5 19.2c1.6-3 4-4.5 6.5-4.5s4.9 1.5 6.5 4.5" strokeLinecap="round" />
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

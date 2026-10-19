'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { cartItemCount, readCart } from '@/lib/cart';
import { nextCompactFromScroll } from '@/lib/scroll-chrome';
import { BrandLogo } from './brand-logo';
import { PRIMARY_NAV, PrimaryNav, type PrimaryNavItem } from './primary-nav';

type Props = {
  city: string;
  brandName: string;
  phone?: string | null;
  workingHours?: string | null;
  navItems?: PrimaryNavItem[];
};

/**
 * Mockup-aligned header: utility bar + single desktop row (logo | nav | actions).
 * Mobile keeps a compact bar with menu, phone, favorites and cart.
 */
export function StorefrontHeader({
  city,
  brandName,
  phone,
  workingHours,
  navItems = PRIMARY_NAV,
}: Props) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const menuId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const compactRef = useRef(false);
  const [openMobileBranch, setOpenMobileBranch] = useState<string | null>(null);

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
    const onScroll = () => {
      const next = nextCompactFromScroll(window.scrollY, compactRef.current);
      if (next === compactRef.current) return;
      compactRef.current = next;
      setCompact(next);
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

  return (
    <>
      <header
        className={`sf-site-header sticky top-0 z-40 ${
          compact ? 'sf-site-header--compact border-b border-border' : ''
        }`}
      >
        <div className="hidden border-b border-border/70 bg-[color-mix(in_oklab,var(--color-surface-muted)_70%,var(--color-background))] lg:block">
          <div className="sf-utility-bar sf-container-wide">
            <span className="sf-utility-bar__item truncate">
              <PinIcon />
              {city}
              {workingHours ? ` · ${workingHours}` : ''}
            </span>
            <nav className="flex items-center gap-7" aria-label="Служебные ссылки">
              <Link href="/dostavka" className="hover:text-brand">
                Доставка и оплата
              </Link>
              {telHref ? (
                <a href={telHref} className="sf-utility-bar__item hover:text-brand">
                  <PhoneIcon />
                  {phone}
                </a>
              ) : null}
            </nav>
          </div>
        </div>

        <div className="sf-header-row sf-header-row--mockup sf-container-wide">
          <div className="flex min-w-0 items-center gap-1 justify-self-start">
            <button
              type="button"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-foreground transition-colors hover:text-brand lg:hidden"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MenuIcon open={menuOpen} />
            </button>

            <Link href="/" className="hidden hover:opacity-90 lg:block">
              <BrandLogo compact={compact} alt={brandName} />
            </Link>

            {telHref ? (
              <a
                href={telHref}
                aria-label={`Позвонить: ${phone}`}
                className="sf-header-phone inline-flex h-11 max-w-[11rem] items-center gap-1.5 truncate px-1 font-semibold text-ink transition-colors hover:text-brand lg:hidden"
              >
                <PhoneIcon />
                <span className="hidden truncate text-sm sm:inline">{phone}</span>
              </a>
            ) : null}
          </div>

          <Link href="/" className="justify-self-center hover:opacity-90 lg:hidden">
            <BrandLogo compact alt={brandName} />
          </Link>

          <div className="sf-header-inline-nav hidden min-w-0 justify-self-stretch lg:block">
            <PrimaryNav items={navItems} inline />
          </div>

          <HeaderActions cartCount={cartCount} showLabels={!compact} />
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
              const hasBranch =
                (item.children?.length ?? 0) > 0 || (item.groups?.length ?? 0) > 0;
              const branchOpen = openMobileBranch === item.id;
              return (
                <div key={item.id} className="border-b border-border/80 py-1">
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
                    {hasBranch ? (
                      <button
                        type="button"
                        className="inline-flex h-10 w-10 items-center justify-center text-muted"
                        aria-expanded={branchOpen}
                        aria-label={branchOpen ? 'Свернуть' : `Открыть «${item.label}»`}
                        onClick={() =>
                          setOpenMobileBranch((current) => (current === item.id ? null : item.id))
                        }
                      >
                        <ChevronIcon open={branchOpen} />
                      </button>
                    ) : null}
                  </div>
                  {hasBranch && branchOpen ? (
                    <div className="space-y-3 pb-3 pl-3 pr-2">
                      {item.groups?.map((group) => (
                        <div key={group.id}>
                          <p className="mb-1 text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-muted">
                            {group.label}
                          </p>
                          <ul className="space-y-0.5">
                            {group.children.map((child) => (
                              <li key={`${group.id}-${child.href}`}>
                                <Link
                                  href={child.href}
                                  className="sf-nav-link block py-2 text-sm text-foreground hover:text-brand"
                                  onClick={() => setMenuOpen(false)}
                                >
                                  {child.label}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                      {item.children?.map((child) => (
                        <Link
                          key={`${item.id}-${child.href}`}
                          href={child.href}
                          className="sf-nav-link flex items-center gap-3 py-2 text-sm text-foreground hover:text-brand"
                          onClick={() => setMenuOpen(false)}
                        >
                          {item.panelLayout === 'TILES' && child.imageUrl ? (
                            <img
                              src={child.imageUrl}
                              alt=""
                              className="h-11 w-11 shrink-0 rounded-lg object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : null}
                          {child.label}
                        </Link>
                      ))}
                      <Link
                        href={item.href}
                        className="inline-block pt-1 text-sm font-medium text-brand"
                        onClick={() => setMenuOpen(false)}
                      >
                        Смотреть все →
                      </Link>
                    </div>
                  ) : null}
                </div>
              );
            })}

            <div className="mt-6 space-y-1 border-t border-border pt-4">
              <Link
                href="/dostavka"
                className="block px-2 py-2.5 text-sm text-muted hover:text-brand"
                onClick={() => setMenuOpen(false)}
              >
                Доставка и оплата
              </Link>
              <Link
                href="/kontakty"
                className="block px-2 py-2.5 text-sm text-muted hover:text-brand"
                onClick={() => setMenuOpen(false)}
              >
                Контакты
              </Link>
              <Link
                href="/o-nas"
                className="block px-2 py-2.5 text-sm text-muted hover:text-brand"
                onClick={() => setMenuOpen(false)}
              >
                О нас
              </Link>
            </div>

            <div className="mt-6 space-y-2 px-2 text-sm text-muted">
              {telHref ? (
                <a href={telHref} className="block font-medium text-ink">
                  {phone}
                </a>
              ) : null}
              <p>
                {city}
                {workingHours ? ` · ${workingHours}` : ''}
              </p>
            </div>
          </nav>
        </div>
      ) : null}
    </>
  );
}

function HeaderActions({
  cartCount,
  showLabels,
}: {
  cartCount: number;
  showLabels: boolean;
}) {
  return (
    <div className="sf-header-actions">
      <Link href="/favorites" className="sf-header-action" aria-label="Избранное">
        <HeartIcon />
        {showLabels ? <span className="sf-header-action__label">Избранное</span> : null}
      </Link>
      <Link href="/cart" className="sf-header-action" aria-label="Корзина">
        <span className="relative inline-flex">
          <BagIcon />
          <span className="sf-header-action__count">{cartCount > 99 ? '99+' : cartCount}</span>
        </span>
        {showLabels ? <span className="sf-header-action__label">Корзина</span> : null}
      </Link>
    </div>
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

function PinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <path d="M12 20.5s6-5.4 6-10.2a6 6 0 0 0-12 0c0 4.8 6 10.2 6 10.2Z" strokeLinejoin="round" />
      <circle cx="12" cy="10.3" r="2.1" />
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
        d="M3 4h2.2l2 10.4a1.8 1.8 0 0 0 1.8 1.4h7.6a1.8 1.8 0 0 0 1.7-1.3L20 8H6.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9.5" cy="19.5" r="1.3" />
      <circle cx="16.5" cy="19.5" r="1.3" />
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

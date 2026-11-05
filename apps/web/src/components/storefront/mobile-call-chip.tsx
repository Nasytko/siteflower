'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

type Props = {
  phone: string;
};

/**
 * Soft floating call affordance for phones — quiet, not a hard FAB.
 * Hidden on checkout / cart / order flows and when the PDP sticky bar is present.
 */
export function MobileCallChip({ phone }: Props) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const telHref = `tel:${phone.replace(/\s+/g, '')}`;

  const hideOnRoute =
    pathname.startsWith('/cart') ||
    pathname.startsWith('/checkout') ||
    pathname.startsWith('/order') ||
    pathname.startsWith('/products/');

  useEffect(() => {
    if (hideOnRoute) {
      setVisible(false);
      return;
    }

    const onScroll = () => {
      setVisible(window.scrollY > 220);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [hideOnRoute]);

  if (hideOnRoute || !visible) return null;

  return (
    <a
      href={telHref}
      className="sf-call-chip lg:hidden"
      aria-label={`Позвонить: ${phone}`}
    >
      <span className="sf-call-chip__glow" aria-hidden />
      <span className="sf-call-chip__icon" aria-hidden>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path
            d="M7.2 4.8h2.4l1.2 3-1.6 1.2a11 11 0 0 0 5.6 5.6l1.2-1.6 3 1.2v2.4A1.6 1.6 0 0 1 17.4 18 13.2 13.2 0 0 1 6 6.6a1.6 1.6 0 0 1 1.2-1.8Z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="sf-call-chip__label">Позвонить</span>
    </a>
  );
}

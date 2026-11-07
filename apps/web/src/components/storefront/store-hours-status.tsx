'use client';

import { useEffect, useState } from 'react';
import { isStoreOpenNow } from '@/lib/store-hours';

type Props = {
  workingHours: string | null | undefined;
  /** Compact chip for the utility bar / menu. */
  variant?: 'inline' | 'stack';
  className?: string;
};

/**
 * Salon open/closed dot + hours, with a note that online orders are always welcome.
 * Status updates on the client (Europe/Minsk via shared helpers).
 */
export function StoreHoursStatus({
  workingHours,
  variant = 'inline',
  className = '',
}: Props) {
  const hours = workingHours?.trim() || null;
  // Always start null so SSR markup matches the first client paint (avoids hydration mismatch).
  const [open, setOpen] = useState<boolean | null>(null);

  useEffect(() => {
    const tick = () => setOpen(isStoreOpenNow(hours));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [hours]);

  if (!hours) return null;

  const statusLabel = open === true ? 'Открыто' : open === false ? 'Закрыто' : null;
  const statusTone = open === true ? 'open' : open === false ? 'closed' : 'unknown';

  if (variant === 'stack') {
    return (
      <div className={`sf-hours ${className}`.trim()}>
        <p className="sf-hours__row">
          {statusLabel ? (
            <span className={`sf-hours__badge sf-hours__badge--${statusTone}`} aria-live="polite">
              <span className="sf-hours__dot" aria-hidden />
              {statusLabel}
            </span>
          ) : null}
          <span className="sf-hours__time">{hours}</span>
        </p>
        <p className="sf-hours__online">Онлайн-магазин работает — заказы принимаем круглосуточно</p>
      </div>
    );
  }

  return (
    <span className={`sf-hours sf-hours--inline ${className}`.trim()}>
      {statusLabel ? (
        <span className={`sf-hours__badge sf-hours__badge--${statusTone}`} aria-live="polite">
          <span className="sf-hours__dot" aria-hidden />
          {statusLabel}
        </span>
      ) : null}
      <span className="sf-hours__time">{hours}</span>
      <span className="sf-hours__sep" aria-hidden>
        ·
      </span>
      <span className="sf-hours__online-inline" title="Оформляйте заказ в любое время">
        заказы онлайн 24/7
      </span>
    </span>
  );
}

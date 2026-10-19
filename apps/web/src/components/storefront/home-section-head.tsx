import Link from 'next/link';
import type { ReactNode } from 'react';

type Props = {
  title: string;
  /** Pill right after the title (e.g. real max promo percent). */
  badge?: ReactNode;
  /** Short muted line inline with the title. */
  subtitle?: string | null;
  /** Inline controls after the title — e.g. shelf tabs. */
  children?: ReactNode;
  href?: string | null;
  linkLabel?: string;
};

/** Homepage shelf heading: title · badge/subtitle/tabs ……… Смотреть все → */
export function HomeSectionHead({
  title,
  badge,
  subtitle,
  children,
  href,
  linkLabel = 'Смотреть все',
}: Props) {
  return (
    <div className="sf-home-head">
      <div className="sf-home-head__main">
        <h2 className="sf-home-head__title">{title}</h2>
        {badge ? <span className="sf-home-head__badge">{badge}</span> : null}
        {subtitle ? <p className="sf-home-head__subtitle">{subtitle}</p> : null}
        {children}
      </div>
      {href ? (
        <Link href={href} className="sf-home-head__link">
          {linkLabel}
          <span aria-hidden>→</span>
        </Link>
      ) : null}
    </div>
  );
}

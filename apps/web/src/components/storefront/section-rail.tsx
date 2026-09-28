import Link from 'next/link';

type Props = {
  /** Full heading text. First word is emphasized; the rest is muted (Dicentra-style). */
  title: string;
  /** Override the muted part; when set, `title` is the bold lead only. */
  titleRest?: string;
  href?: string;
  linkLabel?: string;
  className?: string;
  as?: 'h2' | 'h3';
};

function splitTitle(title: string): { lead: string; rest: string | null } {
  const trimmed = title.trim();
  const space = trimmed.indexOf(' ');
  if (space <= 0) return { lead: trimmed, rest: null };
  return {
    lead: trimmed.slice(0, space),
    rest: trimmed.slice(space + 1),
  };
}

/**
 * Section heading rail: [Bold Lead muted rest] ——— Смотреть все ›
 */
export function SectionRail({
  title,
  titleRest,
  href,
  linkLabel = 'Смотреть все',
  className = '',
  as: Tag = 'h2',
}: Props) {
  const parts =
    titleRest !== undefined
      ? { lead: title.trim(), rest: titleRest.trim() || null }
      : splitTitle(title);

  return (
    <div className={`sf-section-rail ${className}`.trim()}>
      <Tag className="sf-section-rail__title">
        <span className="sf-section-rail__lead">{parts.lead}</span>
        {parts.rest ? (
          <>
            {' '}
            <span className="sf-section-rail__rest">{parts.rest}</span>
          </>
        ) : null}
      </Tag>
      <span className="sf-section-rail__line" aria-hidden />
      {href ? (
        <Link href={href} className="sf-section-rail__link">
          {linkLabel}
          <ChevronRight />
        </Link>
      ) : null}
    </div>
  );
}

function ChevronRight() {
  return (
    <svg
      viewBox="0 0 12 12"
      className="sf-section-rail__chevron"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden
    >
      <path d="M4 2.5 7.5 6 4 9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

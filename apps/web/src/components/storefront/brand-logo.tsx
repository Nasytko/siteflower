import Link from 'next/link';

type Props = {
  /** Smaller lockup for sticky header / dense chrome. */
  compact?: boolean;
  className?: string;
  /** Defaults to storefront home. */
  href?: string;
};

const MARK_SRC = '/buket-mark.png';
/** Intrinsic pixel size of `/buket-mark.png` (square). */
const MARK_INTRINSIC = 256;
const MARK_DISPLAY = 36;
const MARK_DISPLAY_COMPACT = 28;

/**
 * Brand lockup: flower mark image + HTML wordmark «BUKET №1» (Latin).
 * Wordmark uses the project display serif (Literata).
 */
export function BrandLogo({ compact = false, className, href = '/' }: Props) {
  const markPx = compact ? MARK_DISPLAY_COMPACT : MARK_DISPLAY;

  return (
    <Link
      href={href}
      className={['sf-brand-logo', compact ? 'sf-brand-logo--compact' : null, className]
        .filter(Boolean)
        .join(' ')}
      aria-label="BUKET №1 — на главную"
    >
      <img
        src={MARK_SRC}
        alt=""
        width={markPx}
        height={markPx}
        decoding="async"
        className="sf-brand-logo__mark"
        // Hint the intrinsic asset size for browsers that use it with width/height.
        style={{ aspectRatio: `${MARK_INTRINSIC} / ${MARK_INTRINSIC}` }}
      />
      <span className="sf-brand-logo__name">BUKET №1</span>
    </Link>
  );
}

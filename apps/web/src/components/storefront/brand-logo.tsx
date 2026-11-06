import Link from 'next/link';

type Props = {
  /** Smaller lockup for sticky header / dense chrome. */
  compact?: boolean;
  className?: string;
  /** Defaults to storefront home. */
  href?: string;
};

const MARK_SRC = '/brand/icon.png';
/** Intrinsic pixel size of the brand tile. */
const MARK_INTRINSIC = 512;
const MARK_DISPLAY = 34;
const MARK_DISPLAY_COMPACT = 28;

/**
 * Brand lockup: green flower tile + «BUKET №1» with a short line under the name.
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
        style={{ aspectRatio: `${MARK_INTRINSIC} / ${MARK_INTRINSIC}` }}
      />
      <span className="sf-brand-logo__text">
        <span className="sf-brand-logo__name">BUKET №1</span>
        {compact ? null : <span className="sf-brand-logo__tag">цветочный бутик</span>}
      </span>
    </Link>
  );
}

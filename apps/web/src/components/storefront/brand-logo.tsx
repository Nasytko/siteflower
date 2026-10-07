'use client';

type Props = {
  compact?: boolean;
  className?: string;
  alt?: string;
  /** Mobile-only compact mark without wordmark. */
  markOnly?: boolean;
};

/**
 * Brand lockup: SVG flower mark + text «BUKET №1».
 * Raster PNG remains available as /brand/logo.png for OG/admin fallbacks.
 */
export function BrandLogo({
  compact = false,
  className = '',
  alt = 'BUKET №1',
  markOnly = false,
}: Props) {
  return (
    <span
      className={`sf-brand-logo inline-flex items-center gap-2 text-brand ${
        compact ? 'sf-brand-logo--compact' : ''
      } ${className}`.trim()}
      aria-label={alt}
    >
      <img
        src="/brand/mark.svg"
        alt=""
        width={compact || markOnly ? 28 : 36}
        height={compact || markOnly ? 28 : 36}
        className="shrink-0"
        decoding="async"
      />
      {!markOnly ? (
        <span className="flex flex-col leading-none">
          <span
            className={`font-semibold tracking-[0.04em] text-ink ${
              compact ? 'text-[0.95rem]' : 'text-[1.05rem] md:text-[1.15rem]'
            }`}
            style={{ fontFamily: 'var(--font-display, Georgia, "Times New Roman", serif)' }}
          >
            BUKET №1
          </span>
          {!compact ? (
            <span className="mt-0.5 text-[0.58rem] font-medium uppercase tracking-[0.18em] text-muted">
              Цветы с душой
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

'use client';

type Props = {
  compact?: boolean;
  alt?: string;
};

/**
 * Brand lockup: SVG flower mark + text «BUKET №1».
 * Raster PNG remains available as /brand/logo.png for OG/admin fallbacks.
 */
export function BrandLogo({ compact = false, alt = 'BUKET №1' }: Props) {
  return (
    <span
      className={`sf-brand-logo inline-flex items-center gap-2 text-brand ${
        compact ? 'sf-brand-logo--compact' : ''
      }`.trim()}
      aria-label={alt}
    >
      <img
        src="/brand/mark.svg"
        alt=""
        width={compact ? 28 : 36}
        height={compact ? 28 : 36}
        className="shrink-0"
        decoding="async"
      />
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
    </span>
  );
}

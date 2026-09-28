import Image from 'next/image';

type Props = {
  /** Compact header / dense chrome */
  compact?: boolean;
  className?: string;
  /** Accessible name; defaults to BUKET №1 */
  alt?: string;
  priority?: boolean;
};

/**
 * Official lockup: tulip mark + «BUKET №1» on brand olive.
 */
export function BrandLogo({
  compact = false,
  className = '',
  alt = 'BUKET №1',
  priority = false,
}: Props) {
  return (
    <Image
      src="/brand/logo.png"
      alt={alt}
      width={125}
      height={78}
      priority={priority}
      className={`sf-brand-logo ${compact ? 'sf-brand-logo--compact' : ''} ${className}`.trim()}
    />
  );
}

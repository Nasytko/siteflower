type Props = {
  name?: string | null;
  swatch?: string | null;
  size?: 'sm' | 'md';
  className?: string;
};

/**
 * Text + optional real CSS swatch. Never invents a color when swatch is missing.
 */
export function AdminColorSwatch({ name, swatch, size = 'sm', className = '' }: Props) {
  if (!name?.trim()) return null;
  const dim = size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3';
  const hasSwatch = Boolean(swatch?.trim());
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span
        className={`${dim} shrink-0 rounded-full border border-[var(--admin-border)]`}
        style={hasSwatch ? { backgroundColor: swatch!.trim() } : undefined}
        title={hasSwatch ? name : `${name} (оттенок не задан)`}
        aria-hidden
      />
      <span>{name}</span>
    </span>
  );
}

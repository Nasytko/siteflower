type Props = {
  heightCm: number;
  /** `hover` — visible on parent `.group:hover`; `always` — PDP. */
  mode?: 'hover' | 'always';
  /** Side of the media frame. Cards use `right` so chips stay on the left. */
  side?: 'left' | 'right';
  className?: string;
};

/**
 * Soft vertical scale beside bouquet photos — only when height is set in admin.
 */
export function HeightRuler({
  heightCm,
  mode = 'always',
  side = 'right',
  className = '',
}: Props) {
  if (!Number.isFinite(heightCm) || heightCm <= 0) return null;

  const ticks = 5;
  const visibility =
    mode === 'hover'
      ? 'opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0'
      : 'opacity-100';

  const sideClass =
    side === 'right'
      ? 'right-2.5 sm:right-3 left-auto'
      : 'left-2.5 sm:left-3 right-auto';

  return (
    <div
      className={`pointer-events-none absolute bottom-3 top-3 z-[2] flex w-9 flex-col items-center justify-between sm:w-10 ${sideClass} ${visibility} transition duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-y-0 ${className}`}
      aria-label={`Высота букета около ${heightCm} см`}
    >
      <span className="sf-height-ruler__cap" aria-hidden />
      <div className="sf-height-ruler__track relative flex-1 w-px">
        {Array.from({ length: ticks }, (_, i) => (
          <span
            key={i}
            className="sf-height-ruler__tick"
            style={{ top: `${(i / (ticks - 1)) * 100}%` }}
            aria-hidden
          />
        ))}
      </div>
      <span className="sf-height-ruler__label mt-1.5">{heightCm}&nbsp;см</span>
      <span className="sf-height-ruler__cap mt-1" aria-hidden />
    </div>
  );
}

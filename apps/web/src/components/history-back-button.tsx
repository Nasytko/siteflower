'use client';

type Props = {
  fallbackHref?: string;
  className?: string;
  children: React.ReactNode;
};

/** Soft history back with a safe fallback when there is no prior history entry. */
export function HistoryBackButton({
  fallbackHref = '/',
  className,
  children,
}: Props) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
          window.history.back();
          return;
        }
        window.location.href = fallbackHref;
      }}
    >
      {children}
    </button>
  );
}

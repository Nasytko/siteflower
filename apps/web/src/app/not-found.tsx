import Link from 'next/link';

/**
 * Global unmatched-route 404 (outside storefront/admin segments).
 * Keep brand-aligned and CTA-focused.
 */
export default function RootNotFound() {
  return (
    <main
      id="main-content"
      className="sf-not-found relative flex min-h-[100dvh] flex-col justify-center overflow-hidden px-6 py-16"
    >
      <div className="sf-not-found__glow" aria-hidden />
      <div className="relative mx-auto w-full max-w-lg">
        <p className="sf-label">404</p>
        <h1 className="sf-display mt-3 text-balance">Кажется, этой страницы больше нет</h1>
        <p className="sf-body mt-4 max-w-md text-muted">
          Возможно, ссылка устарела или страница была перемещена.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/" className="sf-not-found__cta">
            На главную
          </Link>
          <Link href="/bukety" className="sf-not-found__secondary">
            В каталог
          </Link>
        </div>
      </div>
    </main>
  );
}

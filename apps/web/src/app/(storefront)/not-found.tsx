import Link from 'next/link';

export default function StorefrontNotFound() {
  return (
    <main id="main-content" className="sf-container flex min-h-[60vh] flex-col justify-center py-16">
      <p className="sf-label">404</p>
      <h1 className="sf-display mt-3 max-w-xl">Страница не найдена</h1>
      <p className="sf-body mt-4 max-w-md text-muted">
        Возможно, букет сняли с публикации или ссылка устарела. Загляните в каталог — там всё актуальное.
      </p>
      <div className="mt-8 flex flex-wrap gap-4">
        <Link
          href="/bukety"
          className="inline-flex rounded-[var(--radius-md)] bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground hover:opacity-90"
        >
          В каталог
        </Link>
        <Link href="/" className="inline-flex px-5 py-2.5 text-sm font-medium text-foreground hover:text-brand">
          На главную
        </Link>
      </div>
    </main>
  );
}

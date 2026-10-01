import Link from 'next/link';
import { HistoryBackButton } from '@/components/history-back-button';

export default function StorefrontNotFound() {
  return (
    <main
      id="main-content"
      className="sf-not-found relative flex min-h-[70vh] flex-col justify-center overflow-hidden py-16"
    >
      <div className="sf-not-found__glow" aria-hidden />
      <div className="sf-container relative">
        <p className="sf-label">404</p>
        <h1 className="sf-display mt-3 max-w-xl text-balance">
          Кажется, этой страницы больше нет
        </h1>
        <p className="sf-body mt-4 max-w-md text-muted">
          Возможно, ссылка устарела или страница была перемещена. Загляните в каталог — там всё
          актуальное.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/" className="sf-not-found__cta">
            На главную
          </Link>
          <HistoryBackButton fallbackHref="/" className="sf-not-found__secondary">
            Вернуться назад
          </HistoryBackButton>
          <Link href="/bukety" className="sf-not-found__secondary">
            В каталог
          </Link>
        </div>
      </div>
    </main>
  );
}

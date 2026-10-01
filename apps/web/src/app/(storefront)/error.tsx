'use client';

import Link from 'next/link';
import { useEffect } from 'react';

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function StorefrontError({ error, reset }: Props) {
  useEffect(() => {
    console.error('storefront_route_error', { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <main
      id="main-content"
      className="sf-container flex min-h-[60vh] flex-col justify-center py-16"
      role="alert"
    >
      <p className="sf-label">Ошибка</p>
      <h1 className="sf-display mt-3 max-w-xl">Не удалось открыть страницу</h1>
      <p className="sf-body mt-4 max-w-md text-muted">
        Что-то пошло не так на сервере. Попробуйте ещё раз или вернитесь на главную.
      </p>
      {error.digest ? (
        <p className="mt-2 text-xs text-muted">Код: {error.digest}</p>
      ) : null}
      <div className="mt-8 flex flex-wrap gap-3">
        <button type="button" onClick={() => reset()} className="sf-not-found__cta">
          Повторить
        </button>
        <Link href="/" className="sf-not-found__secondary">
          На главную
        </Link>
      </div>
    </main>
  );
}

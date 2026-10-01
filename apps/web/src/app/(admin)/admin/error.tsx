'use client';

import Link from 'next/link';
import { useEffect } from 'react';

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AdminError({ error, reset }: Props) {
  useEffect(() => {
    console.error('admin_route_error', { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <main
      id="main-content"
      className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center"
      role="alert"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--admin-brand)]">
        Ошибка
      </p>
      <h1 className="mt-3 text-2xl font-semibold text-[var(--admin-ink)]">
        Не удалось загрузить раздел
      </h1>
      <p className="mt-3 max-w-md text-sm text-[var(--admin-muted)]">
        Произошла внутренняя ошибка. Повторите попытку или вернитесь в панель.
      </p>
      {error.digest ? (
        <p className="mt-2 text-xs text-[var(--admin-muted)]">Код: {error.digest}</p>
      ) : null}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex rounded-lg bg-[var(--admin-brand)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
        >
          Повторить
        </button>
        <Link href="/admin" className="admin-btn-ghost">
          В панель
        </Link>
      </div>
    </main>
  );
}

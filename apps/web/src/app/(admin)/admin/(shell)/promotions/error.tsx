'use client';

import Link from 'next/link';
import { useEffect } from 'react';

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AdminPromotionsError({ error, reset }: Props) {
  useEffect(() => {
    console.error('admin_promotions_page_error', {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <main id="main-content" className="space-y-6">
      <header>
        <h1 className="admin-page-title">Акции</h1>
      </header>
      <div className="admin-panel space-y-3" role="alert">
        <p className="font-medium text-[var(--admin-ink)]">Не удалось загрузить акции</p>
        <p className="text-sm text-[var(--admin-muted)]">
          Попробуйте обновить страницу. Если ошибка повторяется, сообщите код запроса поддержке.
        </p>
        {error.digest ? (
          <p className="text-xs text-[var(--admin-muted)]">Код: {error.digest}</p>
        ) : null}
        <div className="flex flex-wrap gap-3 pt-2">
          <button type="button" className="admin-btn-ghost" onClick={() => reset()}>
            Повторить
          </button>
          <Link href="/admin/catalog/products" className="admin-btn-ghost">
            К товарам
          </Link>
        </div>
      </div>
    </main>
  );
}

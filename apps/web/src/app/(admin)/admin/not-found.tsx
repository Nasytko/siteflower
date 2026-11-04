import Link from 'next/link';
import { BrandLogo } from '@/components/storefront/brand-logo';

export default function AdminNotFound() {
  return (
    <main
      id="main-content"
      className="admin-not-found flex min-h-[70vh] flex-col items-center justify-center px-6 py-16 text-center"
    >
      <BrandLogo />
      <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--admin-brand)]">
        404
      </p>
      <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--admin-ink)]">
        Раздел не найден
      </h1>
      <p className="mt-3 max-w-md text-sm text-[var(--admin-muted)]">
        Такой страницы в панели нет. Возможно, ссылка устарела или у вас нет доступа к этому
        разделу.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/admin"
          className="inline-flex rounded-lg bg-[var(--admin-brand)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
        >
          Вернуться в панель
        </Link>
        <Link href="/admin/catalog/products" className="admin-btn-ghost">
          К товарам
        </Link>
      </div>
    </main>
  );
}

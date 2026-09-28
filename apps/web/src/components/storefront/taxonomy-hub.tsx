import Link from 'next/link';
import type { TaxonomyRefDto } from '@bouquet-one/contracts';
import { Breadcrumbs } from '@/components/storefront/breadcrumbs';

type Props = {
  title: string;
  description: string;
  /** Landing route prefix, e.g. `/cvety`. */
  pathPrefix: string;
  items: TaxonomyRefDto[];
  emptyMessage: string;
};

/**
 * Discovery hub listing every taxonomy of one kind. Links to the existing
 * landing pages — no per-item content is invented here.
 */
export function TaxonomyHub({ title, description, pathPrefix, items, emptyMessage }: Props) {
  return (
    <main id="main-content" className="sf-container-wide py-5 sm:py-7">
      <Breadcrumbs className="mb-3" items={[{ name: 'Главная', href: '/' }, { name: title }]} />

      <header className="mb-6">
        <h1 className="sf-h1">{title}</h1>
        <p className="sf-body mt-1.5 max-w-xl text-muted">{description}</p>
      </header>

      {items.length === 0 ? (
        <div className="sf-panel flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="sf-body text-muted">{emptyMessage}</p>
          <Link href="/bukety" className="sf-cta mt-1">
            Смотреть букеты
          </Link>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`${pathPrefix}/${item.slug}`}
                className="sf-tile flex min-h-[4.5rem] items-center justify-between gap-4 px-5 py-4"
              >
                <span className="text-base font-semibold">{item.name}</span>
                <span className="text-muted" aria-hidden>
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

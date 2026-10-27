import Link from 'next/link';
import type { Metadata } from 'next';
import {
  CATALOG_HUB_SLUG,
  catalogPublicHref,
} from '@bouquet-one/contracts';
import { Breadcrumbs } from '@/components/storefront/breadcrumbs';
import { listCatalogCategoryTree } from '@/lib/public-api';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { categoryNavHref } from '@/lib/storefront-nav';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    title: 'Каталог',
    description: 'Букеты и цветы поштучно с доставкой по Гродно.',
    path: '/catalog',
  });
}

const PRIMARY_HUBS = [
  {
    slug: CATALOG_HUB_SLUG.BOUQUETS,
    title: 'Букеты',
    lead: 'Собранные букеты и композиции',
  },
  {
    slug: CATALOG_HUB_SLUG.STEMS,
    title: 'Цветы поштучно',
    lead: 'Розы и другие цветы на выбор',
  },
] as const;

export default async function CatalogIndexPage() {
  const tree = await listCatalogCategoryTree().catch(() => []);
  const secondary = tree.filter(
    (node) =>
      node.visibility === 'VISIBLE' &&
      !PRIMARY_HUBS.some((hub) => hub.slug === node.slug) &&
      node.slug !== 'gifts',
  );

  return (
    <main id="main-content" className="sf-container-wide py-5 sm:py-7">
      <Breadcrumbs className="mb-3" items={[{ name: 'Главная', href: '/' }, { name: 'Каталог' }]} />
      <header className="mb-6">
        <h1 className="sf-h1">Каталог</h1>
        <p className="sf-body mt-1.5 max-w-xl text-muted">
          Выберите букеты или цветы поштучно. Дополнительные подборки — ниже.
        </p>
      </header>

      <nav className="grid gap-4 sm:grid-cols-2" aria-label="Основные разделы">
        {PRIMARY_HUBS.map((hub) => (
          <Link
            key={hub.slug}
            href={catalogPublicHref(hub.slug)}
            className="rounded-lg border border-border bg-background p-5 transition hover:border-foreground/30"
          >
            <span className="sf-h3 block">{hub.title}</span>
            <span className="sf-body mt-1 block text-muted">{hub.lead}</span>
          </Link>
        ))}
      </nav>

      {secondary.length > 0 ? (
        <section className="mt-10">
          <h2 className="sf-h3 mb-3">Подборки</h2>
          <ul className="flex flex-wrap gap-2">
            {secondary.map((node) => (
              <li key={node.id}>
                <Link href={categoryNavHref(node.slug)} className="sf-filter-pill text-sm">
                  {node.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

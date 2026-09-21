import type { Metadata } from 'next';
import { FavoritesView } from '@/components/storefront/favorites-view';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Избранное',
  description: 'Сохранённые букеты.',
  path: '/favorites',
  noIndex: true,
});

export default function FavoritesPage() {
  return (
    <main id="main-content" className="sf-container py-10 md:py-14">
      <header className="mb-10 max-w-2xl">
        <h1 className="sf-h1">Избранное</h1>
        <p className="sf-body mt-2 text-muted">Букеты, которые вы сохранили на этом устройстве.</p>
      </header>
      <FavoritesView />
    </main>
  );
}

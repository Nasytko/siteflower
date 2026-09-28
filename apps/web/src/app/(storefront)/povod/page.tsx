import type { Metadata } from 'next';
import { TaxonomyHub } from '@/components/storefront/taxonomy-hub';
import { listOccasions } from '@/lib/public-api';
import { buildPageMetadata } from '@/lib/seo/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    title: 'Повод',
    description: 'Букеты к дню рождения, годовщине, выпускному и другим поводам — доставка по Гродно.',
    path: '/povod',
  });
}

export default async function OccasionsHubPage() {
  const occasions = await listOccasions().catch(() => []);

  return (
    <TaxonomyHub
      title="Повод"
      description="Подберите букет под событие — мы уже собрали подходящие варианты."
      pathPrefix="/povod"
      items={occasions}
      emptyMessage="Подборки по поводам скоро появятся."
    />
  );
}

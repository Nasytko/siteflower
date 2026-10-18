import type { Metadata } from 'next';
import { TaxonomyHub } from '@/components/storefront/taxonomy-hub';
import { listFlowerTypes } from '@/lib/public-api';
import { buildPageMetadata } from '@/lib/seo/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    title: 'Цветы',
    description: 'Розы, пионы, эустома и другие цветы в букетах с доставкой по Гродно.',
    path: '/cvety',
  });
}

export default async function FlowersHubPage() {
  const flowerTypes = await listFlowerTypes().catch(() => []);

  return (
    <TaxonomyHub
      title="Цветы"
      description="Выберите цветок — покажем букеты, в составе которых он есть."
      pathPrefix="/cvety"
      items={flowerTypes.map((item) => ({
        id: item.id,
        slug: item.slug,
        name: item.name,
      }))}
      emptyMessage="Подборки по цветам скоро появятся."
    />
  );
}

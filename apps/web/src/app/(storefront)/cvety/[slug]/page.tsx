import type { Metadata } from 'next';
import {
  generateFlowerTypeMetadata,
  FlowerTypeLandingPage,
} from '@/components/storefront/flower-type-landing';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  return generateFlowerTypeMetadata(slug);
}

export default async function FlowerTypeTaxonomyPage({ params }: { params: Params }) {
  const { slug } = await params;
  return <FlowerTypeLandingPage slug={slug} />;
}

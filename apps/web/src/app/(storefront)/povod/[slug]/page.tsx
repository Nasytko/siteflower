import type { Metadata } from 'next';
import {
  generateTaxonomyMetadata,
  TaxonomyLandingPage,
} from '@/components/storefront/taxonomy-landing';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  return generateTaxonomyMetadata('occasion', slug);
}

export default async function OccasionTaxonomyPage({ params }: { params: Params }) {
  const { slug } = await params;
  return <TaxonomyLandingPage kind="occasion" slug={slug} />;
}

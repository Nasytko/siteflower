import type { Metadata } from 'next';
import {
  generateTaxonomyMetadata,
  TaxonomyLandingPage,
} from '@/components/storefront/taxonomy-landing';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  return generateTaxonomyMetadata('recipient', slug);
}

export default async function RecipientTaxonomyPage({ params }: { params: Params }) {
  const { slug } = await params;
  return <TaxonomyLandingPage kind="recipient" slug={slug} />;
}

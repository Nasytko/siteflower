import type { Metadata } from 'next';
import {
  generateTaxonomyMetadata,
  TaxonomyLandingPage,
} from '@/components/storefront/taxonomy-landing';

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { slug } = await params;
  const raw = await searchParams;
  return generateTaxonomyMetadata('occasion', slug, raw);
}

export default async function OccasionTaxonomyPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const raw = await searchParams;
  return <TaxonomyLandingPage kind="occasion" slug={slug} searchParams={raw} />;
}

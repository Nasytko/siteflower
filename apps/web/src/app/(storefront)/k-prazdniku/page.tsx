import type { Metadata } from 'next';
import { TaxonomyHub } from '@/components/storefront/taxonomy-hub';
import { listHolidays } from '@/lib/public-api';
import { buildPageMetadata } from '@/lib/seo/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    title: 'К празднику',
    description:
      'Букеты к 8 марта, Новому году, 14 февраля и другим праздникам — доставка по Гродно.',
    path: '/k-prazdniku',
  });
}

export default async function HolidaysHubPage() {
  const holidays = await listHolidays().catch(() => []);

  return (
    <TaxonomyHub
      title="К празднику"
      description="Подберите букет к календарному празднику — мы уже собрали подходящие варианты."
      pathPrefix="/k-prazdniku"
      items={holidays}
      emptyMessage="Подборки к праздникам скоро появятся."
    />
  );
}

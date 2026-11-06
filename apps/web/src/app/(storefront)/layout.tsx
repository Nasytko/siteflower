import type { ReactNode } from 'react';
import { FavoritesProvider } from '@/components/storefront/favorites-provider';
import { MobileCallChip } from '@/components/storefront/mobile-call-chip';
import { StorefrontFooter } from '@/components/storefront/footer';
import { StorefrontHeader } from '@/components/storefront/header';
import {
  listCatalogCategoryTree,
  listFlowerTypes,
  listOccasions,
  listRecipients,
} from '@/lib/public-api';
import { getFixedLegalSeller } from '@/lib/legal-content';
import { getFixedStorefrontSettings } from '@/lib/storefront-content';
import {
  buildSmartPrimaryNav,
  shortShopAddress,
  yandexMapsHref,
} from '@/lib/smart-nav';
import { HOMEPAGE_BRAND_ALTERNATE_NAMES } from '@bouquet-one/contracts';
import { buildOrganizationJsonLd, serializeJsonLd } from '@/lib/seo/json-ld';
import { getSiteUrl } from '@/lib/seo/site-url';

/** Avoid build-time API dependency / Next 16 `/_global-error` prerender flake when API is down. */
export const dynamic = 'force-dynamic';

export default async function StorefrontLayout({ children }: { children: ReactNode }) {
  const settings = getFixedStorefrontSettings();
  const seller = getFixedLegalSeller(settings);
  const [flowers, occasions, recipients, categoryTree] = await Promise.all([
    listFlowerTypes().catch(() => []),
    listOccasions().catch(() => []),
    listRecipients().catch(() => []),
    listCatalogCategoryTree().catch(() => []),
  ]);
  const navItems = buildSmartPrimaryNav({
    flowers,
    occasions,
    recipients,
    categoryTree,
  });

  const addressLabel = shortShopAddress(settings.address) ?? settings.city;
  const mapsHref = settings.address ? yandexMapsHref(settings.address) : null;

  const orgLd = buildOrganizationJsonLd({
    name: settings.brandName,
    alternateName: [...HOMEPAGE_BRAND_ALTERNATE_NAMES],
    url: getSiteUrl(),
    logoUrl: `${getSiteUrl()}/brand/logo.png`,
    phone: settings.phone,
    address: settings.address,
    city: settings.city,
    workingHours: settings.workingHours,
  });

  return (
    <FavoritesProvider>
      <div data-area="storefront" className="flex min-h-screen flex-col bg-background text-foreground">
        <StorefrontHeader
          brandName={settings.brandName}
          city={settings.city}
          addressLabel={addressLabel}
          mapsHref={mapsHref}
          phone={settings.phone}
          workingHours={settings.workingHours}
          navItems={navItems}
        />
        <div className="flex-1">{children}</div>
        <StorefrontFooter settings={settings} seller={seller} />
        {settings.phone ? <MobileCallChip phone={settings.phone} /> : null}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(orgLd) }}
        />
      </div>
    </FavoritesProvider>
  );
}

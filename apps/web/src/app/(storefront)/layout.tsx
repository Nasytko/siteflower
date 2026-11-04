import type { ReactNode } from 'react';
import { FavoritesProvider } from '@/components/storefront/favorites-provider';
import { StorefrontFooter } from '@/components/storefront/footer';
import { StorefrontHeader } from '@/components/storefront/header';
import { listFlowerTypes } from '@/lib/public-api';
import { getFixedLegalSeller } from '@/lib/legal-content';
import {
  enrichNavWithFlowerTypes,
  getFixedPrimaryNav,
  getFixedStorefrontSettings,
} from '@/lib/storefront-content';
import { buildOrganizationJsonLd, serializeJsonLd } from '@/lib/seo/json-ld';
import { getSiteUrl } from '@/lib/seo/site-url';

/** Avoid build-time API dependency / Next 16 `/_global-error` prerender flake when API is down. */
export const dynamic = 'force-dynamic';

export default async function StorefrontLayout({ children }: { children: ReactNode }) {
  const settings = getFixedStorefrontSettings();
  const seller = getFixedLegalSeller(settings);
  const flowers = await listFlowerTypes().catch(() => []);
  const navItems = enrichNavWithFlowerTypes(getFixedPrimaryNav(), flowers);

  const orgLd = buildOrganizationJsonLd({
    name: settings.brandName,
    url: getSiteUrl(),
    logoUrl: `${getSiteUrl()}/brand/logo.png`,
    phone: settings.phone,
    address: settings.address,
    city: settings.city,
  });

  return (
    <FavoritesProvider>
      <div data-area="storefront" className="flex min-h-screen flex-col bg-background text-foreground">
        <StorefrontHeader
          brandName={settings.brandName}
          city={settings.city}
          phone={settings.phone}
          workingHours={settings.workingHours}
          navItems={navItems}
        />
        <div className="flex-1">{children}</div>
        <StorefrontFooter settings={settings} seller={seller} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(orgLd) }}
        />
      </div>
    </FavoritesProvider>
  );
}

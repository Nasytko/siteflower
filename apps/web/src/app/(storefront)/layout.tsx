import type { ReactNode } from 'react';
import { defaultStorefrontSettings } from '@bouquet-one/contracts';
import { FavoritesProvider } from '@/components/storefront/favorites-provider';
import { StorefrontFooter } from '@/components/storefront/footer';
import { StorefrontHeader } from '@/components/storefront/header';
import { getStorefrontSettings } from '@/lib/public-api';
import { buildOrganizationJsonLd, serializeJsonLd } from '@/lib/seo/json-ld';
import { getSiteUrl } from '@/lib/seo/site-url';

/** Avoid build-time API dependency / Next 16 `/_global-error` prerender flake when API is down. */
export const dynamic = 'force-dynamic';

export default async function StorefrontLayout({ children }: { children: ReactNode }) {
  let settings;
  try {
    settings = await getStorefrontSettings();
  } catch {
    settings = defaultStorefrontSettings();
  }

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
        />
        <div className="flex-1">{children}</div>
        <StorefrontFooter settings={settings} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(orgLd) }}
        />
      </div>
    </FavoritesProvider>
  );
}

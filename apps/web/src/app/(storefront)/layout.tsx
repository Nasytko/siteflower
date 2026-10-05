import type { ReactNode } from 'react';
import { defaultStorefrontSettings } from '@bouquet-one/contracts';
import { FavoritesProvider } from '@/components/storefront/favorites-provider';
import { StorefrontFooter } from '@/components/storefront/footer';
import { StorefrontHeader } from '@/components/storefront/header';
import { PRIMARY_NAV, type PrimaryNavItem } from '@/components/storefront/primary-nav';
import {
  getLegalSeller,
  getMainNavigation,
  getStorefrontSettings,
} from '@/lib/public-api';
import { navItemsFromNavigationMenu } from '@/lib/storefront-nav';
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

  const seller = await getLegalSeller().catch(() => null);

  // NavigationMenu is source of truth. Empty successful response = empty nav
  // (do not resurrect PRIMARY_NAV after the manager cleared/disabled items).
  // PRIMARY_NAV only when the navigation API itself is unavailable (outage).
  let navItems: PrimaryNavItem[] = [];
  try {
    const menu = await getMainNavigation();
    navItems = navItemsFromNavigationMenu(menu.items);
  } catch {
    navItems = PRIMARY_NAV;
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

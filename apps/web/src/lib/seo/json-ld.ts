export type JsonLd = Record<string, unknown>;

export function buildJsonLd(data: JsonLd): JsonLd {
  return {
    '@context': 'https://schema.org',
    ...data,
  };
}

export function buildOrganizationJsonLd(input: {
  name: string;
  url: string;
  logoUrl?: string;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  alternateName?: string | string[] | null;
  workingHours?: string | null;
}): JsonLd {
  return buildJsonLd({
    '@type': 'Florist',
    name: input.name,
    ...(input.alternateName
      ? {
          alternateName: Array.isArray(input.alternateName)
            ? input.alternateName
            : [input.alternateName],
        }
      : {}),
    url: input.url,
    ...(input.logoUrl ? { logo: input.logoUrl } : {}),
    ...(input.phone ? { telephone: input.phone } : {}),
    ...(input.workingHours?.trim()
      ? { openingHours: input.workingHours.trim() }
      : {}),
    address: {
      '@type': 'PostalAddress',
      ...(input.address ? { streetAddress: input.address } : {}),
      addressLocality: input.city || 'Гродно',
      addressCountry: 'BY',
      postalCode: '230000',
    },
  });
}

export function buildWebSiteJsonLd(input: {
  name: string;
  alternateName: string[];
  url: string;
}): JsonLd {
  return buildJsonLd({
    '@type': 'WebSite',
    name: input.name,
    alternateName: input.alternateName,
    url: input.url,
    inLanguage: 'ru-BY',
    publisher: {
      '@type': 'Florist',
      name: input.name,
      alternateName: input.alternateName,
    },
  });
}

/** Serialize JSON-LD for safe embedding in a <script type="application/ld+json"> tag. */
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

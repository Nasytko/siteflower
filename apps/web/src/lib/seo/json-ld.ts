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
}): JsonLd {
  return buildJsonLd({
    '@type': 'Florist',
    name: input.name,
    url: input.url,
    ...(input.logoUrl ? { logo: input.logoUrl } : {}),
    ...(input.phone ? { telephone: input.phone } : {}),
    address: {
      '@type': 'PostalAddress',
      ...(input.address ? { streetAddress: input.address } : {}),
      addressLocality: input.city || 'Гродно',
      addressCountry: 'BY',
      postalCode: '230000',
    },
  });
}

/** Serialize JSON-LD for safe embedding in a <script type="application/ld+json"> tag. */
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

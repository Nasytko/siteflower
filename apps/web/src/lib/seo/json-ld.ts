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
}): JsonLd {
  return buildJsonLd({
    '@type': 'Florist',
    name: input.name,
    url: input.url,
    ...(input.logoUrl ? { logo: input.logoUrl } : {}),
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Гродно',
      addressCountry: 'BY',
    },
  });
}

/** Serialize JSON-LD for safe embedding in a <script type="application/ld+json"> tag. */
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

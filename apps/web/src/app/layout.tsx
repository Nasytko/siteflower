import { Manrope } from 'next/font/google';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { buildRootMetadata } from '@/lib/seo/metadata';
import { getSiteUrl } from '@/lib/seo/site-url';
import './globals.css';

/** Single typeface for body and headings — see --font-sans / --font-display. */
const sans = Manrope({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-body',
});

export const metadata: Metadata = buildRootMetadata();

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Keep in sync with --color-brand.
  themeColor: '#1e4636',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const siteUrl = getSiteUrl();

  return (
    <html lang="ru" className={sans.variable}>
      <body className="font-sans antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-4 focus:rounded-[var(--radius-sm)] focus:bg-surface focus:px-3 focus:py-2 focus:text-foreground"
        >
          Перейти к содержимому
        </a>
        <div data-site-url={siteUrl}>{children}</div>
      </body>
    </html>
  );
}

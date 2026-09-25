import { Cormorant_Garamond, Manrope } from 'next/font/google';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { buildRootMetadata } from '@/lib/seo/metadata';
import { getSiteUrl } from '@/lib/seo/site-url';
import './globals.css';

const sans = Manrope({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
});

const display = Cormorant_Garamond({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
});

export const metadata: Metadata = buildRootMetadata();

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#00473e',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const siteUrl = getSiteUrl();

  return (
    <html lang="ru" className={`${sans.variable} ${display.variable}`}>
      <body className="font-sans antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-4 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-foreground"
        >
          Перейти к содержимому
        </a>
        <div data-site-url={siteUrl}>{children}</div>
      </body>
    </html>
  );
}

import { Cormorant_Garamond, Source_Sans_3, Marck_Script } from 'next/font/google';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { buildRootMetadata } from '@/lib/seo/metadata';
import { getSiteUrl } from '@/lib/seo/site-url';
import './globals.css';

const display = Cormorant_Garamond({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
});

const body = Source_Sans_3({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  weight: ['400', '500', '600'],
  variable: '--font-body',
});

const script = Marck_Script({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  weight: '400',
  variable: '--font-script',
});

export const metadata: Metadata = buildRootMetadata();

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#6b7a68',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const siteUrl = getSiteUrl();

  return (
    <html lang="ru" className={`${display.variable} ${body.variable} ${script.variable}`}>
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

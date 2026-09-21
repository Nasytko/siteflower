import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Admin',
  description: 'БУКЕТ №1 administration',
  path: '/admin',
  noIndex: true,
});

export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return <div data-area="admin">{children}</div>;
}

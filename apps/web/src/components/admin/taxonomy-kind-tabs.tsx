'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TAXONOMY_KIND_META, TAXONOMY_KINDS } from '@/lib/admin-endpoints';

const EXTRA_TABS = [
  { href: '/admin/catalog/dictionaries', title: 'Обзор', match: (p: string) => p === '/admin/catalog/dictionaries' },
  {
    href: '/admin/catalog/flower-structure',
    title: 'Цветы',
    match: (p: string) => p === '/admin/catalog/flower-structure' || p.startsWith('/admin/catalog/flower-structure/'),
  },
  {
    href: '/admin/catalog/pages',
    title: 'Страницы каталога',
    match: (p: string) =>
      p === '/admin/catalog/pages' ||
      p.startsWith('/admin/catalog/pages/') ||
      p === '/admin/catalog/categories' ||
      p.startsWith('/admin/catalog/categories/'),
  },
] as const;

export function TaxonomyKindTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Справочники каталога" className="admin-tabs">
      <ul className="admin-tabs__list">
        {EXTRA_TABS.map((tab) => {
          const active = tab.match(pathname);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={`admin-tabs__link ${active ? 'admin-tabs__link--active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {tab.title}
              </Link>
            </li>
          );
        })}
        {TAXONOMY_KINDS.map((kind) => {
          const href = `/admin/catalog/${kind}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={kind}>
              <Link
                href={href}
                className={`admin-tabs__link ${active ? 'admin-tabs__link--active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {TAXONOMY_KIND_META[kind].title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

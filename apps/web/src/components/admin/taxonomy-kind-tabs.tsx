'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TAXONOMY_KIND_META, TAXONOMY_KINDS } from '@/lib/admin-endpoints';

export function TaxonomyKindTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Справочники каталога" className="admin-tabs">
      <ul className="admin-tabs__list">
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

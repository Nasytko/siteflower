'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AdminRole } from '@bouquet-one/contracts';
import {
  adminNavGroupsForRole,
  isAdminNavItemActive,
} from '@/components/admin/admin-shell-nav-data';

type Props = {
  role: AdminRole;
};

export function AdminShellNav({ role }: Props) {
  const pathname = usePathname();
  const groups = adminNavGroupsForRole(role);

  return (
    <nav aria-label="Разделы админки" className="admin-nav">
      {groups.map((group) => (
        <div key={group.id} className="admin-nav__group" data-tier={group.tier}>
          <p className="admin-nav__group-label">{group.label}</p>
          <ul className="admin-nav__list">
            {group.items.map((item) => {
              const active = isAdminNavItemActive(pathname, item);
              return (
                <li key={`${group.id}-${item.href}`}>
                  <Link
                    href={item.href}
                    className={`admin-nav__link ${active ? 'admin-nav__link--active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

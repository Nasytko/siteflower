import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { fetchAdminMe } from '@/lib/admin-api';
import { adminRoleLabel } from '@/lib/admin-labels';
import { AdminNavToggle, AdminShellCrumb, AdminShellNav } from '@/components/admin/admin-shell-nav';
import { LogoutButton } from '@/components/admin/logout-button';
import { BrandLogo } from '@/components/storefront/brand-logo';

export default async function AdminShellLayout({ children }: { children: ReactNode }) {
  const me = await fetchAdminMe();
  if (!me) {
    redirect('/admin/login');
  }

  return (
    <div className="admin-shell" data-nav="closed">
      <aside className="admin-aside">
        <div className="admin-aside__brand">
          <div className="admin-aside__brand-row">
            <BrandLogo compact className="admin-aside__brand-link" />
            <AdminNavToggle />
          </div>
          <Link href="/" className="admin-aside__storefront" target="_blank" rel="noreferrer">
            Посмотреть сайт
          </Link>
        </div>

        <div className="admin-aside__nav" id="admin-sidebar-nav">
          <AdminShellNav role={me.user.role} />
        </div>

        <div className="admin-aside__user">
          <p className="admin-aside__user-name">{me.user.displayName}</p>
          <p className="admin-aside__user-email">{me.user.email}</p>
          <p className="admin-aside__user-role">{adminRoleLabel(me.user.role)}</p>
          <div className="mt-3">
            <LogoutButton />
          </div>
        </div>
      </aside>

      <div className="admin-main">
        <div className="admin-main__inner">
          <AdminShellCrumb role={me.user.role} />
          {children}
        </div>
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { fetchAdminMe } from '@/lib/admin-api';
import { adminRoleLabel } from '@/lib/admin-labels';
import { AdminShellNav } from '@/components/admin/admin-shell-nav';
import { LogoutButton } from '@/components/admin/logout-button';

export default async function AdminShellLayout({ children }: { children: ReactNode }) {
  const me = await fetchAdminMe();
  if (!me) {
    redirect('/admin/login');
  }

  return (
    <div className="admin-shell">
      <aside className="admin-aside">
        <div className="admin-aside__brand">
          <Link href="/admin" className="admin-aside__brand-link">
            <span className="admin-aside__eyebrow">Панель магазина</span>
            <Image
              src="/brand/logo.png"
              alt="BUKET №1"
              width={125}
              height={78}
              className="mt-1 h-10 w-auto rounded-sm"
            />
          </Link>
          <Link href="/" className="admin-aside__storefront" target="_blank" rel="noreferrer">
            Открыть витрину ↗
          </Link>
        </div>

        <div className="admin-aside__nav">
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
        <div className="admin-main__inner">{children}</div>
      </div>
    </div>
  );
}

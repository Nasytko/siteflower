import { redirect } from 'next/navigation';
import { roleHasPermission, type Permission } from '@bouquet-one/contracts';
import { fetchAdminMe } from '@/lib/admin-api';

/** Enforce page-level READ permission; API remains authoritative. */
export async function requireAdminPermission(permission: Permission) {
  const me = await fetchAdminMe();
  if (!me || !roleHasPermission(me.user.role, permission)) {
    redirect('/admin');
  }
  return me;
}

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    await fetch('/api/v1/admin/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { origin: window.location.origin },
    });
    router.replace('/admin/login');
    router.refresh();
  }

  return (
    <button
      type="button"
      className="admin-btn-ghost w-full"
      disabled={pending}
      onClick={logout}
    >
      {pending ? 'Выход…' : 'Выйти'}
    </button>
  );
}

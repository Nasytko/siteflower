'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@bouquet-one/ui';

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
    <Button type="button" variant="outline" size="sm" disabled={pending} onClick={logout}>
      Выйти
    </Button>
  );
}

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Button } from '@bouquet-one/ui';

export default function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/admin/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          origin: window.location.origin,
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        setError('Неверный email или пароль.');
        setPending(false);
        return;
      }

      const next = searchParams.get('next');
      router.replace(next && next.startsWith('/admin') ? next : '/admin');
      router.refresh();
    } catch {
      setError('Неверный email или пароль.');
      setPending(false);
    }
  }

  return (
    <main className="admin-login">
      <div className="admin-login__card">
        <header className="mb-7">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--admin-muted,#5f6b67)]">
            Админ-панель
          </p>
          {/* Admin login brand mark — plain img is intentional */}
          <img
            src="/brand/logo.png"
            alt="BUKET №1"
            width={125}
            height={78}
            className="mt-3 h-14 w-auto rounded-sm"
          />
          <h1 className="sr-only">BUKET №1</h1>
          <p className="admin-login__lead mt-4">Войдите, чтобы управлять каталогом и заказами</p>
        </header>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium text-[var(--admin-ink,#1c2a27)]">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-stone-900 outline-none transition focus:border-[#00473e] focus:ring-2 focus:ring-[#00473e]/20"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-[var(--admin-ink,#1c2a27)]"
            >
              Пароль
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-stone-900 outline-none transition focus:border-[#00473e] focus:ring-2 focus:ring-[#00473e]/20"
            />
          </div>
          {error ? (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending} className="w-full !rounded-lg !bg-[var(--admin-brand,#00473e)]">
            {pending ? 'Вход…' : 'Войти'}
          </Button>
        </form>
      </div>
    </main>
  );
}

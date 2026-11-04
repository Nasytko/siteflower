'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useId, useState } from 'react';
import { BrandLogo } from '@/components/storefront/brand-logo';

export default function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailId = useId();
  const passwordId = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [shake, setShake] = useState(false);

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
        setShake(true);
        window.setTimeout(() => setShake(false), 480);
        setPending(false);
        return;
      }

      const next = searchParams.get('next');
      router.replace(next && next.startsWith('/admin') ? next : '/admin');
      router.refresh();
    } catch {
      setError('Неверный email или пароль.');
      setShake(true);
      window.setTimeout(() => setShake(false), 480);
      setPending(false);
    }
  }

  return (
    <main className="admin-login">
      <div className="admin-login__glow" aria-hidden />
      <div className="admin-login__mark" aria-hidden />

      <div className={`admin-login__panel${shake ? ' admin-login__panel--shake' : ''}`}>
        <header className="admin-login__header">
          <BrandLogo />
          <h1 className="admin-login__title">Вход в панель</h1>
          <p className="admin-login__lead">Каталог, заказы и настройки магазина</p>
        </header>

        <form className="admin-login__form" onSubmit={onSubmit} noValidate>
          <label className="admin-login__field" htmlFor={emailId}>
            <span>Email</span>
            <input
              id={emailId}
              name="email"
              type="email"
              autoComplete="username"
              inputMode="email"
              required
              value={email}
              disabled={pending}
              placeholder="you@buket.by"
              onChange={(event) => {
                setEmail(event.target.value);
                if (error) setError(null);
              }}
            />
          </label>

          <label className="admin-login__field" htmlFor={passwordId}>
            <span>Пароль</span>
            <span className="admin-login__password">
              <input
                id={passwordId}
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                disabled={pending}
                placeholder="••••••••"
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (error) setError(null);
                }}
              />
              <button
                type="button"
                className="admin-login__reveal"
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                disabled={pending}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? 'Скрыть' : 'Показать'}
              </button>
            </span>
          </label>

          {error ? (
            <p role="alert" className="admin-login__error">
              {error}
            </p>
          ) : null}

          <button type="submit" className="admin-login__submit" disabled={pending}>
            {pending ? (
              <>
                <span className="admin-login__spinner" aria-hidden />
                Входим…
              </>
            ) : (
              'Войти'
            )}
          </button>
        </form>

        <p className="admin-login__foot">
          <a href="/" className="admin-login__storefront">
            ← На витрину
          </a>
        </p>
      </div>
    </main>
  );
}

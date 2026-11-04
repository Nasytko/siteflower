import { Suspense } from 'react';
import AdminLoginForm from './login-form';

function LoginFallback() {
  return (
    <main className="admin-login">
      <div className="admin-login__glow" aria-hidden />
      <div className="admin-login__panel admin-login__panel--loading">
        <p className="admin-login__lead">Загрузка…</p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <AdminLoginForm />
    </Suspense>
  );
}

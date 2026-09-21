import { Suspense } from 'react';
import AdminLoginForm from './login-form';

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="p-8">Загрузка…</main>}>
      <AdminLoginForm />
    </Suspense>
  );
}

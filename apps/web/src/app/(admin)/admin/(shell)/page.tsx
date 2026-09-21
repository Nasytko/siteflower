import { fetchAdminMe } from '@/lib/admin-api';

export default async function AdminDashboardPage() {
  const me = await fetchAdminMe();

  return (
    <main id="main-content" className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-stone-900">Обзор</h1>
        <p className="text-stone-600">
          Административный контур, каталог и заказы активны.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-medium text-stone-500">Текущий пользователь</h2>
          <p className="mt-2 text-lg text-stone-900">{me?.user.displayName}</p>
          <p className="text-stone-600">{me?.user.email}</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-medium text-stone-500">Роль</h2>
          <p className="mt-2 text-lg text-stone-900">{me?.user.role}</p>
          <p className="text-stone-600">{me?.user.permissions.length} permissions</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-5 sm:col-span-2">
          <h2 className="text-sm font-medium text-stone-500">Статус системы</h2>
          <p className="mt-2 text-stone-900">API session auth · RBAC · audit · catalog CMS</p>
          <p className="text-sm text-stone-500">
            Нет выдуманных метрик продаж — только реальный operational status.
          </p>
        </div>
      </section>
    </main>
  );
}

import { roleHasPermission, type StorefrontSettingsAdminDto } from '@bouquet-one/contracts';
import { adminFetch } from '@/lib/admin-api';
import { fetchBudgetRanges } from '@/lib/admin-catalog-api';
import { adminEndpoints } from '@/lib/admin-endpoints';
import { requireAdminPermission } from '@/lib/admin-page-auth';
import { BudgetRangesEditor } from '@/components/admin/budget-ranges-editor';
import { StorefrontSettingsEditor } from '@/components/admin/storefront-settings-editor';

export default async function AdminStorefrontSettingsPage() {
  const me = await requireAdminPermission('SETTINGS_READ');
  const [settings, budgetRanges] = await Promise.all([
    adminFetch<StorefrontSettingsAdminDto>(adminEndpoints.storefrontSettings),
    fetchBudgetRanges(),
  ]);

  return (
    <main id="main-content" className="space-y-8">
      <header>
        <h1 className="admin-page-title">Настройки</h1>
        <p className="admin-page-lead">
          Контакты и тексты витрины. Ниже — диапазоны бюджета для фильтров каталога.
        </p>
      </header>

      <section className="admin-section">
        <h2 className="admin-section__title">Магазин</h2>
        <StorefrontSettingsEditor
          initial={settings}
          canUpdate={roleHasPermission(me.user.role, 'SETTINGS_UPDATE')}
        />
      </section>

      <section className="admin-section">
        <h2 className="admin-section__title">Диапазоны бюджета</h2>
        <p className="admin-section__lead">
          Чипы «до 100 BYN» и т.п. на главной и в каталоге. Не путать с ценой варианта товара.
        </p>
        <BudgetRangesEditor
          initial={budgetRanges}
          canUpdate={roleHasPermission(me.user.role, 'CATALOG_UPDATE')}
        />
      </section>
    </main>
  );
}

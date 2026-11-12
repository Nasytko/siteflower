/**
 * Regression: sidebar must expose catalog/work sections for SUPER_ADMIN.
 * Catches permission filters that accidentally empty the nav.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { adminNavGroupsForRole } from './admin-shell-nav-data';

const here = path.dirname(fileURLToPath(import.meta.url));

test('SUPER_ADMIN sees primary admin sections including catalog and orders', () => {
  const groups = adminNavGroupsForRole('SUPER_ADMIN');
  const labels = groups.flatMap((group) => group.items.map((item) => item.label));
  const hrefs = groups.flatMap((group) => group.items.map((item) => item.href));

  assert.ok(labels.includes('Главная'));
  assert.ok(labels.includes('Товары'));
  assert.ok(labels.includes('Справочники'));
  assert.ok(labels.includes('Акции'));
  assert.ok(labels.includes('Подборки'));
  assert.ok(labels.includes('Страницы каталога'));
  assert.ok(labels.includes('Заказы'));
  assert.ok(labels.includes('Плитки на главной'));
  assert.ok(labels.includes('Баннер на главной'));
  assert.ok(labels.includes('Instagram'));
  assert.ok(labels.includes('Пользователи'));
  assert.equal(labels.includes('Цветы'), false);
  assert.equal(labels.includes('Главная страница'), false);
  assert.equal(labels.includes('Меню сайта'), false);
  assert.equal(labels.includes('Настройки магазина'), false);
  assert.equal(labels.includes('Доставка и самовывоз'), false);
  assert.equal(labels.includes('Юридические'), false);

  assert.ok(hrefs.includes('/admin'));
  assert.ok(hrefs.includes('/admin/catalog/products'));
  assert.ok(hrefs.includes('/admin/catalog/dictionaries'));
  assert.ok(hrefs.includes('/admin/promotions'));
  assert.ok(hrefs.includes('/admin/bestsellers'));
  assert.ok(hrefs.includes('/admin/catalog/pages'));
  assert.ok(hrefs.includes('/admin/orders'));
  assert.ok(hrefs.includes('/admin/storefront/discovery'));
  assert.ok(hrefs.includes('/admin/storefront/instagram'));
  assert.equal(hrefs.some((href) => href.startsWith('/admin/legal')), false);
});

test('sidebar splits daily work, catalog, storefront, and service tools', () => {
  const groups = adminNavGroupsForRole('SUPER_ADMIN');
  const byId = Object.fromEntries(groups.map((group) => [group.id, group.items.map((item) => item.label)]));

  assert.deepEqual(byId.today, ['Главная', 'Заказы']);
  assert.ok(byId.catalog.includes('Товары'));
  assert.ok(byId.catalog.includes('Справочники'));
  assert.equal(byId.catalog.includes('Instagram'), false);
  assert.equal(byId.catalog.includes('Плитки на главной'), false);
  assert.ok(byId.storefront.includes('Страницы каталога'));
  assert.ok(byId.storefront.includes('Баннер на главной'));
  assert.ok(byId.storefront.includes('Плитки на главной'));
  assert.ok(byId.storefront.includes('Instagram'));
  assert.deepEqual(byId.access, ['Пользователи']);
  assert.ok(byId.system.includes('Журнал действий'));
  assert.equal(groups.find((group) => group.id === 'storefront')?.collapsed, true);
  assert.equal(groups.find((group) => group.id === 'system')?.collapsed, true);
  assert.equal(groups.find((group) => group.id === 'catalog')?.collapsed, undefined);
});

test('CONTENT_MANAGER keeps catalog links but not users admin', () => {
  const groups = adminNavGroupsForRole('CONTENT_MANAGER');
  const labels = groups.flatMap((group) => group.items.map((item) => item.label));
  assert.ok(labels.includes('Товары'));
  assert.equal(labels.includes('Пользователи'), false);
});

test('shell layout renders nav directly — no details/display:contents trap', () => {
  const layoutPath = path.join(
    here,
    '../../app/(admin)/admin/(shell)/layout.tsx',
  );
  const source = readFileSync(layoutPath, 'utf8');
  assert.match(source, /AdminShellNav/);
  assert.match(source, /className="admin-aside__nav"/);
  assert.doesNotMatch(source, /admin-aside__menu/);
  assert.doesNotMatch(source, /<details[\s\S]*AdminShellNav/);
});

test('globals.css does not hide sidebar nav behind closed details', () => {
  const cssPath = path.join(here, '../../app/globals.css');
  const source = readFileSync(cssPath, 'utf8');
  assert.doesNotMatch(source, /\.admin-aside__menu/);
});

test('product editor SEO section stays always visible (no disclosure)', () => {
  const editorPath = path.join(here, 'product-editor.tsx');
  const source = readFileSync(editorPath, 'utf8');
  assert.match(source, /data-section="seo"/);
  assert.match(source, /Адрес и SEO/);
  assert.doesNotMatch(source, /seoManualOpen/);
  assert.doesNotMatch(source, /admin-disclosure/);
});

test('product edit route mounts ProductEditor, not a legacy editor', () => {
  const pagePath = path.join(
    here,
    '../../app/(admin)/admin/(shell)/catalog/products/[id]/page.tsx',
  );
  const source = readFileSync(pagePath, 'utf8');
  assert.match(source, /from '@\/components\/admin\/product-editor'/);
  assert.match(source, /<ProductEditor[\s\S]*product=\{product\}/);
  assert.doesNotMatch(source, /ProductEditorLegacy|OldProductEditor|product-editor-v1/);
});

test('product list route mounts ProductsManager', () => {
  const pagePath = path.join(
    here,
    '../../app/(admin)/admin/(shell)/catalog/products/page.tsx',
  );
  const source = readFileSync(pagePath, 'utf8');
  assert.match(source, /from '@\/components\/admin\/products-manager'/);
  assert.match(source, /ProductsManager/);
});

test('products list UI: table rows, create dialog, delete modal, no bulk bar', () => {
  const managerPath = path.join(here, 'products-manager.tsx');
  const source = readFileSync(managerPath, 'utf8');
  assert.match(source, /Добавить товар/);
  assert.match(source, /Создать черновик/);
  assert.match(source, /sf-ap-menu/);
  assert.match(source, /sf-ap-table/);
  assert.match(source, /sf-ap-create/);
  assert.match(source, /ProductDeleteDialog/);
  assert.match(source, /SEARCH_DEBOUNCE_MS/);
  assert.doesNotMatch(source, /id="create-product"/);
  assert.doesNotMatch(source, /admin-bulkbar/);
  assert.doesNotMatch(source, /sf-ap-grid/);
});

test('product editor exposes redesigned sections used by the live card', () => {
  const editorPath = path.join(here, 'product-editor.tsx');
  const source = readFileSync(editorPath, 'utf8');
  assert.match(source, /sf-pe-hero/);
  assert.match(source, /sf-pe-stack/);
  assert.match(source, /sf-pe-bar/);
  assert.match(source, /sf-pe-danger/);
  assert.match(source, /ProductDeleteDialog/);
  assert.match(source, /ProductEditorMainTab/);
  assert.match(source, /ProductEditorCompositionTab/);
  assert.match(source, /data-section="photo"/);
  assert.match(source, /blocks=\{\['audience'\]\}/);
  assert.doesNotMatch(source, /ProductPlacementPanel/);
  assert.doesNotMatch(source, /admin-disclosure/);
  assert.equal(source.includes('groupIds'), false);
});

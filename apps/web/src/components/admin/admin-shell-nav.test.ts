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
  assert.ok(labels.includes('Цветы'));
  assert.ok(labels.includes('Акции'));
  assert.ok(labels.includes('Подборки'));
  assert.ok(labels.includes('Страницы каталога'));
  assert.ok(labels.includes('Заказы'));
  assert.ok(labels.includes('Пользователи'));

  assert.ok(hrefs.includes('/admin'));
  assert.ok(hrefs.includes('/admin/catalog/products'));
  assert.ok(hrefs.includes('/admin/catalog/flower-structure'));
  assert.ok(hrefs.includes('/admin/promotions'));
  assert.ok(hrefs.includes('/admin/bestsellers'));
  assert.ok(hrefs.includes('/admin/catalog/pages'));
  assert.ok(hrefs.includes('/admin/orders'));
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

test('SEO disclosure stays toggleable when open is controlled', () => {
  const editorPath = path.join(here, 'product-editor.tsx');
  const source = readFileSync(editorPath, 'utf8');
  assert.match(source, /data-section="seo"/);
  assert.match(source, /open=\{seoManualOpen\}/);
  assert.match(source, /onToggle=\{/);
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

test('products list UI stays compact: one create CTA, row menu, no composition column', () => {
  const managerPath = path.join(here, 'products-manager.tsx');
  const source = readFileSync(managerPath, 'utf8');
  assert.match(source, /Добавить товар/);
  assert.match(source, /admin-products-menu/);
  assert.match(source, /admin-products-cards/);
  assert.match(source, /SEARCH_DEBOUNCE_MS/);
  assert.doesNotMatch(source, /id="create-product"/);
  assert.doesNotMatch(source, />Состав</);
  assert.doesNotMatch(source, /admin-bulkbar/);
});

test('product editor exposes redesigned sections used by the live card', () => {
  const editorPath = path.join(here, 'product-editor.tsx');
  const source = readFileSync(editorPath, 'utf8');
  assert.match(source, /admin-split--product/);
  assert.match(source, /ProductEditorMainTab/);
  assert.match(source, /ProductEditorCompositionTab/);
  assert.match(source, /data-section="photo"/);
  assert.match(source, /Описание, повод и получатель/);
  assert.match(source, /Участвует в акции/);
  assert.equal(source.includes('groupIds'), false);
});

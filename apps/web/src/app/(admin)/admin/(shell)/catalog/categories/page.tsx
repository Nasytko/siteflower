import { redirect } from 'next/navigation';

/** Legacy «Категории» → unified «Страницы каталога». */
export default function AdminCatalogCategoriesRedirectPage() {
  redirect('/admin/catalog/pages');
}

import { redirect } from 'next/navigation';

/** Legacy «SEO-подборки» → unified «Страницы каталога». */
export default function AdminSeoLandingsRedirectPage() {
  redirect('/admin/catalog/pages');
}

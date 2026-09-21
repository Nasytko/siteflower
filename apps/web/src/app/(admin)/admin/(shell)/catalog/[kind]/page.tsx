import { roleHasPermission, type TaxonomyAdminDto } from '@bouquet-one/contracts';
import { adminFetch, fetchAdminMe } from '@/lib/admin-api';
import { TaxonomyManager } from '@/components/admin/taxonomy-manager';

const META: Record<string, string> = {
  categories: 'Категории',
  flowers: 'Цветы',
  occasions: 'Поводы',
  recipients: 'Кому',
  styles: 'Стили',
  colors: 'Цвета',
};

type Props = { params: Promise<{ kind: string }> };

export default async function TaxonomyPage({ params }: Props) {
  const { kind } = await params;
  const title = META[kind];
  if (!title) {
    return <p>Неизвестный раздел</p>;
  }
  const me = await fetchAdminMe();
  const initial = await adminFetch<TaxonomyAdminDto[]>(`/api/v1/admin/catalog/${kind}`);

  return (
    <TaxonomyManager
      kind={kind}
      title={title}
      initial={initial}
      canCreate={Boolean(me && roleHasPermission(me.user.role, 'CATALOG_CREATE'))}
      canUpdate={Boolean(me && roleHasPermission(me.user.role, 'CATALOG_UPDATE'))}
    />
  );
}

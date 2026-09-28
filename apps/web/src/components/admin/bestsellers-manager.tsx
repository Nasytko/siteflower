'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type {
  BestsellerGroupAdminDto,
  PaginatedResponse,
  ProductListItemDto,
} from '@bouquet-one/contracts';
import { Button } from '@bouquet-one/ui';
import { adminGet, adminPatch, adminPost, adminPut, errorMessage } from '@/lib/admin-client';
import { adminEndpoints, withQuery } from '@/lib/admin-endpoints';
import { unwrapAdminList } from '@/lib/admin-list';
import { lifecycleLabel } from '@/lib/admin-labels';
import { toSameOriginMediaUrl } from '@/lib/media';

type Props = {
  initial: BestsellerGroupAdminDto[];
  canCreate: boolean;
  canUpdate: boolean;
};

type GroupProduct = BestsellerGroupAdminDto['products'][number];

function sortProducts(products: GroupProduct[]): GroupProduct[] {
  return [...products].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function BestsellersManager({ initial, canCreate, canUpdate }: Props) {
  const router = useRouter();
  const [groups, setGroups] = useState<BestsellerGroupAdminDto[]>(() =>
    [...initial].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ru')),
  );
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<ProductListItemDto[] | null>(null);

  const selected = useMemo(
    () => groups.find((group) => group.id === selectedId) ?? null,
    [groups, selectedId],
  );
  const products = selected ? sortProducts(selected.products) : [];

  function applyGroup(updated: BestsellerGroupAdminDto) {
    setGroups((prev) => prev.map((group) => (group.id === updated.id ? updated : group)));
  }

  async function reloadGroups() {
    const payload = await adminGet<PaginatedResponse<BestsellerGroupAdminDto> | BestsellerGroupAdminDto[]>(
      adminEndpoints.bestsellerGroups,
    );
    const list = unwrapAdminList(payload).sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ru'),
    );
    setGroups(list);
    if (!list.some((group) => group.id === selectedId)) {
      setSelectedId(list[0]?.id ?? null);
    }
  }

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function onCreateGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    if (name.length === 0) return;
    await run(async () => {
      const created = await adminPost<BestsellerGroupAdminDto>(adminEndpoints.bestsellerGroups, {
        name,
        sortOrder: (groups.at(-1)?.sortOrder ?? 0) + 10,
        active: true,
      });
      form.reset();
      await reloadGroups();
      if (created?.id) setSelectedId(created.id);
    });
  }

  async function toggleActive(group: BestsellerGroupAdminDto) {
    if (!canUpdate) return;
    await run(async () => {
      const updated = await adminPatch<BestsellerGroupAdminDto>(
        adminEndpoints.bestsellerGroup(group.id),
        { expectedVersion: group.version, active: !group.active },
      );
      applyGroup(updated);
    });
  }

  async function renameGroup(group: BestsellerGroupAdminDto, name: string) {
    if (!canUpdate || name.trim().length === 0 || name.trim() === group.name) return;
    await run(async () => {
      const updated = await adminPatch<BestsellerGroupAdminDto>(
        adminEndpoints.bestsellerGroup(group.id),
        { expectedVersion: group.version, name: name.trim() },
      );
      applyGroup(updated);
    });
  }

  async function saveProducts(group: BestsellerGroupAdminDto, next: GroupProduct[]) {
    await run(async () => {
      const updated = await adminPut<BestsellerGroupAdminDto>(
        adminEndpoints.bestsellerGroupProducts(group.id),
        {
          expectedVersion: group.version,
          products: next.map((item, index) => ({
            productId: item.productId,
            sortOrder: (index + 1) * 10,
          })),
        },
      );
      applyGroup(updated);
    });
  }

  async function move(index: number, direction: -1 | 1) {
    if (!canUpdate || !selected) return;
    const target = index + direction;
    if (target < 0 || target >= products.length) return;
    const next = [...products];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    await saveProducts(selected, next);
  }

  async function remove(productId: string) {
    if (!canUpdate || !selected) return;
    await saveProducts(
      selected,
      products.filter((item) => item.productId !== productId),
    );
  }

  async function add(product: ProductListItemDto) {
    if (!canUpdate || !selected) return;
    if (products.some((item) => item.productId === product.id)) return;
    await saveProducts(selected, [
      ...products,
      { productId: product.id, sortOrder: products.length + 1, product },
    ]);
  }

  async function findProducts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const payload = await adminGet<PaginatedResponse<ProductListItemDto>>(
        withQuery(adminEndpoints.products, {
          q: search.trim(),
          lifecycle: 'PUBLISHED',
          page: 1,
          pageSize: 10,
        }),
      );
      setCandidates(unwrapAdminList(payload));
    } catch (err) {
      setError(errorMessage(err, 'Не удалось найти товары'));
    }
  }

  return (
    <div className="space-y-5">
      {error ? (
        <p role="alert" className="admin-error">
          {error}
        </p>
      ) : null}

      <div className="admin-split">
        <div className="admin-panel space-y-4 p-4">
          <h2 className="admin-section__title">Подборки</h2>
          {groups.length === 0 ? (
            <p className="admin-empty">Подборок пока нет</p>
          ) : (
            <ul className="space-y-1">
              {groups.map((group) => (
                <li key={group.id}>
                  <button
                    type="button"
                    className={`admin-nav__link w-full text-left ${
                      group.id === selectedId ? 'admin-nav__link--active' : ''
                    }`}
                    onClick={() => setSelectedId(group.id)}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span>
                        {group.name}
                        {group.slug === 'podarki' ? (
                          <span className="ml-2 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--admin-brand)]">
                            главная
                          </span>
                        ) : null}
                      </span>
                      <span className="text-xs opacity-80">
                        {group.products.length}
                        {group.active ? '' : ' · скрыта'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {canCreate ? (
            <form onSubmit={onCreateGroup} className="space-y-2 border-t border-[var(--admin-border)] pt-4">
              <label className="admin-field">
                <span>Новая подборка</span>
                <input
                  name="name"
                  required
                  className="admin-input"
                  placeholder="Например, Хиты недели"
                />
              </label>
              <Button
                type="submit"
                disabled={pending}
                className="!rounded-lg !bg-[var(--admin-brand)]"
              >
                Создать
              </Button>
            </form>
          ) : null}
        </div>

        <div className="space-y-5">
          {!selected ? (
            <div className="admin-panel">
              <p className="admin-empty">Выберите подборку слева</p>
            </div>
          ) : (
            <>
              <div className="admin-panel space-y-3 p-4">
                <label className="admin-field">
                  <span>Название подборки</span>
                  <input
                    className="admin-input w-72"
                    defaultValue={selected.name}
                    disabled={!canUpdate}
                    key={`${selected.id}-${selected.version}`}
                    onBlur={(event) => void renameGroup(selected, event.target.value)}
                  />
                </label>
                <div className="admin-row-actions">
                  <span className={`admin-chip ${selected.active ? '' : 'admin-chip--muted'}`}>
                    {selected.active ? 'Показана на витрине' : 'Скрыта'}
                  </span>
                  {selected.slug === 'podarki' ? (
                    <span className="admin-chip">
                      Питает блок «Подарки» на главной
                    </span>
                  ) : null}
                  {canUpdate ? (
                    <button
                      type="button"
                      className="admin-btn-ghost"
                      disabled={pending}
                      onClick={() => void toggleActive(selected)}
                    >
                      {selected.active ? 'Скрыть' : 'Показать'}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="admin-panel overflow-x-auto">
                <table className="admin-table min-w-[640px]">
                  <thead>
                    <tr>
                      <th className="w-16">№</th>
                      <th className="w-16">Фото</th>
                      <th>Товар</th>
                      <th className="w-32">Цена</th>
                      <th className="w-44">Порядок</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.length === 0 ? (
                      <tr>
                        <td colSpan={5}>
                          <p className="admin-empty">В подборке пока нет товаров</p>
                        </td>
                      </tr>
                    ) : (
                      products.map((item, index) => (
                        <tr key={item.productId}>
                          <td className="tabular-nums text-[var(--admin-muted)]">{index + 1}</td>
                          <td>
                            {item.product?.primaryImageUrl ? (
                              <img
                                src={
                                  toSameOriginMediaUrl(item.product.primaryImageUrl) ??
                                  item.product.primaryImageUrl
                                }
                                alt=""
                                className="h-10 w-10 rounded-lg object-cover"
                              />
                            ) : (
                              <div className="admin-thumb-empty" />
                            )}
                          </td>
                          <td>
                            {item.product ? (
                              <>
                                <Link
                                  href={`/admin/catalog/products/${item.productId}`}
                                  className="font-semibold text-[var(--admin-ink)] underline-offset-2 hover:text-[var(--admin-brand)] hover:underline"
                                >
                                  {item.product.name}
                                </Link>
                                <p className="text-xs text-[var(--admin-muted)]">
                                  {lifecycleLabel(item.product.lifecycle)}
                                </p>
                              </>
                            ) : (
                              <span className="text-[var(--admin-muted)]">Товар недоступен</span>
                            )}
                          </td>
                          <td className="tabular-nums">{item.product?.price?.label ?? '—'}</td>
                          <td>
                            <div className="admin-row-actions">
                              <button
                                type="button"
                                className="admin-icon-btn"
                                aria-label="Выше"
                                disabled={!canUpdate || pending || index === 0}
                                onClick={() => void move(index, -1)}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className="admin-icon-btn"
                                aria-label="Ниже"
                                disabled={!canUpdate || pending || index === products.length - 1}
                                onClick={() => void move(index, 1)}
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                className="admin-btn-ghost"
                                disabled={!canUpdate || pending}
                                onClick={() => void remove(item.productId)}
                              >
                                Убрать
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {canUpdate ? (
                <div className="admin-panel space-y-3 p-4">
                  <h3 className="admin-subsection__title">Добавить товар</h3>
                  <form onSubmit={findProducts} className="flex flex-wrap items-end gap-2">
                    <label className="admin-field">
                      <span>Поиск по названию</span>
                      <input
                        className="admin-input w-64"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Амели"
                      />
                    </label>
                    <button type="submit" className="admin-btn-ghost">
                      Найти
                    </button>
                  </form>

                  {candidates === null ? null : candidates.length === 0 ? (
                    <p className="admin-empty">Опубликованных товаров не найдено</p>
                  ) : (
                    <ul className="admin-list">
                      {candidates.map((candidate) => {
                        const already = products.some((item) => item.productId === candidate.id);
                        return (
                          <li key={candidate.id} className="admin-list__item">
                            <div>
                              <p className="font-semibold text-[var(--admin-ink)]">
                                {candidate.name}
                              </p>
                              <p className="text-xs text-[var(--admin-muted)]">
                                {candidate.price?.label ?? '—'}
                              </p>
                            </div>
                            <button
                              type="button"
                              className="admin-btn-ghost"
                              disabled={pending || already}
                              onClick={() => void add(candidate)}
                            >
                              {already ? 'Уже в подборке' : 'Добавить'}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      <p className="admin-help">
        Подборки бестселлеров выводятся на главной. Порядок товаров задаёте вы — это не автоматика.
      </p>
    </div>
  );
}

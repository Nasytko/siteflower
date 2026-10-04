'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  FlowerItemAdminDto,
  FlowerOriginAdminDto,
  FlowerTypeAdminDto,
  FlowerVarietyAdminDto,
} from '@bouquet-one/contracts';
import {
  adminDelete,
  adminGet,
  adminPatch,
  adminPost,
  AdminRequestError,
  errorMessage,
} from '@/lib/admin-client';
import { adminEndpoints } from '@/lib/admin-endpoints';
import { FormSaveStatus, phaseFromAdminError, type FormSavePhase } from '@/components/admin/form-status';

type Props = {
  initialTypes: FlowerTypeAdminDto[];
  initialVarieties: FlowerVarietyAdminDto[];
  initialOrigins: FlowerOriginAdminDto[];
  initialItems: FlowerItemAdminDto[];
  canCreate: boolean;
  canUpdate: boolean;
};

function countLabel(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${n} товаров`;
  if (mod10 === 1) return `${n} товар`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} товара`;
  return `${n} товаров`;
}

export function FlowerStructureManager({
  initialTypes,
  initialVarieties,
  initialOrigins,
  initialItems,
  canCreate,
  canUpdate,
}: Props) {
  const router = useRouter();
  const [types, setTypes] = useState(initialTypes);
  const [varieties, setVarieties] = useState(initialVarieties);
  const [origins, setOrigins] = useState(initialOrigins);
  const [items, setItems] = useState(initialItems);
  const [search, setSearch] = useState('');
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [phase, setPhase] = useState<FormSavePhase>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const q = search.trim().toLowerCase();

  const tree = useMemo(() => {
    return types
      .map((type) => {
        const typeVarieties = varieties
          .filter((v) => v.flowerTypeId === type.id)
          .map((variety) => ({
            variety,
            items: items.filter((item) => item.flowerVarietyId === variety.id),
          }));
        const orphanItems = items.filter(
          (item) => item.flowerTypeId === type.id && !item.flowerVarietyId,
        );
        return { type, typeVarieties, orphanItems };
      })
      .filter((node) => {
        if (!q) return true;
        if (node.type.name.toLowerCase().includes(q)) return true;
        if (node.orphanItems.some((item) => item.name.toLowerCase().includes(q))) return true;
        return node.typeVarieties.some(
          (row) =>
            row.variety.name.toLowerCase().includes(q) ||
            row.items.some((item) => item.name.toLowerCase().includes(q)),
        );
      });
  }, [types, varieties, items, q]);

  async function reload() {
    const [nextTypes, nextVarieties, nextOrigins, nextItems] = await Promise.all([
      adminGet<FlowerTypeAdminDto[]>(adminEndpoints.flowerTypes),
      adminGet<FlowerVarietyAdminDto[]>(adminEndpoints.flowerVarieties),
      adminGet<FlowerOriginAdminDto[]>(adminEndpoints.flowerOrigins),
      adminGet<FlowerItemAdminDto[]>(`${adminEndpoints.flowerItems}?includeHidden=1`),
    ]);
    setTypes(nextTypes);
    setVarieties(nextVarieties);
    setOrigins(nextOrigins);
    setItems(nextItems);
  }

  async function run(action: () => Promise<void>, successMessage: string) {
    setPending(true);
    setError(null);
    setRequestId(null);
    setNotice(null);
    setPhase('saving');
    try {
      await action();
      await reload();
      setNotice(successMessage);
      setPhase('saved');
      router.refresh();
    } catch (err) {
      setPhase(err instanceof AdminRequestError ? phaseFromAdminError(err) : 'server');
      setRequestId(err instanceof AdminRequestError ? err.requestId ?? null : null);
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  function toggleType(id: string) {
    setCollapsedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-8">
      <FormSaveStatus
        phase={phase}
        savedLabel={notice}
        errorMessage={error}
        requestId={requestId}
        onRefresh={() => void reload()}
        onDismiss={() => {
          setError(null);
          setPhase(notice ? 'saved' : 'idle');
        }}
      />

      <label className="admin-field max-w-sm">
        <span>Поиск</span>
        <input
          className="admin-input"
          value={search}
          placeholder="Вид, сорт или позиция"
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>

      <section className="space-y-3">
        <h2 className="admin-section__title">Справочник цветов</h2>
        <p className="admin-section__lead">
          Вид → сорт → конкретная позиция (происхождение и высота). Количество задаётся в составе
          товара.
        </p>

        {canCreate ? (
          <div className="admin-toolbar flex flex-wrap gap-4">
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                const form = event.currentTarget;
                const name = String(new FormData(form).get('name') ?? '').trim();
                if (!name) return;
                void run(async () => {
                  await adminPost(adminEndpoints.flowerTypes, {
                    name,
                    sortOrder: (types.at(-1)?.sortOrder ?? 0) + 10,
                  });
                  form.reset();
                }, `Вид «${name}» добавлен`);
              }}
            >
              <label className="admin-field">
                <span>Новый вид</span>
                <input name="name" required className="admin-input w-40" placeholder="Роза" />
              </label>
              <button type="submit" className="admin-btn" disabled={pending}>
                Добавить вид
              </button>
            </form>

            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = new FormData(form);
                const flowerTypeId = String(data.get('flowerTypeId') ?? '');
                const name = String(data.get('name') ?? '').trim();
                if (!flowerTypeId || !name) return;
                void run(async () => {
                  await adminPost(adminEndpoints.flowerVarieties, {
                    flowerTypeId,
                    name,
                    sortOrder: (varieties.at(-1)?.sortOrder ?? 0) + 10,
                  });
                  form.reset();
                }, `Сорт «${name}» добавлен`);
              }}
            >
              <label className="admin-field">
                <span>Сорт для вида</span>
                <select name="flowerTypeId" required className="admin-select w-40" defaultValue="">
                  <option value="" disabled>
                    Вид
                  </option>
                  {types.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </label>
              <input name="name" required className="admin-input w-40" placeholder="Мондиаль" />
              <button type="submit" className="admin-btn" disabled={pending || types.length === 0}>
                Добавить сорт
              </button>
            </form>

            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = new FormData(form);
                const flowerTypeId = String(data.get('flowerTypeId') ?? '');
                const flowerVarietyId = String(data.get('flowerVarietyId') ?? '') || null;
                const flowerOriginId = String(data.get('flowerOriginId') ?? '') || null;
                const heightRaw = String(data.get('heightCm') ?? '').trim();
                const heightCm = heightRaw ? Number(heightRaw) : null;
                if (!flowerTypeId) return;
                void run(async () => {
                  await adminPost(adminEndpoints.flowerItems, {
                    flowerTypeId,
                    flowerVarietyId,
                    flowerOriginId,
                    heightCm,
                    sortOrder: (items.at(-1)?.sortOrder ?? 0) + 10,
                  });
                  form.reset();
                }, 'Позиция добавлена');
              }}
            >
              <label className="admin-field">
                <span>Новая позиция</span>
                <select name="flowerTypeId" required className="admin-select w-36" defaultValue="">
                  <option value="" disabled>
                    Вид
                  </option>
                  {types.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </label>
              <select name="flowerVarietyId" className="admin-select w-36" defaultValue="">
                <option value="">Без сорта</option>
                {varieties.map((variety) => (
                  <option key={variety.id} value={variety.id}>
                    {variety.name}
                  </option>
                ))}
              </select>
              <select name="flowerOriginId" className="admin-select w-36" defaultValue="">
                <option value="">Без происхождения</option>
                {origins.map((origin) => (
                  <option key={origin.id} value={origin.id}>
                    {origin.name}
                  </option>
                ))}
              </select>
              <input
                name="heightCm"
                type="number"
                min={1}
                max={300}
                className="admin-input w-24"
                placeholder="см"
              />
              <button type="submit" className="admin-btn" disabled={pending || types.length === 0}>
                Добавить позицию
              </button>
            </form>
          </div>
        ) : null}

        <div className="admin-panel space-y-2 p-3">
          {tree.length === 0 ? (
            <p className="admin-empty">Справочник пуст</p>
          ) : (
            tree.map(({ type, typeVarieties, orphanItems }) => {
              const collapsed = collapsedTypes.has(type.id);
              return (
                <div key={type.id} className="border-b border-[var(--admin-border)] pb-3 last:border-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="admin-btn-ghost px-1 py-0"
                      onClick={() => toggleType(type.id)}
                    >
                      {collapsed ? '▸' : '▾'}
                    </button>
                    <span className="font-semibold">{type.name}</span>
                    <span className="text-xs text-[var(--admin-muted)]">
                      {type.varietiesCount ?? typeVarieties.length} сортов ·{' '}
                      {type.itemsCount ?? items.filter((i) => i.flowerTypeId === type.id).length}{' '}
                      позиций · {countLabel(type.productsCount)}
                    </span>
                    {type.visibility === 'HIDDEN' ? (
                      <span className="admin-chip">Скрыт</span>
                    ) : null}
                    {canUpdate ? (
                      <button
                        type="button"
                        className="admin-btn-ghost text-xs"
                        onClick={() =>
                          void run(async () => {
                            await adminPatch(adminEndpoints.flowerType(type.id), {
                              expectedVersion: type.version,
                              visibility: type.visibility === 'VISIBLE' ? 'HIDDEN' : 'VISIBLE',
                            });
                          }, type.visibility === 'VISIBLE' ? 'Вид скрыт' : 'Вид активен')
                        }
                      >
                        {type.visibility === 'VISIBLE' ? 'Скрыть' : 'Показать'}
                      </button>
                    ) : null}
                  </div>
                  {!collapsed ? (
                    <div className="mt-2 space-y-2 pl-6">
                      {typeVarieties.map(({ variety, items: varietyItems }) => (
                        <div key={variety.id}>
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="font-medium">{variety.name}</span>
                            <span className="text-xs text-[var(--admin-muted)]">
                              {varietyItems.length} поз. · {countLabel(variety.productsCount)}
                            </span>
                          </div>
                          <ul className="mt-1 space-y-1 pl-4">
                            {varietyItems.map((item) => (
                              <FlowerItemRow
                                key={item.id}
                                item={item}
                                canUpdate={canUpdate}
                                pending={pending}
                                onArchive={() =>
                                  void run(async () => {
                                    await adminPatch(adminEndpoints.flowerItem(item.id), {
                                      expectedVersion: item.version,
                                      visibility:
                                        item.visibility === 'VISIBLE' ? 'HIDDEN' : 'VISIBLE',
                                    });
                                  }, item.visibility === 'VISIBLE' ? 'Позиция в архиве' : 'Позиция активна')
                                }
                                onDelete={() =>
                                  void run(async () => {
                                    await adminDelete(adminEndpoints.flowerItem(item.id), {
                                      expectedVersion: item.version,
                                    });
                                  }, 'Позиция удалена')
                                }
                              />
                            ))}
                          </ul>
                        </div>
                      ))}
                      {orphanItems.length > 0 ? (
                        <div>
                          <div className="text-sm text-[var(--admin-muted)]">Без сорта</div>
                          <ul className="mt-1 space-y-1 pl-4">
                            {orphanItems.map((item) => (
                              <FlowerItemRow
                                key={item.id}
                                item={item}
                                canUpdate={canUpdate}
                                pending={pending}
                                onArchive={() =>
                                  void run(async () => {
                                    await adminPatch(adminEndpoints.flowerItem(item.id), {
                                      expectedVersion: item.version,
                                      visibility:
                                        item.visibility === 'VISIBLE' ? 'HIDDEN' : 'VISIBLE',
                                    });
                                  }, item.visibility === 'VISIBLE' ? 'Позиция в архиве' : 'Позиция активна')
                                }
                                onDelete={() =>
                                  void run(async () => {
                                    await adminDelete(adminEndpoints.flowerItem(item.id), {
                                      expectedVersion: item.version,
                                    });
                                  }, 'Позиция удалена')
                                }
                              />
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="admin-section__title">Происхождение</h2>
        {canCreate ? (
          <form
            className="admin-toolbar"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              const form = event.currentTarget;
              const name = String(new FormData(form).get('name') ?? '').trim();
              if (!name) return;
              void run(async () => {
                await adminPost(adminEndpoints.flowerOrigins, {
                  name,
                  sortOrder: (origins.at(-1)?.sortOrder ?? 0) + 10,
                });
                form.reset();
              }, `Происхождение «${name}» добавлено`);
            }}
          >
            <label className="admin-field">
              <span>Новое происхождение</span>
              <input name="name" required className="admin-input w-52" placeholder="Эквадор" />
            </label>
            <button type="submit" className="admin-btn" disabled={pending}>
              Добавить
            </button>
          </form>
        ) : null}
        <ul className="admin-panel space-y-1 p-3">
          {origins.map((origin) => (
            <li key={origin.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{origin.name}</span>
              <span className="text-xs text-[var(--admin-muted)]">
                {origin.itemsCount ?? 0} поз. · {countLabel(origin.productsCount)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function FlowerItemRow({
  item,
  canUpdate,
  pending,
  onArchive,
  onDelete,
}: {
  item: FlowerItemAdminDto;
  canUpdate: boolean;
  pending: boolean;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <span className={item.visibility === 'HIDDEN' ? 'opacity-60' : undefined}>{item.name}</span>
      <span className="text-xs text-[var(--admin-muted)]">
        в составе {item.componentsCount} тов.
      </span>
      {item.visibility === 'HIDDEN' ? <span className="admin-chip">Архив</span> : null}
      {canUpdate ? (
        <>
          <button type="button" className="admin-btn-ghost text-xs" disabled={pending} onClick={onArchive}>
            {item.visibility === 'VISIBLE' ? 'В архив' : 'Восстановить'}
          </button>
          {item.componentsCount === 0 ? (
            <button
              type="button"
              className="admin-btn-ghost text-xs text-[var(--admin-danger)]"
              disabled={pending}
              onClick={onDelete}
            >
              Удалить
            </button>
          ) : null}
        </>
      ) : null}
    </li>
  );
}

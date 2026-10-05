'use client';

import {
  DEFAULT_PRODUCT_VARIANT_NAME,
  deriveCompositionManagerSummary,
  resolveCompositionSetupStatus,
  normalizeSlug,
  suggestProductNameFromComposition,
  type ComponentUnit,
  type ProductAdminDto,
  type ProductFamilyMemberDto,
  type VariantStatus,
} from '@bouquet-one/contracts';
import type { PickerOption } from '@/components/admin/product-editor';

export type CompositionHit = {
  id: string;
  name: string;
  visibility?: string;
  flowerType?: { name: string };
  flowerVariety?: { name: string } | null;
  flowerOrigin?: { name: string } | null;
  stemLengthCm?: number | null;
};

export type ComponentDraft = {
  key: string;
  displayName: string;
  quantity: string;
  unit: ComponentUnit;
  flowerItemId: string;
  flowerId: string;
  typeName: string;
  varietyName: string;
  originName: string;
  stemLengthCm: number | null;
};

export type VariantDraft = {
  key: string;
  id: string | null;
  name: string;
  priceMajor: string;
  status: VariantStatus;
  salePriceMajor: string;
};

type Props = {
  server: ProductAdminDto;
  canUpdate: boolean;
  basic: {
    name: string;
    slug: string;
    shortDescription: string;
    description: string;
    heightCm: string;
  };
  setBasic: React.Dispatch<
    React.SetStateAction<{
      name: string;
      slug: string;
      shortDescription: string;
      description: string;
      heightCm: string;
    }>
  >;
  slugManual: boolean;
  setSlugManual: (value: boolean) => void;
  catalogCategoryId: string;
  setCatalogCategoryId: (value: string) => void;
  categories: PickerOption[];
  components: ComponentDraft[];
  setComponents: React.Dispatch<React.SetStateAction<ComponentDraft[]>>;
  variants: VariantDraft[];
  setVariants: React.Dispatch<React.SetStateAction<VariantDraft[]>>;
  compositionPickerOpen: boolean;
  setCompositionPickerOpen: (open: boolean) => void;
  compositionReplaceKey: string | null;
  setCompositionReplaceKey: (key: string | null) => void;
  compositionSearch: string;
  setCompositionSearch: (value: string) => void;
  compositionAddQty: string;
  setCompositionAddQty: (value: string) => void;
  compositionHits: CompositionHit[];
  compositionSearchPending: boolean;
  onAddFlower: (itemId: string, itemName?: string) => void;
  onOpenReplace: (componentKey: string) => void;
  familyId: string;
  setFamilyId: (value: string) => void;
  familyPanelOpen: boolean;
  setFamilyPanelOpen: (open: boolean) => void;
  familyOptions: Array<{ id: string; name: string }>;
  familyMembers: ProductFamilyMemberDto[];
  newFamilyName: string;
  setNewFamilyName: (value: string) => void;
  creatingFamily: boolean;
  onCreateFamily: () => void;
  familyReorderPending: boolean;
  onReorderFamilyMember: (productId: string, direction: -1 | 1) => void;
  onAddProductToLine?: () => void;
  addingFamilyProduct?: boolean;
  hasPrimaryImage: boolean;
  onGoPhotos: () => void;
  touch: () => void;
  nextVariantKey: () => string;
};

export function ProductEditorMainTab(props: Props) {
  const {
    server,
    canUpdate,
    basic,
    setBasic,
    slugManual,
    setSlugManual,
    catalogCategoryId,
    setCatalogCategoryId,
    categories,
    components,
    setComponents,
    variants,
    setVariants,
    compositionPickerOpen,
    setCompositionPickerOpen,
    compositionReplaceKey,
    setCompositionReplaceKey,
    compositionSearch,
    setCompositionSearch,
    compositionAddQty,
    setCompositionAddQty,
    compositionHits,
    compositionSearchPending,
    onAddFlower,
    onOpenReplace,
    familyId,
    setFamilyId,
    familyPanelOpen,
    setFamilyPanelOpen,
    familyOptions,
    familyMembers,
    newFamilyName,
    setNewFamilyName,
    creatingFamily,
    onCreateFamily,
    familyReorderPending,
    onReorderFamilyMember,
    onAddProductToLine,
    addingFamilyProduct = false,
    hasPrimaryImage,
    onGoPhotos,
    touch,
    nextVariantKey,
  } = props;

  function addSizeRow() {
    setVariants((prev) => {
      if (prev.length === 1) {
        const only = prev[0]!;
        const isDefault =
          only.name.trim() === '' ||
          only.name.trim().toLowerCase() === DEFAULT_PRODUCT_VARIANT_NAME.toLowerCase();
        if (isDefault) {
          return [
            { ...only, name: 'S' },
            {
              key: nextVariantKey(),
              id: null,
              name: 'M',
              priceMajor: '',
              status: 'ACTIVE' as VariantStatus,
              salePriceMajor: '',
            },
          ];
        }
      }
      const taken = new Set(prev.map((row) => row.name.trim().toLowerCase()));
      const nextLabel = ['S', 'M', 'L'].find((label) => !taken.has(label.toLowerCase())) ?? '';
      return [
        ...prev,
        {
          key: nextVariantKey(),
          id: null,
          name: nextLabel,
          priceMajor: '',
          status: 'ACTIVE' as VariantStatus,
          salePriceMajor: '',
        },
      ];
    });
    touch();
  }

  const commercialNamePreview = suggestProductNameFromComposition(
    components.map((row) => ({
      displayName: row.displayName,
      quantity: row.quantity.trim() ? Number(row.quantity) : null,
      typeName: row.typeName,
      varietyName: row.varietyName,
    })),
  );

  const compositionSummary = deriveCompositionManagerSummary(components);

  const legacyBanner = (() => {
    const status = resolveCompositionSetupStatus({
      flowerTypeId: server.flowerTypeId,
      flowerVarietyId: server.flowerVarietyId,
      flowerOriginId: server.flowerOriginId,
      components: components.map((row) => ({
        flowerItemId: row.flowerItemId || null,
        flowerId: row.flowerId || null,
      })),
    });
    if (status === 'legacy_pending') {
      return (
        <div className="rounded-lg border border-[var(--admin-warning,#b45309)]/40 p-3 text-sm">
          У товара остались старые поля без состава. Добавьте цветы — при сохранении устаревшие
          поля очистятся.{' '}
          <a href="/admin/catalog/composition-setup" className="underline underline-offset-2">
            Миграция состава
          </a>
        </div>
      );
    }
    return null;
  })();

  return (
    <section className="admin-section space-y-6">
      <div>
        <h2 className="admin-section__title">Основное</h2>
        <p className="admin-section__lead">
          Что это за товар и сколько он стоит. Фото, продажи и публикация — в соседних вкладках.
        </p>
      </div>

      <div className="grid max-w-2xl gap-4">
        <label className="admin-field">
          <span>Название</span>
          <input
            className="admin-input"
            value={basic.name}
            disabled={!canUpdate}
            onChange={(event) => {
              const name = event.target.value;
              setBasic((prev) => ({
                ...prev,
                name,
                ...(slugManual ? {} : { slug: normalizeSlug(name) }),
              }));
              touch();
            }}
          />
          {commercialNamePreview.length > 0 && commercialNamePreview !== basic.name.trim() ? (
            <span className="admin-field__hint flex flex-wrap items-center gap-2">
              Предложение из состава:{' '}
              <strong className="text-[var(--admin-ink)]">{commercialNamePreview}</strong>
              {canUpdate ? (
                <button
                  type="button"
                  className="admin-btn-ghost px-2 py-0.5 text-xs"
                  onClick={() => {
                    setBasic((prev) => ({
                      ...prev,
                      name: commercialNamePreview,
                      ...(slugManual ? {} : { slug: normalizeSlug(commercialNamePreview) }),
                    }));
                    touch();
                  }}
                >
                  Подставить
                </button>
              ) : null}
            </span>
          ) : null}
        </label>

        <label className="admin-field">
          <span>Адрес в ссылке</span>
          <input
            className="admin-input"
            value={basic.slug}
            disabled={!canUpdate}
            onChange={(event) => {
              setSlugManual(true);
              setBasic((prev) => ({ ...prev, slug: event.target.value }));
              touch();
            }}
          />
          <span className="admin-field__hint">/bukety/{basic.slug || '…'}</span>
        </label>
      </div>

      <div className="admin-subsection space-y-3">
        <h3 className="admin-subsection__title">Состав</h3>
        {legacyBanner}
        <ul className="space-y-2">
          {components.length === 0 ? (
            <li className="text-sm text-[var(--admin-muted)]">Добавьте хотя бы один цветок.</li>
          ) : (
            components.map((component, index) => (
              <li
                key={component.key}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--admin-border)] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{component.displayName || '—'}</p>
                  <p className="text-xs text-[var(--admin-muted)]">
                    {[component.typeName, component.varietyName, component.originName]
                      .filter(Boolean)
                      .join(' · ')}
                    {component.stemLengthCm != null ? ` · ${component.stemLengthCm} см` : ''}
                  </p>
                </div>
                <label className="admin-field admin-field--row">
                  <span className="sr-only">Количество</span>
                  <input
                    className="admin-input w-20 tabular-nums"
                    type="number"
                    min={1}
                    value={component.quantity}
                    disabled={!canUpdate}
                    onChange={(event) => {
                      const value = event.target.value;
                      setComponents((prev) =>
                        prev.map((item, i) => (i === index ? { ...item, quantity: value } : item)),
                      );
                      touch();
                    }}
                  />
                  <span className="text-sm text-[var(--admin-muted)]">шт.</span>
                </label>
                {canUpdate ? (
                  <>
                    <button
                      type="button"
                      className="admin-btn-ghost text-xs"
                      onClick={() => onOpenReplace(component.key)}
                    >
                      Изменить
                    </button>
                    <button
                      type="button"
                      className="admin-btn-ghost text-xs"
                      onClick={() => {
                        setComponents((prev) => prev.filter((_, i) => i !== index));
                        touch();
                      }}
                    >
                      Удалить
                    </button>
                  </>
                ) : null}
              </li>
            ))
          )}
        </ul>

        {canUpdate ? (
          <div className="space-y-3">
            {!compositionPickerOpen ? (
              <button
                type="button"
                className="admin-btn"
                onClick={() => {
                  setCompositionReplaceKey(null);
                  setCompositionPickerOpen(true);
                }}
              >
                + Добавить цветок
              </button>
            ) : (
              <div className="max-w-lg space-y-3 rounded-lg border border-[var(--admin-border)] p-3">
                <p className="text-sm font-medium">
                  {compositionReplaceKey ? 'Заменить цветок' : 'Добавить цветок'}
                </p>
                <label className="admin-field">
                  <span>Поиск</span>
                  <input
                    className="admin-input"
                    value={compositionSearch}
                    autoFocus
                    placeholder="Мондиаль, Эквадор…"
                    onChange={(event) => setCompositionSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && compositionHits[0]) {
                        event.preventDefault();
                        onAddFlower(compositionHits[0].id, compositionHits[0].name);
                      }
                    }}
                  />
                </label>
                {!compositionReplaceKey ? (
                  <label className="admin-field">
                    <span>Количество для следующего</span>
                    <input
                      className="admin-input w-24"
                      type="number"
                      min={1}
                      value={compositionAddQty}
                      onChange={(event) => setCompositionAddQty(event.target.value)}
                    />
                  </label>
                ) : null}
                <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
                  {compositionSearchPending ? (
                    <li className="text-[var(--admin-muted)]">Поиск…</li>
                  ) : compositionHits.length === 0 ? (
                    <li className="text-[var(--admin-muted)]">
                      Ничего не найдено.{' '}
                      <a
                        href="/admin/catalog/flower-structure"
                        className="underline underline-offset-2"
                      >
                        Создать цветок
                      </a>
                    </li>
                  ) : (
                    compositionHits.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className="w-full rounded px-2 py-1.5 text-left hover:bg-[var(--admin-surface-muted,rgba(0,0,0,0.04))]"
                          onClick={() => onAddFlower(item.id, item.name)}
                        >
                          {item.name}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
                <button
                  type="button"
                  className="admin-btn-ghost"
                  onClick={() => {
                    setCompositionPickerOpen(false);
                    setCompositionReplaceKey(null);
                    setCompositionSearch('');
                  }}
                >
                  Готово
                </button>
              </div>
            )}
          </div>
        ) : null}

        {compositionSummary.flowerTypes.length > 0 ? (
          <div className="rounded-lg bg-[var(--admin-surface-muted,rgba(0,0,0,0.03))] p-3 text-sm">
            <p className="font-medium">Из состава система знает</p>
            <dl className="mt-2 grid gap-1 sm:grid-cols-2">
              <div>
                <dt className="text-[var(--admin-muted)]">Цветы</dt>
                <dd>{compositionSummary.flowerTypes.join(' · ')}</dd>
              </div>
              {compositionSummary.varieties.length > 0 ? (
                <div>
                  <dt className="text-[var(--admin-muted)]">Сорта</dt>
                  <dd>{compositionSummary.varieties.join(' · ')}</dd>
                </div>
              ) : null}
              {compositionSummary.origins.length > 0 ? (
                <div>
                  <dt className="text-[var(--admin-muted)]">Происхождение</dt>
                  <dd>{compositionSummary.origins.join(' · ')}</dd>
                </div>
              ) : null}
              {compositionSummary.stemLengthLabel ? (
                <div>
                  <dt className="text-[var(--admin-muted)]">Высота стеблей</dt>
                  <dd>{compositionSummary.stemLengthLabel}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        ) : null}
      </div>

      <div className="grid max-w-2xl gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="admin-field">
            <span>Категория</span>
            <select
              className="admin-select"
              value={catalogCategoryId}
              disabled={!canUpdate}
              onChange={(event) => {
                setCatalogCategoryId(event.target.value);
                touch();
              }}
            >
              <option value="">Не указана</option>
              {categories.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>Высота букета, см</span>
            <input
              className="admin-input"
              type="number"
              min={15}
              max={250}
              value={basic.heightCm}
              disabled={!canUpdate}
              placeholder="не указана"
              onChange={(event) => {
                setBasic((prev) => ({ ...prev, heightCm: event.target.value }));
                touch();
              }}
            />
            <span className="admin-field__hint">Высота готового букета, не стебля.</span>
          </label>
        </div>

        <div className="admin-subsection space-y-3">
          <h3 className="admin-subsection__title">
            {variants.length === 1 ? 'Цена товара' : 'Размер / цена'}
          </h3>
          {variants.length === 1 ? (
            <label className="admin-field max-w-xs">
              <span>{variants[0]?.name || DEFAULT_PRODUCT_VARIANT_NAME}</span>
              <input
                className="admin-input tabular-nums"
                value={variants[0]?.priceMajor ?? ''}
                disabled={!canUpdate}
                inputMode="decimal"
                placeholder="Укажите цену"
                onChange={(event) => {
                  const value = event.target.value;
                  setVariants((prev) =>
                    prev.map((item, i) => (i === 0 ? { ...item, priceMajor: value } : item)),
                  );
                  touch();
                }}
              />
              <span className="admin-field__hint">BYN</span>
            </label>
          ) : (
            <div className="space-y-2">
              {variants.map((variant, index) => (
                <div key={variant.key} className="flex flex-wrap items-end gap-2">
                  <label className="admin-field">
                    <span>Размер</span>
                    <input
                      className="admin-input w-32"
                      value={variant.name}
                      disabled={!canUpdate}
                      placeholder="S"
                      onChange={(event) => {
                        const value = event.target.value;
                        setVariants((prev) =>
                          prev.map((item, i) => (i === index ? { ...item, name: value } : item)),
                        );
                        touch();
                      }}
                    />
                  </label>
                  <label className="admin-field">
                    <span>Цена, BYN</span>
                    <input
                      className="admin-input w-32 tabular-nums"
                      value={variant.priceMajor}
                      disabled={!canUpdate}
                      inputMode="decimal"
                      placeholder="Укажите цену"
                      onChange={(event) => {
                        const value = event.target.value;
                        setVariants((prev) =>
                          prev.map((item, i) =>
                            i === index ? { ...item, priceMajor: value } : item,
                          ),
                        );
                        touch();
                      }}
                    />
                  </label>
                  {canUpdate && variants.length > 1 ? (
                    <button
                      type="button"
                      className="admin-btn-ghost"
                      onClick={() => {
                        setVariants((prev) => prev.filter((_, i) => i !== index));
                        touch();
                      }}
                    >
                      Удалить
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          {canUpdate ? (
            <button type="button" className="admin-btn-ghost" onClick={addSizeRow}>
              + Добавить размер (S / M / L)
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-[var(--admin-muted)]">Фото:</span>
          {hasPrimaryImage ? (
            <span>✓ основное фото</span>
          ) : (
            <span className="text-amber-800">нет основного фото</span>
          )}
          <button type="button" className="admin-link" onClick={onGoPhotos}>
            {hasPrimaryImage ? 'Изменить' : 'Добавить'}
          </button>
        </div>

        <label className="admin-field">
          <span>Короткое описание</span>
          <textarea
            className="admin-input"
            rows={2}
            value={basic.shortDescription}
            disabled={!canUpdate}
            onChange={(event) => {
              setBasic((prev) => ({ ...prev, shortDescription: event.target.value }));
              touch();
            }}
          />
        </label>
        <label className="admin-field">
          <span>Полное описание</span>
          <textarea
            className="admin-input"
            rows={5}
            value={basic.description}
            disabled={!canUpdate}
            onChange={(event) => {
              setBasic((prev) => ({ ...prev, description: event.target.value }));
              touch();
            }}
          />
        </label>

        <div className="admin-subsection space-y-2">
          {!familyPanelOpen ? (
            <button type="button" className="admin-btn-ghost" onClick={() => setFamilyPanelOpen(true)}>
              Связать с другими товарами (линейка)
            </button>
          ) : (
            <div className="space-y-3">
              <h3 className="admin-subsection__title">Линейка товаров</h3>
              <p className="text-xs text-[var(--admin-muted)]">
                Отдельные карточки одного товара (40 / 50 / 60 см). Не путать с размерами S/M/L в
                одной карточке.
              </p>
              <label className="admin-field max-w-md">
                <span>Линейка</span>
                <select
                  className="admin-select"
                  value={familyId}
                  disabled={!canUpdate}
                  onChange={(event) => {
                    setFamilyId(event.target.value);
                    touch();
                  }}
                >
                  <option value="">Не в линейке</option>
                  {familyOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
              {canUpdate ? (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="admin-field">
                    <span>Новая линейка</span>
                    <input
                      className="admin-input w-56"
                      value={newFamilyName}
                      disabled={creatingFamily}
                      placeholder="Например: Роза Мондиаль"
                      onChange={(event) => setNewFamilyName(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    disabled={creatingFamily || newFamilyName.trim().length === 0}
                    onClick={onCreateFamily}
                  >
                    {creatingFamily ? 'Создание…' : 'Создать'}
                  </button>
                </div>
              ) : null}
              {familyId && Array.isArray(familyMembers) && familyMembers.length > 0 ? (
                <ul className="space-y-2">
                  {familyMembers.map((member, index) => {
                    const isCurrent = member.productId === server.id;
                    return (
                      <li
                        key={member.productId}
                        className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${
                          isCurrent
                            ? 'border-[var(--admin-brand)] bg-[var(--admin-brand)]/5'
                            : 'border-[var(--admin-border)]'
                        }`}
                      >
                        <a
                          href={`/admin/catalog/products/${member.productId}`}
                          className="admin-link font-medium"
                        >
                          {member.name}
                          {isCurrent ? ' · этот товар' : ''}
                          {member.heightCm != null ? ` · ${member.heightCm} см` : ''}
                        </a>
                        {canUpdate ? (
                          <div className="admin-row-actions ml-auto">
                            <button
                              type="button"
                              className="admin-icon-btn"
                              aria-label="Выше"
                              disabled={familyReorderPending || index === 0}
                              onClick={() => onReorderFamilyMember(member.productId, -1)}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="admin-icon-btn"
                              aria-label="Ниже"
                              disabled={
                                familyReorderPending || index === familyMembers.length - 1
                              }
                              onClick={() => onReorderFamilyMember(member.productId, 1)}
                            >
                              ↓
                            </button>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : familyId ? (
                <p className="admin-help">
                  В линейке пока только этот товар. Сохраните изменения, затем добавьте другие
                  карточки.
                </p>
              ) : null}
              {canUpdate && familyId && onAddProductToLine ? (
                <button
                  type="button"
                  className="admin-btn-ghost"
                  disabled={addingFamilyProduct}
                  onClick={onAddProductToLine}
                >
                  {addingFamilyProduct ? 'Создание…' : '+ Добавить карточку в линейку'}
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

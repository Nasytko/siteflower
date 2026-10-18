'use client';

import {
  deriveCompositionKind,
  suggestVisualPaletteColorIds,
  type CompositionKind,
} from '@bouquet-one/contracts';
import { compositionKindLabel } from '@/lib/admin-labels';
import type { ComponentDraft, PickerOption } from '@/components/admin/product-editor-shared';

type ColorOption = PickerOption & { swatch?: string | null };

type Props = {
  canUpdate: boolean;
  components: ComponentDraft[];
  derivedKind: CompositionKind;
  discovery: {
    occasionIds: string[];
    recipientIds: string[];
    colorIds: string[];
  };
  setDiscovery: React.Dispatch<
    React.SetStateAction<{
      occasionIds: string[];
      recipientIds: string[];
      colorIds: string[];
    }>
  >;
  occasions: PickerOption[];
  recipients: PickerOption[];
  colors: ColorOption[];
  touch: () => void;
  toggleId: (list: string[], id: string) => string[];
};

export function ProductEditorMatchingTab(props: Props) {
  const {
    canUpdate,
    components,
    derivedKind,
    discovery,
    setDiscovery,
    occasions,
    recipients,
    colors,
    touch,
    toggleId,
  } = props;

  const suggestedPaletteIds = suggestVisualPaletteColorIds(
    components.map((row) => ({ role: row.role, colorId: row.colorId || null })),
  );
  const suggestedSet = new Set(suggestedPaletteIds);
  const kindFromRows = deriveCompositionKind(
    components.map((row) => ({ role: row.role, typeName: row.typeName })),
  );
  const kind = derivedKind || kindFromRows;

  return (
    <section className="admin-section space-y-6">
      <div>
        <h2 className="admin-section__title">Подбор</h2>
        <p className="admin-section__lead">
          Как покупатель найдёт товар: палитра, повод и получатель. Вид состава — из вкладки
          «Состав».
        </p>
      </div>

      <p className="text-sm">
        <span className="text-[var(--admin-muted)]">Вид состава: </span>
        <strong>{compositionKindLabel(kind)}</strong>
      </p>

      {colors.length > 0 ? (
        <fieldset className="admin-fieldset">
          <legend>Визуальная палитра</legend>
          <p className="admin-field__hint mb-2">
            Цвета букета на витрине. Можно подтвердить предложение из состава.
          </p>
          {suggestedPaletteIds.length > 0 && canUpdate ? (
            <button
              type="button"
              className="admin-btn-ghost mb-3 text-sm"
              onClick={() => {
                setDiscovery((prev) => ({ ...prev, colorIds: suggestedPaletteIds }));
                touch();
              }}
            >
              Подставить из состава ({suggestedPaletteIds.length})
            </button>
          ) : null}
          <div className="admin-checks">
            {colors.map((option) => {
              const suggested = suggestedSet.has(option.id);
              return (
                <label key={option.id} className="admin-check">
                  <input
                    type="checkbox"
                    disabled={!canUpdate}
                    checked={discovery.colorIds.includes(option.id)}
                    onChange={() => {
                      setDiscovery((prev) => ({
                        ...prev,
                        colorIds: toggleId(prev.colorIds, option.id),
                      }));
                      touch();
                    }}
                  />
                  <span
                    aria-hidden
                    className="admin-swatch admin-swatch--sm"
                    style={option.swatch ? { background: option.swatch } : undefined}
                  />
                  {option.name}
                  {suggested ? (
                    <span className="text-xs text-[var(--admin-muted)]"> · из состава</span>
                  ) : null}
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : (
        <p className="admin-help">
          Справочник цветов пуст.{' '}
          <a href="/admin/catalog/colors" className="admin-link">
            Добавить цвета
          </a>
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {occasions.length > 0 ? (
          <fieldset className="admin-fieldset">
            <legend>Повод</legend>
            <div className="admin-checks">
              {occasions.map((option) => (
                <label key={option.id} className="admin-check">
                  <input
                    type="checkbox"
                    disabled={!canUpdate}
                    checked={discovery.occasionIds.includes(option.id)}
                    onChange={() => {
                      setDiscovery((prev) => ({
                        ...prev,
                        occasionIds: toggleId(prev.occasionIds, option.id),
                      }));
                      touch();
                    }}
                  />
                  {option.name}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {recipients.length > 0 ? (
          <fieldset className="admin-fieldset">
            <legend>Кому</legend>
            <div className="admin-checks">
              {recipients.map((option) => (
                <label key={option.id} className="admin-check">
                  <input
                    type="checkbox"
                    disabled={!canUpdate}
                    checked={discovery.recipientIds.includes(option.id)}
                    onChange={() => {
                      setDiscovery((prev) => ({
                        ...prev,
                        recipientIds: toggleId(prev.recipientIds, option.id),
                      }));
                      touch();
                    }}
                  />
                  {option.name}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
      </div>
    </section>
  );
}

'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  FulfillmentSettingsAdminDto,
  TimeWindowAppliesTo,
  TimeWindowDto,
} from '@bouquet-one/contracts';
import { TIME_WINDOW_APPLIES_TO } from '@bouquet-one/contracts';
import { adminGet, adminPatch, AdminRequestError, errorMessage } from '@/lib/admin-client';
import { FormSaveStatus, phaseFromAdminError, type FormSavePhase } from '@/components/admin/form-status';

const FULFILLMENT_SETTINGS_PATH = '/api/v1/admin/fulfillment/settings';

type Props = {
  initial: FulfillmentSettingsAdminDto;
  canUpdate: boolean;
};

type WindowDraft = {
  label: string;
  startTime: string;
  endTime: string;
  appliesTo: TimeWindowAppliesTo;
  active: boolean;
  sortOrder: string;
};

function appliesToLabel(value: string): string {
  switch (value) {
    case 'DELIVERY':
      return 'Доставка';
    case 'PICKUP':
      return 'Самовывоз';
    case 'BOTH':
      return 'Оба';
    default:
      return value;
  }
}

function minorToMajorInput(minor: string): string {
  const n = Number(minor);
  if (!Number.isFinite(n)) return '0';
  return (n / 100).toFixed(2);
}

function majorInputToMinor(value: string): string {
  const normalized = value.replace(',', '.').trim();
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return '0';
  return String(Math.round(n * 100));
}

function minutesToClock(total: number): string {
  const safe = Math.max(0, Math.min(24 * 60, Math.floor(total)));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function clockToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 24 || minutes < 0 || minutes > 59) return null;
  const total = hours * 60 + minutes;
  if (total > 24 * 60) return null;
  return total;
}

function splitLeadMinutes(total: number): { hours: string; minutes: string } {
  const safe = Math.max(0, Math.floor(total));
  return {
    hours: String(Math.floor(safe / 60)),
    minutes: String(safe % 60),
  };
}

function combineLeadMinutes(hoursRaw: string, minutesRaw: string): number {
  const hours = Math.max(0, Number(hoursRaw) || 0);
  const minutes = Math.max(0, Math.min(59, Number(minutesRaw) || 0));
  return hours * 60 + minutes;
}

function toDraft(window: TimeWindowDto): WindowDraft {
  return {
    label: window.label,
    startTime: minutesToClock(window.startMinutes),
    endTime: minutesToClock(window.endMinutes),
    appliesTo: window.appliesTo,
    active: window.active,
    sortOrder: String(window.sortOrder),
  };
}

function emptyDraft(sortOrder: number): WindowDraft {
  return {
    label: '',
    startTime: '10:00',
    endTime: '12:00',
    appliesTo: 'BOTH',
    active: true,
    sortOrder: String(sortOrder),
  };
}

function draftToWindow(id: string, draft: WindowDraft): TimeWindowDto | string {
  const label = draft.label.trim();
  if (!label) return 'Укажите название окна';
  const startMinutes = clockToMinutes(draft.startTime);
  const endMinutes = clockToMinutes(draft.endTime);
  if (startMinutes == null || endMinutes == null) {
    return 'Время указывается как ЧЧ:ММ, например 10:00';
  }
  if (endMinutes <= startMinutes) {
    return 'Конец окна должен быть позже начала';
  }
  const sortOrder = Number(draft.sortOrder);
  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    return 'Порядок — целое число от 0';
  }
  return {
    id,
    label,
    startMinutes,
    endMinutes,
    active: draft.active,
    sortOrder,
    appliesTo: draft.appliesTo,
  };
}

function newWindowId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `tw-${crypto.randomUUID()}`;
  }
  return `tw-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function bySortOrder(a: TimeWindowDto, b: TimeWindowDto): number {
  return a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'ru');
}

export function FulfillmentSettingsEditor({ initial, canUpdate }: Props) {
  const router = useRouter();
  const [version, setVersion] = useState(initial.version);
  const [deliveryEnabled, setDeliveryEnabled] = useState(initial.deliveryEnabled);
  const [pickupEnabled, setPickupEnabled] = useState(initial.pickupEnabled);
  const [deliveryFeeMajor, setDeliveryFeeMajor] = useState(
    minorToMajorInput(initial.deliveryFeeMinor),
  );
  const initialLead = splitLeadMinutes(initial.minLeadTimeMinutes);
  const [leadHours, setLeadHours] = useState(initialLead.hours);
  const [leadMinutes, setLeadMinutes] = useState(initialLead.minutes);
  const [maxAdvanceDays, setMaxAdvanceDays] = useState(String(initial.maxAdvanceDays));
  const [pickupInstructions, setPickupInstructions] = useState(
    initial.pickupInstructions ?? '',
  );
  const [timeWindows, setTimeWindows] = useState<TimeWindowDto[]>(() =>
    [...initial.timeWindows].sort(bySortOrder),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<WindowDraft | null>(null);
  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState<WindowDraft>(() =>
    emptyDraft((initial.timeWindows.at(-1)?.sortOrder ?? 0) + 10),
  );
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [phase, setPhase] = useState<FormSavePhase>('idle');
  const [pending, setPending] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  function markDirty() {
    setPhase('dirty');
  }

  function applySettings(updated: FulfillmentSettingsAdminDto) {
    setVersion(updated.version);
    setDeliveryEnabled(updated.deliveryEnabled);
    setPickupEnabled(updated.pickupEnabled);
    setDeliveryFeeMajor(minorToMajorInput(updated.deliveryFeeMinor));
    const lead = splitLeadMinutes(updated.minLeadTimeMinutes);
    setLeadHours(lead.hours);
    setLeadMinutes(lead.minutes);
    setMaxAdvanceDays(String(updated.maxAdvanceDays));
    setPickupInstructions(updated.pickupInstructions ?? '');
    setTimeWindows([...updated.timeWindows].sort(bySortOrder));
    setEditingId(null);
    setDraft(null);
    setCreating(false);
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!canUpdate) return;
    if (editingId || creating) {
      setError('Сначала сохраните или отмените правку окна времени');
      setPhase('server');
      return;
    }
    setPending(true);
    setError(null);
    setRequestId(null);
    setSavedAt(null);
    setPhase('saving');
    try {
      const updated = await adminPatch<FulfillmentSettingsAdminDto>(FULFILLMENT_SETTINGS_PATH, {
        expectedVersion: version,
        deliveryEnabled,
        pickupEnabled,
        deliveryFeeMinor: majorInputToMinor(deliveryFeeMajor),
        minLeadTimeMinutes: combineLeadMinutes(leadHours, leadMinutes),
        maxAdvanceDays: Number(maxAdvanceDays),
        pickupInstructions: pickupInstructions.trim() || null,
        timeWindows,
      });
      applySettings(updated);
      setSavedAt(new Date().toLocaleTimeString('ru-BY'));
      setPhase('saved');
      router.refresh();
    } catch (err) {
      if (err instanceof AdminRequestError) {
        setPhase(phaseFromAdminError(err));
        setRequestId(err.requestId ?? null);
      } else {
        setPhase('server');
      }
      setError(errorMessage(err, 'Не удалось сохранить настройки'));
    } finally {
      setPending(false);
    }
  }

  function startEdit(window: TimeWindowDto) {
    if (!canUpdate) return;
    setCreating(false);
    setEditingId(window.id);
    setDraft(toDraft(window));
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  function commitEdit() {
    if (!editingId || !draft) return;
    const next = draftToWindow(editingId, draft);
    if (typeof next === 'string') {
      setError(next);
      return;
    }
    setTimeWindows((windows) =>
      [...windows.map((w) => (w.id === editingId ? next : w))].sort(bySortOrder),
    );
    setEditingId(null);
    setDraft(null);
    setError(null);
    markDirty();
  }

  function removeWindow(id: string) {
    if (!canUpdate) return;
    setTimeWindows((windows) => windows.filter((w) => w.id !== id));
    if (editingId === id) cancelEdit();
    markDirty();
  }

  function startCreate() {
    if (!canUpdate) return;
    setEditingId(null);
    setDraft(null);
    setCreateDraft(emptyDraft((timeWindows.at(-1)?.sortOrder ?? 0) + 10));
    setCreating(true);
    setError(null);
  }

  function commitCreate() {
    const next = draftToWindow(newWindowId(), createDraft);
    if (typeof next === 'string') {
      setError(next);
      return;
    }
    setTimeWindows((windows) => [...windows, next].sort(bySortOrder));
    setCreating(false);
    setError(null);
    markDirty();
  }

  function renderDraftFields(
    value: WindowDraft,
    onChange: (next: WindowDraft) => void,
  ) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="admin-field sm:col-span-2">
          <span>Название</span>
          <input
            value={value.label}
            disabled={!canUpdate}
            onChange={(e) => onChange({ ...value, label: e.target.value })}
            className="admin-input"
            placeholder="Например, 10:00–12:00"
          />
        </label>
        <label className="admin-field">
          <span>Начало</span>
          <input
            type="time"
            value={value.startTime}
            disabled={!canUpdate}
            onChange={(e) => onChange({ ...value, startTime: e.target.value })}
            className="admin-input"
          />
        </label>
        <label className="admin-field">
          <span>Конец</span>
          <input
            type="time"
            value={value.endTime}
            disabled={!canUpdate}
            onChange={(e) => onChange({ ...value, endTime: e.target.value })}
            className="admin-input"
          />
        </label>
        <label className="admin-field">
          <span>Применяется к</span>
          <select
            value={value.appliesTo}
            disabled={!canUpdate}
            onChange={(e) =>
              onChange({ ...value, appliesTo: e.target.value as TimeWindowAppliesTo })
            }
            className="admin-select"
          >
            {TIME_WINDOW_APPLIES_TO.map((option) => (
              <option key={option} value={option}>
                {appliesToLabel(option)}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          <span>Порядок</span>
          <input
            type="number"
            min={0}
            value={value.sortOrder}
            disabled={!canUpdate}
            onChange={(e) => onChange({ ...value, sortOrder: e.target.value })}
            className="admin-input"
          />
        </label>
        <label className="admin-check sm:col-span-2">
          <input
            type="checkbox"
            checked={value.active}
            disabled={!canUpdate}
            onChange={(e) => onChange({ ...value, active: e.target.checked })}
          />
          Активно
        </label>
      </div>
    );
  }

  return (
    <form onSubmit={onSave} className="max-w-2xl space-y-8">
      <FormSaveStatus
        phase={phase === 'idle' && savedAt ? 'saved' : phase}
        savedLabel={savedAt ? `Настройки сохранены · ${savedAt}` : null}
        errorMessage={error}
        requestId={requestId}
        onRefresh={() => {
          void (async () => {
            try {
              const fresh = await adminGet<FulfillmentSettingsAdminDto>(FULFILLMENT_SETTINGS_PATH);
              applySettings(fresh);
              setError(null);
              setRequestId(null);
              setPhase('idle');
              router.refresh();
            } catch (err) {
              setPhase('server');
              setError(errorMessage(err, 'Не удалось обновить данные'));
            }
          })();
        }}
        onDismiss={() => {
          setError(null);
          setPhase(savedAt ? 'saved' : 'idle');
        }}
      />

      <section className="admin-section space-y-4">
        <h2 className="admin-section__title">Курьерская доставка</h2>
        <label className="admin-check">
          <input
            type="checkbox"
            checked={deliveryEnabled}
            disabled={!canUpdate}
            onChange={(e) => {
              setDeliveryEnabled(e.target.checked);
              markDirty();
            }}
          />
          Доставка включена
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="admin-field">
            <span>Стоимость доставки (BYN)</span>
            <input
              value={deliveryFeeMajor}
              disabled={!canUpdate || !deliveryEnabled}
              inputMode="decimal"
              onChange={(e) => {
                setDeliveryFeeMajor(e.target.value);
                markDirty();
              }}
              className="admin-input"
            />
          </label>
          <div className="admin-field">
            <span>Минимальное время подготовки</span>
            <div className="grid grid-cols-2 gap-2">
              <label className="admin-field mb-0">
                <span>Часы</span>
                <input
                  type="number"
                  min={0}
                  value={leadHours}
                  disabled={!canUpdate}
                  onChange={(e) => {
                    setLeadHours(e.target.value);
                    markDirty();
                  }}
                  className="admin-input"
                />
              </label>
              <label className="admin-field mb-0">
                <span>Минуты</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={leadMinutes}
                  disabled={!canUpdate}
                  onChange={(e) => {
                    setLeadMinutes(e.target.value);
                    markDirty();
                  }}
                  className="admin-input"
                />
              </label>
            </div>
          </div>
        </div>
      </section>

      <section className="admin-section space-y-4">
        <h2 className="admin-section__title">Самовывоз</h2>
        <label className="admin-check">
          <input
            type="checkbox"
            checked={pickupEnabled}
            disabled={!canUpdate}
            onChange={(e) => {
              setPickupEnabled(e.target.checked);
              markDirty();
            }}
          />
          Самовывоз включён
        </label>
        <label className="admin-field">
          <span>Инструкции самовывоза</span>
          <textarea
            rows={3}
            value={pickupInstructions}
            disabled={!canUpdate || !pickupEnabled}
            onChange={(e) => {
              setPickupInstructions(e.target.value);
              markDirty();
            }}
            className="admin-input"
            placeholder="Как найти точку, этаж, ориентиры…"
          />
          <span className="admin-field__hint">
            Адрес магазина задаётся в юридических данных и настройках витрины.
          </span>
        </label>
      </section>

      <section className="admin-section space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="admin-section__title">Время получения</h2>
            <p className="admin-section__lead">Окна доставки и самовывоза по времени Минска.</p>
          </div>
          {canUpdate && !creating ? (
            <button type="button" className="admin-btn-ghost" onClick={startCreate}>
              Добавить окно
            </button>
          ) : null}
        </div>

        {creating ? (
          <div className="space-y-3 rounded-lg border border-[var(--admin-border)] p-4">
            <p className="text-sm font-semibold text-[var(--admin-ink)]">Новое окно</p>
            {renderDraftFields(createDraft, setCreateDraft)}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="admin-btn" onClick={commitCreate}>
                Добавить
              </button>
              <button
                type="button"
                className="admin-btn-ghost"
                onClick={() => {
                  setCreating(false);
                  setError(null);
                }}
              >
                Отмена
              </button>
            </div>
          </div>
        ) : null}

        {timeWindows.length === 0 ? (
          <p className="admin-help">Окон пока нет — добавьте хотя бы одно для оформления заказов.</p>
        ) : (
          <ul className="divide-y divide-[var(--admin-border)]">
            {timeWindows.map((w) => (
              <li key={w.id} className="space-y-3 py-3">
                {editingId === w.id && draft ? (
                  <div className="space-y-3">
                    {renderDraftFields(draft, setDraft)}
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="admin-btn" onClick={commitEdit}>
                        Готово
                      </button>
                      <button type="button" className="admin-btn-ghost" onClick={cancelEdit}>
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-[var(--admin-ink)]">
                        {w.label}{' '}
                        <span className="text-[var(--admin-muted)]">
                          ({minutesToClock(w.startMinutes)}–{minutesToClock(w.endMinutes)})
                        </span>
                      </p>
                      <p className="text-sm text-[var(--admin-muted)]">
                        {appliesToLabel(w.appliesTo)}
                        {w.active ? '' : ' · выключено'} · порядок {w.sortOrder}
                      </p>
                    </div>
                    {canUpdate ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="admin-btn-ghost"
                          onClick={() => startEdit(w)}
                        >
                          Изменить
                        </button>
                        <button
                          type="button"
                          className="admin-btn-ghost"
                          onClick={() => removeWindow(w.id)}
                        >
                          Удалить
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="admin-section">
        <summary className="cursor-pointer text-base font-semibold text-[var(--admin-ink)]">
          Дополнительно
        </summary>
        <div className="mt-4 space-y-4">
          <label className="admin-field max-w-xs">
            <span>Горизонт заказа (дней)</span>
            <input
              type="number"
              min={1}
              max={90}
              value={maxAdvanceDays}
              disabled={!canUpdate}
              onChange={(e) => {
                setMaxAdvanceDays(e.target.value);
                markDirty();
              }}
              className="admin-input"
            />
            <span className="admin-field__hint">
              На сколько дней вперёд можно выбрать дату получения.
            </span>
          </label>
          <p className="admin-help">
            Все даты и окна считаются по времени Минска.
          </p>
        </div>
      </details>

      <div className="admin-savebar">
        {canUpdate ? (
          <button type="submit" disabled={pending} className="admin-btn">
            {pending ? 'Сохранение…' : 'Сохранить'}
          </button>
        ) : (
          <p className="admin-help">Только просмотр: нет прав на изменение.</p>
        )}
        <FormSaveStatus
          phase={pending ? 'saving' : phase === 'dirty' ? 'dirty' : phase === 'saved' ? 'saved' : 'idle'}
          savedLabel={savedAt ? `Сохранено в ${savedAt}` : null}
        />
      </div>
    </form>
  );
}

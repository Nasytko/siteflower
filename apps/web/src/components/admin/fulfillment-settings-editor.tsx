'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  FulfillmentSettingsAdminDto,
  TimeWindowDto,
} from '@bouquet-one/contracts';
import { adminGet, adminPatch, AdminRequestError, errorMessage } from '@/lib/admin-client';
import { FormSaveStatus, phaseFromAdminError, type FormSavePhase } from '@/components/admin/form-status';

const FULFILLMENT_SETTINGS_PATH = '/api/v1/admin/fulfillment/settings';

type Props = {
  initial: FulfillmentSettingsAdminDto;
  canUpdate: boolean;
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

export function FulfillmentSettingsEditor({ initial, canUpdate }: Props) {
  const router = useRouter();
  const [version, setVersion] = useState(initial.version);
  const [deliveryEnabled, setDeliveryEnabled] = useState(initial.deliveryEnabled);
  const [pickupEnabled, setPickupEnabled] = useState(initial.pickupEnabled);
  const [deliveryFeeMajor, setDeliveryFeeMajor] = useState(
    minorToMajorInput(initial.deliveryFeeMinor),
  );
  const [minLeadTimeMinutes, setMinLeadTimeMinutes] = useState(
    String(initial.minLeadTimeMinutes),
  );
  const [maxAdvanceDays, setMaxAdvanceDays] = useState(String(initial.maxAdvanceDays));
  const [pickupInstructions, setPickupInstructions] = useState(
    initial.pickupInstructions ?? '',
  );
  const [timeWindows, setTimeWindows] = useState<TimeWindowDto[]>(initial.timeWindows);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [phase, setPhase] = useState<FormSavePhase>('idle');
  const [pending, setPending] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  function applySettings(updated: FulfillmentSettingsAdminDto) {
    setVersion(updated.version);
    setDeliveryEnabled(updated.deliveryEnabled);
    setPickupEnabled(updated.pickupEnabled);
    setDeliveryFeeMajor(minorToMajorInput(updated.deliveryFeeMinor));
    setMinLeadTimeMinutes(String(updated.minLeadTimeMinutes));
    setMaxAdvanceDays(String(updated.maxAdvanceDays));
    setPickupInstructions(updated.pickupInstructions ?? '');
    setTimeWindows(updated.timeWindows);
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!canUpdate) return;
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
        minLeadTimeMinutes: Number(minLeadTimeMinutes),
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

  function toggleWindow(id: string) {
    setTimeWindows((windows) =>
      windows.map((w) => (w.id === id ? { ...w, active: !w.active } : w)),
    );
    setPhase('dirty');
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

      <section className="admin-section space-y-3">
        <h2 className="admin-section__title">Методы</h2>
        <label className="admin-check">
          <input
            type="checkbox"
            checked={deliveryEnabled}
            disabled={!canUpdate}
            onChange={(e) => {
              setDeliveryEnabled(e.target.checked);
              setPhase('dirty');
            }}
          />
          Доставка включена
        </label>
        <label className="admin-check">
          <input
            type="checkbox"
            checked={pickupEnabled}
            disabled={!canUpdate}
            onChange={(e) => {
              setPickupEnabled(e.target.checked);
              setPhase('dirty');
            }}
          />
          Самовывоз включён
        </label>
      </section>

      <section className="admin-section space-y-4">
        <h2 className="admin-section__title">Параметры</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="admin-field">
            <span>Стоимость доставки (BYN)</span>
            <input
              value={deliveryFeeMajor}
              disabled={!canUpdate}
              inputMode="decimal"
              onChange={(e) => {
                setDeliveryFeeMajor(e.target.value);
                setPhase('dirty');
              }}
              className="admin-input"
            />
          </label>
          <label className="admin-field">
            <span>Минимальное время подготовки (мин)</span>
            <input
              type="number"
              min={0}
              value={minLeadTimeMinutes}
              disabled={!canUpdate}
              onChange={(e) => {
                setMinLeadTimeMinutes(e.target.value);
                setPhase('dirty');
              }}
              className="admin-input"
            />
          </label>
          <label className="admin-field">
            <span>Горизонт заказа (дней)</span>
            <input
              type="number"
              min={1}
              value={maxAdvanceDays}
              disabled={!canUpdate}
              onChange={(e) => {
                setMaxAdvanceDays(e.target.value);
                setPhase('dirty');
              }}
              className="admin-input"
            />
          </label>
        </div>
        <label className="admin-field">
          <span>Инструкции самовывоза</span>
          <textarea
            rows={3}
            value={pickupInstructions}
            disabled={!canUpdate}
            onChange={(e) => {
              setPickupInstructions(e.target.value);
              setPhase('dirty');
            }}
            className="admin-input"
          />
        </label>
      </section>

      <section className="admin-section space-y-2">
        <h2 className="admin-section__title">Окна времени</h2>
        <p className="admin-section__lead">По времени Минска (Europe/Minsk).</p>
        <ul className="divide-y divide-[var(--admin-border)]">
          {timeWindows.map((w) => (
            <li key={w.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {w.label}{' '}
                <span className="text-[var(--admin-muted)]">({appliesToLabel(w.appliesTo)})</span>
              </span>
              <label className="admin-check mb-0">
                <input
                  type="checkbox"
                  checked={w.active}
                  disabled={!canUpdate}
                  onChange={() => toggleWindow(w.id)}
                />
                Активно
              </label>
            </li>
          ))}
        </ul>
      </section>

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

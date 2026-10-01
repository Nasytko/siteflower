'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  FulfillmentSettingsAdminDto,
  TimeWindowDto,
} from '@bouquet-one/contracts';
import { Button } from '@bouquet-one/ui';
import { adminGet, adminPatch, AdminRequestError, errorMessage } from '@/lib/admin-client';
import { FormSaveStatus, phaseFromAdminError, type FormSavePhase } from '@/components/admin/form-status';

const FULFILLMENT_SETTINGS_PATH = '/api/v1/admin/fulfillment/settings';

type Props = {
  initial: FulfillmentSettingsAdminDto;
  canUpdate: boolean;
};

export function FulfillmentSettingsEditor({ initial, canUpdate }: Props) {
  const router = useRouter();
  const [version, setVersion] = useState(initial.version);
  const [deliveryEnabled, setDeliveryEnabled] = useState(initial.deliveryEnabled);
  const [pickupEnabled, setPickupEnabled] = useState(initial.pickupEnabled);
  const [deliveryFeeMinor, setDeliveryFeeMinor] = useState(initial.deliveryFeeMinor);
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
    setDeliveryFeeMinor(updated.deliveryFeeMinor);
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
        deliveryFeeMinor,
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
      <fieldset className="space-y-3">
        <legend className="text-lg font-semibold">Методы</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={deliveryEnabled}
            disabled={!canUpdate}
            onChange={(e) => setDeliveryEnabled(e.target.checked)}
          />
          Доставка включена
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={pickupEnabled}
            disabled={!canUpdate}
            onChange={(e) => setPickupEnabled(e.target.checked)}
          />
          Самовывоз включён
        </label>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="col-span-full text-lg font-semibold">Параметры</legend>
        <label className="block text-sm">
          Стоимость доставки (копейки)
          <input
            value={deliveryFeeMinor}
            disabled={!canUpdate}
            onChange={(e) => setDeliveryFeeMinor(e.target.value.replace(/\D/g, ''))}
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Мин. lead time (мин)
          <input
            type="number"
            min={0}
            value={minLeadTimeMinutes}
            disabled={!canUpdate}
            onChange={(e) => setMinLeadTimeMinutes(e.target.value)}
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Горизонт заказа (дней)
          <input
            type="number"
            min={1}
            value={maxAdvanceDays}
            disabled={!canUpdate}
            onChange={(e) => setMaxAdvanceDays(e.target.value)}
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
          />
        </label>
      </fieldset>

      <label className="block text-sm">
        Инструкции самовывоза
        <textarea
          rows={3}
          value={pickupInstructions}
          disabled={!canUpdate}
          onChange={(e) => setPickupInstructions(e.target.value)}
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
        />
      </label>

      <fieldset className="space-y-2">
        <legend className="text-lg font-semibold">Окна времени</legend>
        <ul className="divide-y divide-stone-200">
          {timeWindows.map((w) => (
            <li key={w.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {w.label}{' '}
                <span className="text-stone-500">({w.appliesTo})</span>
              </span>
              <label className="flex items-center gap-2">
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
      </fieldset>

      {canUpdate ? (
        <Button type="submit" disabled={pending}>
          {pending ? 'Сохранение…' : 'Сохранить'}
        </Button>
      ) : (
        <p className="text-sm text-stone-500">Только просмотр</p>
      )}
    </form>
  );
}

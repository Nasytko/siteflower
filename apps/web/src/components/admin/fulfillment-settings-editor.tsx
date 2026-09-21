'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  FulfillmentSettingsAdminDto,
  TimeWindowDto,
} from '@bouquet-one/contracts';
import { Button } from '@bouquet-one/ui';

type Props = {
  initial: FulfillmentSettingsAdminDto;
  canUpdate: boolean;
};

async function mutate(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      origin: window.location.origin,
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      typeof body?.message === 'string'
        ? body.message
        : Array.isArray(body?.message)
          ? body.message.join(', ')
          : `Request failed (${response.status})`,
    );
  }
  return body as FulfillmentSettingsAdminDto;
}

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
  const [pending, setPending] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!canUpdate) return;
    setPending(true);
    setError(null);
    setSavedAt(null);
    try {
      const updated = await mutate('/api/v1/admin/fulfillment/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          expectedVersion: version,
          deliveryEnabled,
          pickupEnabled,
          deliveryFeeMinor,
          minLeadTimeMinutes: Number(minLeadTimeMinutes),
          maxAdvanceDays: Number(maxAdvanceDays),
          pickupInstructions: pickupInstructions.trim() || null,
          timeWindows,
        }),
      });
      setVersion(updated.version);
      setTimeWindows(updated.timeWindows);
      setSavedAt(new Date().toLocaleTimeString('ru-BY'));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
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

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {savedAt ? (
        <p className="text-sm text-green-700">Сохранено в {savedAt}</p>
      ) : null}

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

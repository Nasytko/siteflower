'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { StorefrontSettingsAdminDto } from '@bouquet-one/contracts';
import { Button } from '@bouquet-one/ui';

type Props = {
  initial: StorefrontSettingsAdminDto;
  canUpdate: boolean;
};

type FieldKey = Exclude<
  keyof StorefrontSettingsAdminDto,
  'version' | 'updatedAt'
>;

const FIELDS: Array<{ key: FieldKey; label: string; multiline?: boolean; required?: boolean }> = [
  { key: 'brandName', label: 'Бренд', required: true },
  { key: 'city', label: 'Город', required: true },
  { key: 'phone', label: 'Телефон' },
  { key: 'email', label: 'Email' },
  { key: 'address', label: 'Адрес' },
  { key: 'workingHours', label: 'Часы работы', multiline: true },
  { key: 'deliverySummary', label: 'Доставка (кратко)', multiline: true },
  { key: 'aboutSummary', label: 'О магазине', multiline: true },
  { key: 'instagramUrl', label: 'Instagram URL' },
  { key: 'telegramUrl', label: 'Telegram URL' },
  { key: 'substitutionNote', label: 'Замена цветов', multiline: true },
];

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
    const err = new Error(
      typeof body?.message === 'string'
        ? body.message
        : Array.isArray(body?.message)
          ? body.message.join(', ')
          : `Request failed (${response.status})`,
    ) as Error & { status?: number };
    err.status = response.status;
    throw err;
  }
  return body as StorefrontSettingsAdminDto;
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function StorefrontSettingsEditor({ initial, canUpdate }: Props) {
  const router = useRouter();
  const [version, setVersion] = useState(initial.version);
  const [form, setForm] = useState({
    brandName: initial.brandName,
    city: initial.city,
    phone: initial.phone ?? '',
    email: initial.email ?? '',
    address: initial.address ?? '',
    workingHours: initial.workingHours ?? '',
    deliverySummary: initial.deliverySummary ?? '',
    aboutSummary: initial.aboutSummary ?? '',
    instagramUrl: initial.instagramUrl ?? '',
    telegramUrl: initial.telegramUrl ?? '',
    substitutionNote: initial.substitutionNote ?? '',
  });
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
      const updated = await mutate('/api/v1/admin/storefront/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          expectedVersion: version,
          brandName: form.brandName.trim(),
          city: form.city.trim(),
          phone: emptyToNull(form.phone),
          email: emptyToNull(form.email),
          address: emptyToNull(form.address),
          workingHours: emptyToNull(form.workingHours),
          deliverySummary: emptyToNull(form.deliverySummary),
          aboutSummary: emptyToNull(form.aboutSummary),
          instagramUrl: emptyToNull(form.instagramUrl),
          telegramUrl: emptyToNull(form.telegramUrl),
          substitutionNote: emptyToNull(form.substitutionNote),
        }),
      });
      setVersion(updated.version);
      setForm({
        brandName: updated.brandName,
        city: updated.city,
        phone: updated.phone ?? '',
        email: updated.email ?? '',
        address: updated.address ?? '',
        workingHours: updated.workingHours ?? '',
        deliverySummary: updated.deliverySummary ?? '',
        aboutSummary: updated.aboutSummary ?? '',
        instagramUrl: updated.instagramUrl ?? '',
        telegramUrl: updated.telegramUrl ?? '',
        substitutionNote: updated.substitutionNote ?? '',
      });
      setSavedAt(new Date().toLocaleString('ru-BY'));
      router.refresh();
    } catch (err) {
      const status = err && typeof err === 'object' && 'status' in err ? Number(err.status) : 0;
      if (status === 409) {
        setError(
          'Конфликт версий (409): настройки изменены другим пользователем. Обновите страницу и сохраните снова.',
        );
      } else {
        setError(err instanceof Error ? err.message : 'Ошибка сохранения');
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSave} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        {FIELDS.map((field) => (
          <label
            key={field.key}
            className={`admin-field ${field.multiline ? 'md:col-span-2' : ''}`}
          >
            <span>{field.label}</span>
            {field.multiline ? (
              <textarea
                required={field.required}
                disabled={!canUpdate}
                rows={3}
                value={form[field.key]}
                onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                className="admin-input"
              />
            ) : (
              <input
                required={field.required}
                disabled={!canUpdate}
                value={form[field.key]}
                onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                className="admin-input"
              />
            )}
          </label>
        ))}
      </div>

      <div className="admin-savebar">
        {canUpdate ? (
          <Button type="submit" disabled={pending} className="!rounded-lg !bg-[var(--admin-brand)]">
            {pending ? 'Сохранение…' : 'Сохранить'}
          </Button>
        ) : (
          <p className="admin-help">Только просмотр: нет прав на изменение настроек.</p>
        )}
        {savedAt ? (
          <span className="text-sm text-[var(--admin-muted)]">Сохранено: {savedAt}</span>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="admin-error">
          {error}
        </p>
      ) : null}
    </form>
  );
}

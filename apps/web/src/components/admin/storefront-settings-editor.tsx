'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { StorefrontSettingsAdminDto } from '@bouquet-one/contracts';
import { Button } from '@bouquet-one/ui';
import {
  adminPatch,
  AdminRequestError,
  errorMessage,
} from '@/lib/admin-client';
import {
  FormSaveStatus,
  phaseFromAdminError,
  type FormSavePhase,
} from '@/components/admin/form-status';

type Props = {
  initial: StorefrontSettingsAdminDto;
  canUpdate: boolean;
};

type FieldKey = Exclude<keyof StorefrontSettingsAdminDto, 'version' | 'updatedAt'>;

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
  const [requestId, setRequestId] = useState<string | null>(null);
  const [phase, setPhase] = useState<FormSavePhase>('idle');
  const [pending, setPending] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!canUpdate) return;
    setPending(true);
    setError(null);
    setRequestId(null);
    setSavedAt(null);
    setPhase('saving');
    try {
      const updated = await adminPatch<StorefrontSettingsAdminDto>(
        '/api/v1/admin/storefront/settings',
        {
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
        },
      );
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
      setPhase('saved');
      router.refresh();
    } catch (err) {
      if (err instanceof AdminRequestError) {
        setPhase(phaseFromAdminError(err));
        setRequestId(err.requestId ?? null);
        setError(errorMessage(err, 'Не удалось сохранить настройки'));
      } else {
        setPhase('server');
        setError(errorMessage(err, 'Не удалось сохранить настройки'));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSave} className="space-y-6">
      <FormSaveStatus
        phase={phase === 'idle' && savedAt ? 'saved' : phase}
        savedLabel={savedAt ? `Настройки сохранены · ${savedAt}` : null}
        errorMessage={error}
        requestId={requestId}
        onRetry={() => {
          const formEl = document.querySelector('form');
          formEl?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }}
        onRefresh={() => router.refresh()}
        onDismiss={() => {
          setError(null);
          setPhase(savedAt ? 'saved' : 'idle');
        }}
      />

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
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, [field.key]: e.target.value }));
                  if (phase === 'saved') setPhase('dirty');
                }}
                className="admin-input"
              />
            ) : (
              <input
                required={field.required}
                disabled={!canUpdate}
                value={form[field.key]}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, [field.key]: e.target.value }));
                  if (phase === 'saved') setPhase('dirty');
                }}
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
      </div>
    </form>
  );
}

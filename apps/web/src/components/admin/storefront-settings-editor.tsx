'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { StorefrontSettingsAdminDto } from '@bouquet-one/contracts';
import { Button } from '@bouquet-one/ui';
import {
  adminGet,
  adminPatch,
  AdminRequestError,
  errorMessage,
} from '@/lib/admin-client';
import { adminEndpoints } from '@/lib/admin-endpoints';
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

type Field = {
  key: FieldKey;
  label: string;
  multiline?: boolean;
  required?: boolean;
  hint?: string;
  placeholder?: string;
};

const FIELD_GROUPS: Array<{ title: string; hint?: string; fields: Field[] }> = [
  {
    title: 'Магазин и контакты',
    fields: [
      { key: 'brandName', label: 'Бренд', required: true },
      { key: 'city', label: 'Город', required: true },
      { key: 'phone', label: 'Телефон' },
      { key: 'email', label: 'Email' },
      { key: 'address', label: 'Адрес', hint: 'Показывается на карточке товара в блоке «Самовывоз».' },
      { key: 'workingHours', label: 'Часы работы', multiline: true },
      { key: 'deliverySummary', label: 'Доставка (кратко)', multiline: true },
      { key: 'aboutSummary', label: 'О магазине', multiline: true },
      { key: 'instagramUrl', label: 'Instagram URL' },
      { key: 'telegramUrl', label: 'Telegram URL', hint: 'Кнопка «Заказать в Telegram» на карточке товара.' },
      {
        key: 'whatsappUrl',
        label: 'WhatsApp URL',
        placeholder: 'https://wa.me/375XXXXXXXXX',
        hint: 'Кнопка «Заказать в WhatsApp» на карточке товара. Пусто — кнопка скрыта.',
      },
    ],
  },
  {
    title: 'Карточка товара',
    hint: 'Пустое поле — блок на карточке товара не показывается.',
    fields: [
      {
        key: 'outOfCityDeliveryNote',
        label: 'Доставка за город',
        placeholder: 'согласовывается с менеджером',
      },
      {
        key: 'photoReportNote',
        label: 'Фото перед отправкой',
        placeholder: 'по вашему желанию',
      },
      { key: 'substitutionNote', label: 'Замена цветов', multiline: true },
      {
        key: 'packagingNote',
        label: 'Упаковка',
        multiline: true,
        placeholder: 'Дизайнерская бумага, лента, фирменная карточка',
      },
      {
        key: 'packagingImageUrl',
        label: 'Фото упаковки (URL)',
        hint: 'Ссылка на изображение из медиатеки или /public.',
      },
    ],
  },
];

const FIELDS: Field[] = FIELD_GROUPS.flatMap((group) => group.fields);

type FormState = Record<FieldKey, string>;

function toForm(settings: StorefrontSettingsAdminDto): FormState {
  return Object.fromEntries(
    FIELDS.map((field) => [field.key, settings[field.key] ?? '']),
  ) as FormState;
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function StorefrontSettingsEditor({ initial, canUpdate }: Props) {
  const router = useRouter();
  const [version, setVersion] = useState(initial.version);
  const [form, setForm] = useState<FormState>(() => toForm(initial));
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [phase, setPhase] = useState<FormSavePhase>('idle');
  const [pending, setPending] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  function applySettings(updated: StorefrontSettingsAdminDto) {
    setVersion(updated.version);
    setForm(toForm(updated));
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
      const updated = await adminPatch<StorefrontSettingsAdminDto>(
        '/api/v1/admin/storefront/settings',
        {
          ...Object.fromEntries(FIELDS.map((field) => [field.key, emptyToNull(form[field.key])])),
          expectedVersion: version,
          brandName: form.brandName.trim(),
          city: form.city.trim(),
        },
      );
      applySettings(updated);
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
        onRefresh={() => {
          void (async () => {
            try {
              const fresh = await adminGet<StorefrontSettingsAdminDto>(
                adminEndpoints.storefrontSettings,
              );
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

      {FIELD_GROUPS.map((group) => (
        <fieldset key={group.title} className="space-y-3">
          <legend className="text-sm font-semibold">{group.title}</legend>
          {group.hint ? <p className="admin-help">{group.hint}</p> : null}
          <div className="grid gap-4 md:grid-cols-2">
            {group.fields.map((field) => (
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
                    placeholder={field.placeholder}
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
                    placeholder={field.placeholder}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, [field.key]: e.target.value }));
                      if (phase === 'saved') setPhase('dirty');
                    }}
                    className="admin-input"
                  />
                )}
                {field.hint ? <small className="admin-help">{field.hint}</small> : null}
              </label>
            ))}
          </div>
        </fieldset>
      ))}

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

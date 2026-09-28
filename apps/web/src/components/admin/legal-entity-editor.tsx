'use client';

import { FormEvent, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { LegalEntitySettingsDto } from '@bouquet-one/contracts';
import { Button } from '@bouquet-one/ui';
import { errorMessage } from '@/lib/admin-client';
import { legalClientApi } from '@/lib/admin-legal-client';

type Props = {
  initial: LegalEntitySettingsDto;
  canPublish: boolean;
};

type FormState = {
  sellerType: string;
  legalName: string;
  unp: string;
  legalAddress: string;
  postalCode: string;
  stateRegistrationDate: string;
  stateRegistrationNumber: string;
  registeringAuthority: string;
  tradeRegisterNumber: string;
  tradeRegisterDate: string;
  sellerPhone: string;
  sellerEmail: string;
  businessHours: string;
  consumerClaimsContactName: string;
  consumerClaimsPhone: string;
  consumerClaimsEmail: string;
  physicalStoreAddress: string;
  pickupAddress: string;
  actualOfflinePaymentDescription: string;
  failedDeliveryPolicy: string;
  bankAccountIban: string;
  bankName: string;
  bankAddress: string;
  bankSwift: string;
  bankUnp: string;
};

function toForm(entity: LegalEntitySettingsDto): FormState {
  return {
    sellerType: entity.sellerType,
    legalName: entity.legalName,
    unp: entity.unp,
    legalAddress: entity.legalAddress,
    postalCode: entity.postalCode ?? '',
    stateRegistrationDate: entity.stateRegistrationDate ?? '',
    stateRegistrationNumber: entity.stateRegistrationNumber ?? '',
    registeringAuthority: entity.registeringAuthority ?? '',
    tradeRegisterNumber: entity.tradeRegisterNumber ?? '',
    tradeRegisterDate: entity.tradeRegisterDate ?? '',
    sellerPhone: entity.sellerPhone ?? '',
    sellerEmail: entity.sellerEmail ?? '',
    businessHours: entity.businessHours ?? '',
    consumerClaimsContactName: entity.consumerClaimsContactName ?? '',
    consumerClaimsPhone: entity.consumerClaimsPhone ?? '',
    consumerClaimsEmail: entity.consumerClaimsEmail ?? '',
    physicalStoreAddress: entity.physicalStoreAddress ?? '',
    pickupAddress: entity.pickupAddress ?? '',
    actualOfflinePaymentDescription: entity.actualOfflinePaymentDescription ?? '',
    failedDeliveryPolicy: entity.failedDeliveryPolicy ?? '',
    bankAccountIban: entity.bankAccountIban ?? '',
    bankName: entity.bankName ?? '',
    bankAddress: entity.bankAddress ?? '',
    bankSwift: entity.bankSwift ?? '',
    bankUnp: entity.bankUnp ?? '',
  };
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function Card({
  title,
  lead,
  required,
  children,
}: {
  title: string;
  lead?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="admin-subsection">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="admin-subsection__title !mb-0">{title}</h2>
        {required ? (
          <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-900">
            Требует заполнения
          </span>
        ) : null}
      </div>
      {lead ? <p className="mb-3 text-sm text-[var(--admin-muted)]">{lead}</p> : null}
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  multiline,
  hint,
  span,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  multiline?: boolean;
  hint?: string;
  span?: boolean;
  type?: string;
}) {
  return (
    <label className={`admin-field ${span || multiline ? 'md:col-span-2' : ''}`}>
      <span>{label}</span>
      {multiline ? (
        <textarea
          disabled={disabled}
          rows={4}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="admin-input"
        />
      ) : (
        <input
          type={type}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="admin-input"
        />
      )}
      {hint ? <span className="admin-field__hint">{hint}</span> : null}
    </label>
  );
}

export function LegalEntityEditor({ initial, canPublish }: Props) {
  const router = useRouter();
  const [version, setVersion] = useState(initial.version);
  const [form, setForm] = useState<FormState>(() => toForm(initial));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!canPublish) return;
    setPending(true);
    setError(null);
    setSavedAt(null);
    try {
      const updated = await legalClientApi.patchEntity({
        expectedVersion: version,
        sellerType: form.sellerType.trim(),
        legalName: form.legalName.trim(),
        unp: form.unp.trim(),
        legalAddress: form.legalAddress.trim(),
        postalCode: emptyToNull(form.postalCode),
        stateRegistrationDate: emptyToNull(form.stateRegistrationDate),
        stateRegistrationNumber: emptyToNull(form.stateRegistrationNumber),
        registeringAuthority: emptyToNull(form.registeringAuthority),
        tradeRegisterNumber: emptyToNull(form.tradeRegisterNumber),
        tradeRegisterDate: emptyToNull(form.tradeRegisterDate),
        sellerPhone: emptyToNull(form.sellerPhone),
        sellerEmail: emptyToNull(form.sellerEmail),
        businessHours: emptyToNull(form.businessHours),
        consumerClaimsContactName: emptyToNull(form.consumerClaimsContactName),
        consumerClaimsPhone: emptyToNull(form.consumerClaimsPhone),
        consumerClaimsEmail: emptyToNull(form.consumerClaimsEmail),
        physicalStoreAddress: emptyToNull(form.physicalStoreAddress),
        pickupAddress: emptyToNull(form.pickupAddress),
        actualOfflinePaymentDescription: emptyToNull(form.actualOfflinePaymentDescription),
        failedDeliveryPolicy: emptyToNull(form.failedDeliveryPolicy),
        bankAccountIban: emptyToNull(form.bankAccountIban),
        bankName: emptyToNull(form.bankName),
        bankAddress: emptyToNull(form.bankAddress),
        bankSwift: emptyToNull(form.bankSwift),
        bankUnp: emptyToNull(form.bankUnp),
      });
      setVersion(updated.version);
      setForm(toForm(updated));
      setSavedAt(new Date().toLocaleString('ru-BY'));
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, 'Ошибка сохранения'));
    } finally {
      setPending(false);
    }
  }

  const readOnly = !canPublish;

  return (
    <form onSubmit={onSave} className="space-y-4">
      <Card title="Продавец" lead="Юридические данные продавца для витрины и оферты.">
        <Field
          label="Тип продавца"
          value={form.sellerType}
          onChange={(v) => setField('sellerType', v)}
          disabled={readOnly}
          hint="Например INDIVIDUAL_ENTREPRENEUR"
        />
        <Field
          label="УНП"
          value={form.unp}
          onChange={(v) => setField('unp', v)}
          disabled={readOnly}
        />
        <Field
          label="Полное наименование"
          value={form.legalName}
          onChange={(v) => setField('legalName', v)}
          disabled={readOnly}
          span
        />
        <Field
          label="Юридический адрес"
          value={form.legalAddress}
          onChange={(v) => setField('legalAddress', v)}
          disabled={readOnly}
          multiline
        />
        <Field
          label="Индекс"
          value={form.postalCode}
          onChange={(v) => setField('postalCode', v)}
          disabled={readOnly}
        />
      </Card>

      <Card
        title="Госрегистрация"
        lead="Сведения из свидетельства о государственной регистрации. Не заполняйте наугад."
        required={!form.stateRegistrationDate.trim() || !form.registeringAuthority.trim()}
      >
        <Field
          label="Дата регистрации"
          value={form.stateRegistrationDate}
          onChange={(v) => setField('stateRegistrationDate', v)}
          disabled={readOnly}
          hint="Как в документе, например 2024-03-15"
        />
        <Field
          label="Номер регистрации"
          value={form.stateRegistrationNumber}
          onChange={(v) => setField('stateRegistrationNumber', v)}
          disabled={readOnly}
        />
        <Field
          label="Регистрирующий орган"
          value={form.registeringAuthority}
          onChange={(v) => setField('registeringAuthority', v)}
          disabled={readOnly}
          span
        />
      </Card>

      <Card
        title="Торговый реестр"
        lead="Номер и дата включения в Торговый реестр Республики Беларусь. Оставьте пустым, пока нет точных данных."
        required={!form.tradeRegisterNumber.trim() || !form.tradeRegisterDate.trim()}
      >
        <Field
          label="Номер в торговом реестре"
          value={form.tradeRegisterNumber}
          onChange={(v) => setField('tradeRegisterNumber', v)}
          disabled={readOnly}
        />
        <Field
          label="Дата включения"
          value={form.tradeRegisterDate}
          onChange={(v) => setField('tradeRegisterDate', v)}
          disabled={readOnly}
        />
      </Card>

      <Card title="Контакты продавца" lead="Публичные контакты; при пустых полях могут подставляться настройки витрины.">
        <Field
          label="Телефон"
          value={form.sellerPhone}
          onChange={(v) => setField('sellerPhone', v)}
          disabled={readOnly}
          type="tel"
        />
        <Field
          label="Email"
          value={form.sellerEmail}
          onChange={(v) => setField('sellerEmail', v)}
          disabled={readOnly}
          type="email"
        />
        <Field
          label="Часы работы"
          value={form.businessHours}
          onChange={(v) => setField('businessHours', v)}
          disabled={readOnly}
          multiline
        />
      </Card>

      <Card
        title="Обращения покупателей"
        lead="Куда писать претензии и вопросы по заказам. Можно совпадать с контактами продавца."
      >
        <Field
          label="Контактное лицо"
          value={form.consumerClaimsContactName}
          onChange={(v) => setField('consumerClaimsContactName', v)}
          disabled={readOnly}
        />
        <Field
          label="Телефон для обращений"
          value={form.consumerClaimsPhone}
          onChange={(v) => setField('consumerClaimsPhone', v)}
          disabled={readOnly}
          type="tel"
        />
        <Field
          label="Email для обращений"
          value={form.consumerClaimsEmail}
          onChange={(v) => setField('consumerClaimsEmail', v)}
          disabled={readOnly}
          type="email"
          span
        />
      </Card>

      <Card
        title="Магазин и самовывоз"
        lead="Фактический адрес точки и пункт выдачи — отдельно от юридического адреса."
      >
        <Field
          label="Адрес магазина / точки"
          value={form.physicalStoreAddress}
          onChange={(v) => setField('physicalStoreAddress', v)}
          disabled={readOnly}
          multiline
        />
        <Field
          label="Адрес самовывоза"
          value={form.pickupAddress}
          onChange={(v) => setField('pickupAddress', v)}
          disabled={readOnly}
          multiline
          hint="Не путать с юр. адресом ИП"
        />
      </Card>

      <Card title="Банковские реквизиты">
        <Field
          label="IBAN"
          value={form.bankAccountIban}
          onChange={(v) => setField('bankAccountIban', v)}
          disabled={readOnly}
          span
        />
        <Field
          label="Банк"
          value={form.bankName}
          onChange={(v) => setField('bankName', v)}
          disabled={readOnly}
        />
        <Field
          label="SWIFT"
          value={form.bankSwift}
          onChange={(v) => setField('bankSwift', v)}
          disabled={readOnly}
        />
        <Field
          label="Адрес банка"
          value={form.bankAddress}
          onChange={(v) => setField('bankAddress', v)}
          disabled={readOnly}
          multiline
        />
        <Field
          label="УНП банка"
          value={form.bankUnp}
          onChange={(v) => setField('bankUnp', v)}
          disabled={readOnly}
        />
      </Card>

      <Card
        title="Офлайн-оплата и недоставка"
        lead="Только фактические способы оплаты и реальная политика при сбое доставки — без выдуманных вариантов."
        required={!form.actualOfflinePaymentDescription.trim()}
      >
        <Field
          label="Описание офлайн-оплаты"
          value={form.actualOfflinePaymentDescription}
          onChange={(v) => setField('actualOfflinePaymentDescription', v)}
          disabled={readOnly}
          multiline
        />
        <Field
          label="Политика при неудачной доставке"
          value={form.failedDeliveryPolicy}
          onChange={(v) => setField('failedDeliveryPolicy', v)}
          disabled={readOnly}
          multiline
        />
      </Card>

      <div className="admin-savebar">
        {canPublish ? (
          <Button type="submit" disabled={pending} className="!rounded-lg !bg-[var(--admin-brand)]">
            {pending ? 'Сохранение…' : 'Сохранить'}
          </Button>
        ) : (
          <p className="admin-help">
            Только просмотр: для изменения данных продавца нужно право LEGAL_PUBLISH.
          </p>
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

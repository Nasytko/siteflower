/**
 * Belarus commerce legal / compliance contracts.
 * Not legal advice — configuration + document DTOs only.
 */

export const LEGAL_DOCUMENT_KINDS = [
  'ORDER_TERMS',
  'PRIVACY_POLICY',
  'RETURNS_POLICY',
  'DELIVERY_PAYMENT',
  'SUBSTITUTION_POLICY',
] as const;

export type LegalDocumentKind = (typeof LEGAL_DOCUMENT_KINDS)[number];

export const LEGAL_DOCUMENT_VERSION_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
export type LegalDocumentVersionStatus = (typeof LEGAL_DOCUMENT_VERSION_STATUSES)[number];

export const LEGAL_DOCUMENT_KIND_LABELS: Record<LegalDocumentKind, string> = {
  ORDER_TERMS: 'Условия заказа (публичная оферта)',
  PRIVACY_POLICY: 'Политика обработки персональных данных',
  RETURNS_POLICY: 'Возврат, отмена и претензии',
  DELIVERY_PAYMENT: 'Доставка и оплата (пояснения)',
  SUBSTITUTION_POLICY: 'Замена цветов и соответствие фото',
};

export const LEGAL_DOCUMENT_PUBLIC_PATHS: Record<LegalDocumentKind, string> = {
  ORDER_TERMS: '/oferta',
  PRIVACY_POLICY: '/privacy',
  RETURNS_POLICY: '/vozvrat',
  DELIVERY_PAYMENT: '/dostavka',
  SUBSTITUTION_POLICY: '/oferta',
};

/** Owner-provided seller defaults (business config, not secrets). */
export const OWNER_PROVIDED_SELLER = {
  sellerType: 'INDIVIDUAL_ENTREPRENEUR' as const,
  legalName: 'Индивидуальный предприниматель Олизар Антон Геннадьевич',
  unp: '591673107',
  legalAddress:
    '231606, Республика Беларусь, Гродненская область, Мостовский район, деревня Каменчаны, дом 17',
  postalCode: '231606',
  bankAccountIban: 'BY31POIS30130185611201933001',
  bankName: 'ОАО «Паритетбанк»',
  bankAddress: '220002, г. Минск, ул. Киселева, 61А',
  bankSwift: 'POISBY2X',
  bankUnp: '100233809',
};

export type LegalEntitySettingsDto = {
  sellerType: string;
  legalName: string;
  unp: string;
  legalAddress: string;
  postalCode: string | null;
  stateRegistrationDate: string | null;
  stateRegistrationNumber: string | null;
  registeringAuthority: string | null;
  tradeRegisterNumber: string | null;
  tradeRegisterDate: string | null;
  sellerPhone: string | null;
  sellerEmail: string | null;
  businessHours: string | null;
  consumerClaimsContactName: string | null;
  consumerClaimsPhone: string | null;
  consumerClaimsEmail: string | null;
  physicalStoreAddress: string | null;
  pickupAddress: string | null;
  actualOfflinePaymentDescription: string | null;
  failedDeliveryPolicy: string | null;
  bankAccountIban: string | null;
  bankName: string | null;
  bankAddress: string | null;
  bankSwift: string | null;
  bankUnp: string | null;
  version: number;
  updatedAt: string;
};

export type UpdateLegalEntitySettingsDto = Partial<
  Omit<LegalEntitySettingsDto, 'version' | 'updatedAt'>
> & {
  expectedVersion: number;
};

/** Public contacts page — bank only when requested separately. */
export type LegalSellerPublicDto = {
  brandName: string;
  city: string;
  siteUrl: string | null;
  legalName: string;
  unp: string;
  legalAddress: string;
  postalCode: string | null;
  stateRegistrationDate: string | null;
  stateRegistrationNumber: string | null;
  registeringAuthority: string | null;
  tradeRegisterNumber: string | null;
  tradeRegisterDate: string | null;
  phone: string | null;
  email: string | null;
  businessHours: string | null;
  physicalStoreAddress: string | null;
  pickupAddress: string | null;
  consumerClaimsContactName: string | null;
  consumerClaimsPhone: string | null;
  consumerClaimsEmail: string | null;
  actualOfflinePaymentDescription: string | null;
  failedDeliveryPolicy: string | null;
  substitutionNote: string | null;
};

export type LegalBankPublicDto = {
  legalName: string;
  unp: string;
  bankAccountIban: string | null;
  bankName: string | null;
  bankAddress: string | null;
  bankSwift: string | null;
  bankUnp: string | null;
};

export type LegalDocumentVersionDto = {
  id: string;
  documentId: string;
  kind: LegalDocumentKind;
  version: number;
  status: LegalDocumentVersionStatus;
  title: string;
  bodyMarkdown: string;
  effectiveAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LegalDocumentAdminDto = {
  id: string;
  kind: LegalDocumentKind;
  title: string;
  draft: LegalDocumentVersionDto | null;
  published: LegalDocumentVersionDto | null;
  updatedAt: string;
};

export type LegalDocumentPublicDto = {
  kind: LegalDocumentKind;
  title: string;
  bodyMarkdown: string;
  version: number;
  effectiveAt: string | null;
  publishedAt: string | null;
};

export type ComplianceItemStatus = 'ok' | 'missing' | 'draft' | 'warn';

export type ComplianceItemDto = {
  id: string;
  label: string;
  status: ComplianceItemStatus;
  detail: string | null;
  adminHref: string | null;
};

export type ComplianceStatusDto = {
  readyForProduction: boolean;
  items: ComplianceItemDto[];
  missingRequiredCount: number;
  legalReviewFlags: string[];
};

export function defaultLegalEntitySettings(): Omit<
  LegalEntitySettingsDto,
  'version' | 'updatedAt'
> {
  return {
    sellerType: OWNER_PROVIDED_SELLER.sellerType,
    legalName: OWNER_PROVIDED_SELLER.legalName,
    unp: OWNER_PROVIDED_SELLER.unp,
    legalAddress: OWNER_PROVIDED_SELLER.legalAddress,
    postalCode: OWNER_PROVIDED_SELLER.postalCode,
    stateRegistrationDate: null,
    stateRegistrationNumber: null,
    registeringAuthority: null,
    tradeRegisterNumber: null,
    tradeRegisterDate: null,
    sellerPhone: null,
    sellerEmail: null,
    businessHours: null,
    consumerClaimsContactName: null,
    consumerClaimsPhone: null,
    consumerClaimsEmail: null,
    physicalStoreAddress: null,
    pickupAddress: null,
    actualOfflinePaymentDescription: null,
    failedDeliveryPolicy: null,
    bankAccountIban: OWNER_PROVIDED_SELLER.bankAccountIban,
    bankName: OWNER_PROVIDED_SELLER.bankName,
    bankAddress: OWNER_PROVIDED_SELLER.bankAddress,
    bankSwift: OWNER_PROVIDED_SELLER.bankSwift,
    bankUnp: OWNER_PROVIDED_SELLER.bankUnp,
  };
}

export function buildComplianceStatus(input: {
  entity: LegalEntitySettingsDto;
  /** Fallback shop contacts from StorefrontSettings */
  storefrontPhone: string | null;
  storefrontEmail: string | null;
  storefrontHours: string | null;
  pickupEnabled: boolean;
  documents: Array<{
    kind: LegalDocumentKind;
    hasPublished: boolean;
    hasDraft: boolean;
  }>;
}): ComplianceStatusDto {
  const e = input.entity;
  const phone = e.sellerPhone?.trim() || input.storefrontPhone?.trim() || null;
  const email = e.sellerEmail?.trim() || input.storefrontEmail?.trim() || null;
  const hours = e.businessHours?.trim() || input.storefrontHours?.trim() || null;

  const items: ComplianceItemDto[] = [
    {
      id: 'seller',
      label: 'Данные продавца',
      status: e.legalName && e.unp && e.legalAddress ? 'ok' : 'missing',
      detail: null,
      adminHref: '/admin/legal',
    },
    {
      id: 'state_registration',
      label: 'Государственная регистрация',
      status:
        e.stateRegistrationDate && e.registeringAuthority ? 'ok' : 'missing',
      detail: 'Требует заполнения перед запуском',
      adminHref: '/admin/legal',
    },
    {
      id: 'trade_register',
      label: 'Торговый реестр',
      status: e.tradeRegisterNumber && e.tradeRegisterDate ? 'ok' : 'missing',
      detail: 'Требует заполнения перед запуском',
      adminHref: '/admin/legal',
    },
    {
      id: 'bank',
      label: 'Банковские реквизиты',
      status:
        e.bankAccountIban && e.bankName && e.bankSwift && e.bankUnp ? 'ok' : 'missing',
      detail: null,
      adminHref: '/admin/legal',
    },
    {
      id: 'seller_phone',
      label: 'Телефон продавца',
      status: phone ? 'ok' : 'missing',
      detail: phone ? null : 'Требует заполнения перед запуском',
      adminHref: '/admin/legal',
    },
    {
      id: 'seller_email',
      label: 'Email продавца',
      status: email ? 'ok' : 'missing',
      detail: email ? null : 'Требует заполнения перед запуском',
      adminHref: '/admin/legal',
    },
    {
      id: 'business_hours',
      label: 'Часы работы',
      status: hours ? 'ok' : 'missing',
      detail: hours ? null : 'Требует заполнения перед запуском',
      adminHref: '/admin/legal',
    },
    {
      id: 'claims',
      label: 'Обращения покупателей',
      status:
        e.consumerClaimsPhone || e.consumerClaimsEmail || phone || email
          ? 'ok'
          : 'missing',
      detail: null,
      adminHref: '/admin/legal',
    },
    {
      id: 'pickup_address',
      label: 'Адрес самовывоза',
      status: !input.pickupEnabled
        ? 'ok'
        : e.pickupAddress?.trim()
          ? 'ok'
          : 'missing',
      detail: input.pickupEnabled && !e.pickupAddress?.trim()
        ? 'Самовывоз включён — укажите адрес пункта выдачи (не путать с юр. адресом)'
        : null,
      adminHref: '/admin/legal',
    },
    {
      id: 'offline_payment',
      label: 'Описание офлайн-оплаты',
      status: e.actualOfflinePaymentDescription?.trim() ? 'ok' : 'missing',
      detail: 'Требует заполнения перед запуском — без выдуманных способов оплаты',
      adminHref: '/admin/legal',
    },
  ];

  for (const doc of input.documents) {
    const label = LEGAL_DOCUMENT_KIND_LABELS[doc.kind];
    items.push({
      id: `doc_${doc.kind}`,
      label,
      status: doc.hasPublished ? 'ok' : doc.hasDraft ? 'draft' : 'missing',
      detail: doc.hasPublished
        ? null
        : doc.hasDraft
          ? 'Есть черновик — нужна публикация'
          : 'Требует заполнения перед запуском',
      adminHref: `/admin/legal/documents/${doc.kind.toLowerCase()}`,
    });
  }

  const missingRequiredCount = items.filter(
    (i) => i.status === 'missing' || i.status === 'draft',
  ).length;

  return {
    readyForProduction: missingRequiredCount === 0,
    items,
    missingRequiredCount,
    legalReviewFlags: BELARUS_LEGAL_REVIEW_FLAGS,
  };
}

/** Clauses that need human Belarusian legal review before production. */
export const BELARUS_LEGAL_REVIEW_FLAGS: string[] = [
  'Момент заключения договора / акцепта оферты при схеме «заказ → проверка менеджером».',
  'Формулировки возврата/обмена для живых цветов и растений.',
  'Отмена заказа после начала сборки букета.',
  'Политика замены цветов и соответствие фотографиям.',
  'Правовое основание и уведомление при обработке данных получателя (третье лицо).',
  'Сроки хранения заказов и персональных данных (сейчас технически бессрочно).',
  'Фактические офлайн-способы оплаты (не выдумывать на сайте).',
  'Сведения о включении в Торговый реестр.',
  'Сведения о государственной регистрации ИП.',
];

export function isLegalDocumentKind(value: string): value is LegalDocumentKind {
  return (LEGAL_DOCUMENT_KINDS as readonly string[]).includes(value);
}

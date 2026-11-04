import {
  OWNER_PROVIDED_SELLER,
  type LegalBankPublicDto,
  type LegalDocumentKind,
  type LegalDocumentPublicDto,
  type LegalSellerPublicDto,
  type StorefrontSettingsPublicDto,
} from '@bouquet-one/contracts';

/** Fixed seller identity — not editable in admin. */
export const FIXED_SELLER = {
  ...OWNER_PROVIDED_SELLER,
  brandName: 'BUKET №1',
  city: 'Гродно',
  pickupAddress: null as string | null,
  actualOfflinePaymentDescription:
    'Оплата после согласования заказа с менеджером: наличные при получении или банковский перевод по реквизитам на странице «Контакты». Онлайн-оплата на сайте не принимается.',
  failedDeliveryPolicy:
    'Если получатель недоступен по согласованному адресу, менеджер связывается с заказчиком для повторной доставки или самовывоза.',
} as const;

const SELLER_BLOCK = `**Продавец:** ${FIXED_SELLER.legalName}  
**УНП:** ${FIXED_SELLER.unp}  
**Юридический адрес:** ${FIXED_SELLER.legalAddress}`;

const EFFECTIVE_AT = '2026-01-01T00:00:00.000Z';

type FixedDoc = {
  title: string;
  bodyMarkdown: string;
};

const ORDER_TERMS: FixedDoc = {
  title: 'Условия заказа (публичная оферта)',
  bodyMarkdown: `${SELLER_BLOCK}

Торговая марка / витрина сайта: **БУКЕТ №1** (город Гродно).

## 1. Предмет

Настоящие условия регулируют оформление заказов букетов и сопутствующих товаров через интернет-витрину Продавца. Цены на сайте действительны на момент просмотра (с учётом акций, если они явно указаны).

## 2. Как оформляется заказ

1. Покупатель выбирает товары, заполняет форму заказа и отправляет заявку.
2. После отправки заказ получает статус **«получен»**: заявка принята системой, но ещё не согласована.
3. Менеджер связывается с Покупателем, уточняет состав, дату и время, доставку или самовывоз и способ оплаты.
4. Только после согласования менеджером заказ считается подтверждённым к исполнению.

## 3. Оплата

**Онлайн-оплата на сайте не принимается.**  
Оплата производится офлайн после согласования заказа: наличные при получении и/или банковский перевод по реквизитам Продавца. Конкретный способ подтверждает менеджер.

## 4. Доставка и самовывоз

Условия доставки по Гродно и самовывоза, сроки подготовки и интервалы времени уточняются при подтверждении заказа и на странице «Доставка и оплата».

## 5. Замена цветов и соответствие фото

Цветы — сезонный живой товар. Отдельные позиции могут быть заменены на равноценные при сохранении стиля, палитры, объёма и стоимости. Фото на сайте — пример сборки; живой букет может иметь естественные отличия формы и раскрытия бутонов. Существенная замена согласуется с заказчиком до исполнения.

## 6. Отмена

Отмена до подтверждения менеджером обычно возможна. После начала сборки условия отмены и компенсации согласуются индивидуально.

## 7. Контакты

Актуальные телефон, email и часы работы — на странице «Контакты».
`,
};

const PRIVACY_POLICY: FixedDoc = {
  title: 'Политика обработки персональных данных',
  bodyMarkdown: `${SELLER_BLOCK}

Оператор персональных данных — указанный выше индивидуальный предприниматель (далее — Оператор), витрина **БУКЕТ №1**.

## 1. Какие данные мы обрабатываем

- данные заказчика (имя, телефон, при наличии — email и комментарий);
- данные получателя, если заказ оформляется на другое лицо (имя, телефон, адрес доставки);
- технические данные, необходимые для работы сайта и защиты от злоупотреблений.

## 2. Зачем нужны данные

Данные используются для приёма и исполнения заказа, обработки обращений и исполнения обязанностей по законодательству Республики Беларусь.

## 3. Данные получателя

Если заказчик указывает данные получателя букета, Оператор обрабатывает их только в объёме, необходимом для доставки или выдачи заказа, и не использует для посторонней рекламной рассылки без законного основания.

## 4. Передача третьим лицам

Данные передаются только в объёме, нужном для исполнения заказа (например, курьеру), или по требованию уполномоченных органов в случаях, предусмотренных законом.

## 5. Срок хранения

Данные хранятся столько, сколько необходимо для исполнения заказов, учёта и законных обязанностей Оператора.

## 6. Права субъекта данных

Субъект персональных данных вправе обращаться к Оператору по вопросам доступа, уточнения, блокирования или удаления данных в пределах закона. Контакты — на странице «Контакты».

## 7. Изменения политики

Актуальная версия размещается на этой странице сайта.
`,
};

const RETURNS_POLICY: FixedDoc = {
  title: 'Возврат, отмена и претензии',
  bodyMarkdown: `${SELLER_BLOCK}

## 1. Общие принципы

Мы рассматриваем обращения по существу: свежесть цветов, соответствие согласованному составу, сроки и качество сборки. Живые цветы — скоропортящийся товар с особыми свойствами; это не означает автоматический отказ в любом обращении.

## 2. Отмена заказа

- **До подтверждения менеджером.** Заявку обычно можно отменить, связавшись с магазином.
- **После подтверждения и/или начала сборки.** Возможность отмены и компенсация согласуются индивидуально.

## 3. Претензии по качеству и составу

Если букет повреждён, существенно не соответствует согласованному описанию или фото (с учётом допустимой замены) либо доставлен с нарушением согласованных условий, обратитесь как можно скорее после получения — предпочтительно с фотографиями.

Возможные решения: замена, доработка, повторная доставка, возврат оплаты уже оплаченного офлайн заказа или иной согласованный вариант.

## 4. Когда претензия может быть отклонена

Например: естественное увядание по истечении разумного срока после вручения; повреждение по вине получателя после передачи; отказ от получения без уважительной причины при надлежащем исполнении; расхождения, заранее согласованные как допустимая замена.

## 5. Как обратиться

Контакты для обращений — на странице «Контакты». Укажите номер заказа, суть вопроса и, по возможности, фото.
`,
};

const DELIVERY_PAYMENT: FixedDoc = {
  title: 'Доставка и оплата',
  bodyMarkdown: `${SELLER_BLOCK}

Витрина: **БУКЕТ №1**, город Гродно.

## 1. Оплата

На сайте нет онлайн-оплаты. Отправка формы заказа не списывает средства.

Оплата — после согласования с менеджером: наличные при получении или банковский перевод по реквизитам на странице «Контакты».

## 2. Доставка

Доставка по Гродно в согласованный интервал. Стоимость и окна времени показываются при оформлении и/или уточняются менеджером.

## 3. Самовывоз

Если самовывоз доступен, адрес и время готовности сообщает менеджер после подтверждения заказа.

## 4. Статусы заказа

После отправки формы заказ **получен** магазином. Подтверждение, сборка и доставка/выдача отражаются последующими статусами.
`,
};

export type FixedLegalDocKey = 'order_terms' | 'privacy_policy' | 'returns_policy' | 'delivery_payment';

const DOC_KIND: Record<FixedLegalDocKey, LegalDocumentKind> = {
  order_terms: 'ORDER_TERMS',
  privacy_policy: 'PRIVACY_POLICY',
  returns_policy: 'RETURNS_POLICY',
  delivery_payment: 'DELIVERY_PAYMENT',
};

const DOCS: Record<FixedLegalDocKey, FixedDoc> = {
  order_terms: ORDER_TERMS,
  privacy_policy: PRIVACY_POLICY,
  returns_policy: RETURNS_POLICY,
  delivery_payment: DELIVERY_PAYMENT,
};

/** Build a public legal document DTO from the in-code template. */
export function getFixedLegalDocument(key: FixedLegalDocKey): LegalDocumentPublicDto {
  const doc = DOCS[key];
  return {
    kind: DOC_KIND[key],
    title: doc.title,
    bodyMarkdown: doc.bodyMarkdown,
    version: 1,
    publishedAt: EFFECTIVE_AT,
    effectiveAt: EFFECTIVE_AT,
  };
}

export function getFixedLegalSeller(
  settings?: Pick<
    StorefrontSettingsPublicDto,
    'brandName' | 'city' | 'phone' | 'email' | 'workingHours'
  > | null,
): LegalSellerPublicDto {
  return {
    brandName: settings?.brandName?.trim() || FIXED_SELLER.brandName,
    city: settings?.city?.trim() || FIXED_SELLER.city,
    legalName: FIXED_SELLER.legalName,
    unp: FIXED_SELLER.unp,
    legalAddress: FIXED_SELLER.legalAddress,
    postalCode: FIXED_SELLER.postalCode,
    stateRegistrationDate: null,
    stateRegistrationNumber: null,
    registeringAuthority: null,
    tradeRegisterNumber: null,
    tradeRegisterDate: null,
    phone: settings?.phone?.trim() || null,
    email: settings?.email?.trim() || null,
    businessHours: settings?.workingHours?.trim() || null,
    consumerClaimsContactName: null,
    consumerClaimsPhone: settings?.phone?.trim() || null,
    consumerClaimsEmail: settings?.email?.trim() || null,
    pickupAddress: FIXED_SELLER.pickupAddress,
    actualOfflinePaymentDescription: FIXED_SELLER.actualOfflinePaymentDescription,
    failedDeliveryPolicy: FIXED_SELLER.failedDeliveryPolicy,
    substitutionNote: null,
    siteUrl: null,
    physicalStoreAddress: null,
  };
}

export function getFixedLegalBank(): LegalBankPublicDto {
  return {
    legalName: FIXED_SELLER.legalName,
    unp: FIXED_SELLER.unp,
    bankAccountIban: FIXED_SELLER.bankAccountIban,
    bankName: FIXED_SELLER.bankName,
    bankAddress: FIXED_SELLER.bankAddress,
    bankSwift: FIXED_SELLER.bankSwift,
    bankUnp: FIXED_SELLER.bankUnp,
  };
}

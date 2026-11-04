# Belarus commerce compliance

> This document describes how the BUKET №1 storefront models Belarus e-commerce
> compliance. **It is not legal advice.** Clauses flagged for human review must
> be checked by a Belarusian lawyer before production launch.

## Current business model

1. Customer sees real catalog prices.
2. Customer builds a cart and submits checkout.
3. Order is created with status `RECEIVED` («Заказ получен»).
4. Manager reviews fulfillment feasibility.
5. Manager contacts the customer and confirms details (`CONFIRMED`).
6. **No online payment runs on the website.** Payment is arranged offline
   (cash on receipt and/or bank transfer — fixed copy in code templates).

Do not add payment gateways, card forms, or fake “paid” states in this phase.

## Seller identity and legal pages (fixed in code)

Requisites and public legal texts live in `apps/web/src/lib/legal-content.ts`
(and `OWNER_PROVIDED_SELLER` in contracts). They are **not** edited in Admin.

| Field | Value |
| --- | --- |
| Legal name | Индивидуальный предприниматель Олизар Антон Геннадьевич |
| УНП | 591673107 |
| Legal address | 231606, Республика Беларусь, Гродненская область, Мостовский район, деревня Каменчаны, дом 17 |
| IBAN | BY31POIS30130185611201933001 |
| Bank | ОАО «Паритетбанк» |
| Bank address | 220002, г. Минск, ул. Киселева, 61А |
| SWIFT | POISBY2X |
| Bank УНП | 100233809 |

**Important:** the legal address is **not** the shop, warehouse, or pickup point.
Phone / email / hours on legal pages come from Storefront Settings.

## Storefront settings still used

- Official shop phone / email / hours (витрина → настройки)
- Consumer claims contact (if different)
- Pickup address (if pickup is enabled)
- Actual offline payment description (only real methods)
- Failed-delivery / recipient-unavailable operational rule
- Legal review + publish of draft documents

## Public legal pages

| Route | Purpose |
| --- | --- |
| `/kontakty` | Contacts & requisites (bank in expandable section) |
| `/dostavka` | Delivery & payment (fulfillment live data + no online pay) |
| `/oferta` | Order terms / public offer |
| `/vozvrat` | Returns, cancellation, claims |
| `/privacy` | Personal data policy |

## Admin

Legal texts and seller/bank requisites are **not** editable in Admin.
Source of truth: `apps/web/src/lib/legal-content.ts`. Shop phone/email/hours
still come from Storefront Settings.

## Checkout legal behaviour

- Submit button: **Оформить заказ** (not «Оплатить»)
- Quiet acknowledgement with links to oferta / dostavka / vozvrat / privacy
- Success: **Заказ получен** — manager will contact; not confirmed, not paid
- Tracking: `RECEIVED` → «Заказ получен»; `CONFIRMED` → «Заказ подтверждён»

## Personal-data processing inventory (application fact)

| Purpose | Subjects | Data | Notes / review |
| --- | --- | --- | --- |
| Order fulfillment | Purchaser | Name, phone | Necessary for contract performance — confirm legal basis with counsel |
| Delivery | Recipient (may be third party) | Name, phone, address | **No** “recipient consented” checkbox; notice/basis needs legal review |
| Order notes | Purchaser | Card message, comment | Operational |
| Security / ops | — | Request IDs, admin sessions, audit hashes | Admin cookie HttpOnly |
| Browser UX | Visitor | Cart/favorites localStorage; checkout sessionStorage | Functional; no analytics SDK currently |

Retention: orders are currently retained indefinitely in DB — treat as a
**technical/legal gap**, not as a documented short retention policy.

Processors: document actual hosting/S3/email providers in ops runbooks when
known. Do not list hypothetical future services.

## Cookies / local storage

| Key | Storage | Purpose |
| --- | --- | --- |
| Admin session | HttpOnly cookie | Admin auth only |
| `bouquet-one:cart:v1` | localStorage | Cart |
| `bouquet-one:favorites:v1` | localStorage | Favorites |
| `bouquet-one:checkout-*` / `last-order` | sessionStorage | Checkout idempotency / success |

No consent banner while only functional storage and no marketing/analytics
scripts are present. Reassess if analytics are added.

## Compliance check

```bash
pnpm compliance:check
```

Fails if mandatory seller/trade-register/registration/contacts/documents are
incomplete. Does not invent values to pass.

## Human legal-review flags

See `BELARUS_LEGAL_REVIEW_FLAGS` in `@bouquet-one/contracts` / Admin compliance
panel. At minimum:

1. Moment of contract conclusion under manager-confirm flow
2. Returns/exchange for live flowers
3. Cancellation after bouquet preparation
4. Substitution policy
5. Recipient personal-data legal basis / notice
6. Retention periods
7. Offline payment wording
8. Trade register data
9. State registration data

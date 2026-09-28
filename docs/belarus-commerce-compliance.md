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
6. **No online payment runs on the website.** Payment is arranged offline using
   the seller’s actual available methods (configured in Admin when known).

Do not add payment gateways, card forms, or fake “paid” states in this phase.

## Seller identity (owner-provided)

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
Pickup and physical store addresses are separate Admin fields (`pickupAddress`,
`physicalStoreAddress`).

## Still required from the owner (`REQUIRED_CONFIGURATION`)

- Trade register number + inclusion date
- State registration date / number / registering authority
- Official seller phone / email / hours (or confirm Storefront Settings values)
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

- **Настройки → Юридическая информация** (`/admin/legal`)
- Document editors under `/admin/legal/documents/[kind]`
- Compliance panel: readiness checklist
- Permissions: `LEGAL_READ`, `LEGAL_EDIT`, `LEGAL_PUBLISH`

Publishing documents and changing seller/bank details require `LEGAL_PUBLISH`
(SUPER_ADMIN). CONTENT_MANAGER may edit drafts (`LEGAL_EDIT`).

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
| `bouquet-one:recent-searches:v1` | localStorage | Search UX |
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

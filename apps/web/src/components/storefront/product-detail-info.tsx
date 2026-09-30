import type {
  ComponentUnit,
  FulfillmentSettingsPublicDto,
  ProductPublicDto,
} from '@bouquet-one/contracts';

type Props = {
  product: ProductPublicDto;
  fulfillment: FulfillmentSettingsPublicDto | null;
  deliverySummary: string | null;
  substitutionNote: string | null;
  city?: string | null;
};

function unitLabel(unit: ComponentUnit): string {
  switch (unit) {
    case 'PIECE':
    case 'STEM':
      return 'шт.';
    case 'BUNCH':
      return 'пуч.';
    default:
      return '';
  }
}

function formatFee(minor: string, currency: string): string {
  const value = Number(minor);
  if (!Number.isFinite(value) || value <= 0) return 'бесплатно';
  return `${(value / 100).toFixed(0)} ${currency}`;
}

function shortDeliveryText({
  fulfillment,
  deliverySummary,
  city,
}: {
  fulfillment: FulfillmentSettingsPublicDto | null;
  deliverySummary: string | null;
  city?: string | null;
}): string {
  if (deliverySummary?.trim()) return deliverySummary.trim();

  const parts: string[] = [];
  if (fulfillment?.deliveryEnabled) {
    parts.push(`Курьером — ${formatFee(fulfillment.deliveryFeeMinor, fulfillment.currency)}`);
  }
  if (fulfillment?.pickupEnabled) {
    parts.push('есть самовывоз');
  }
  if (parts.length > 0) {
    const where = city ? ` по ${city}` : '';
    return `${parts.join(', ')}${where}. Способ и время выбираете при оформлении.`;
  }
  if (city) {
    return `Доставка по ${city}. Способ и время выбираете при оформлении.`;
  }
  return 'Способ и время доставки выбираете при оформлении заказа.';
}

function CompositionSection({ product }: { product: ProductPublicDto }) {
  const components = product.components;
  const meta: string[] = [];
  if (product.bouquetSize?.name) meta.push(product.bouquetSize.name);
  if (product.heightCm != null) meta.push(`высота ${product.heightCm} см`);

  if (components.length === 0 && product.flowers.length === 0) {
    return <p className="sf-body text-muted">Состав уточнит флорист при сборке.</p>;
  }

  return (
    <div className="space-y-2.5">
      {components.length > 0 ? (
        <ul className="sf-pdp-composition">
          {components.map((item, index) => {
            const qty =
              item.quantity != null
                ? ` — ${item.quantity}${unitLabel(item.unit) ? `\u00a0${unitLabel(item.unit)}` : ''}`
                : '';
            return (
              <li key={`${item.displayName}-${item.flowerSlug ?? index}`}>
                {item.displayName}
                {qty}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="sf-body text-muted">{product.flowers.map((f) => f.name).join(', ')}</p>
      )}
      {meta.length > 0 ? <p className="sf-small text-muted">{meta.join(' · ')}</p> : null}
    </div>
  );
}

/**
 * PDP info stack: composition → description → short delivery.
 * Gift/recipient and delivery method stay in checkout/cart.
 */
export function ProductDetailInfo({
  product,
  fulfillment,
  deliverySummary,
  substitutionNote,
  city,
}: Props) {
  const delivery = shortDeliveryText({ fulfillment, deliverySummary, city });

  return (
    <div className="sf-pdp-info">
      <section className="sf-pdp-info__section" aria-labelledby="pdp-composition">
        <h2 id="pdp-composition" className="sf-label">
          Состав
        </h2>
        <CompositionSection product={product} />
      </section>

      <section className="sf-pdp-info__section" aria-labelledby="pdp-description">
        <h2 id="pdp-description" className="sf-label">
          Описание
        </h2>
        {product.description ? (
          <p className="sf-body whitespace-pre-line text-muted">{product.description}</p>
        ) : (
          <p className="sf-body text-muted">Описание появится позже.</p>
        )}
        {substitutionNote ? <p className="sf-small mt-2 text-muted">{substitutionNote}</p> : null}
      </section>

      <section className="sf-pdp-info__section" aria-labelledby="pdp-delivery">
        <h2 id="pdp-delivery" className="sf-label">
          Доставка
        </h2>
        <p className="sf-body text-muted">{delivery}</p>
      </section>
    </div>
  );
}

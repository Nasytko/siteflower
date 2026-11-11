import type {
  FulfillmentSettingsPublicDto,
  ProductPublicDto,
} from '@bouquet-one/contracts';
import { ProductDeliveryGuide } from './product-delivery-guide';
import { ProductInfoTabs, type ProductInfoSection } from './product-info-tabs';

type Props = {
  product: ProductPublicDto;
  fulfillment: FulfillmentSettingsPublicDto | null;
  deliverySummary: string | null;
  substitutionNote: string | null;
  outOfCityDeliveryNote: string | null;
  paymentDescription: string | null;
  city?: string | null;
};

export function formatDeliveryFee(minor: string, currency: string): string | null {
  const value = Number(minor);
  if (!Number.isFinite(value) || value <= 0) return null;
  return `${(value / 100).toFixed(2).replace('.', ',')} ${currency}`;
}

/** Paragraphs split by blank lines; `**text**` → bold. */
function RichText({ text }: { text: string }) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <div className="sf-pdp-rich">
      {paragraphs.map((paragraph, index) => (
        <p key={index}>
          {paragraph.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
            part.startsWith('**') && part.endsWith('**') ? (
              <strong key={i}>{part.slice(2, -2)}</strong>
            ) : (
              <span key={i}>{part}</span>
            ),
          )}
        </p>
      ))}
    </div>
  );
}

function CompositionPanel({
  product,
  substitutionNote,
}: Pick<Props, 'product' | 'substitutionNote'>) {
  return (
    <div className="sf-pdp-composition-grid" data-cols="1">
      <div>
        {product.components.length === 0 ? (
          <p className="sf-pdp-muted">Состав уточнит флорист при сборке.</p>
        ) : (
          <ul className="sf-pdp-composition">
            {product.components.map((item, index) => (
              <li key={`${item.displayName}-${item.flowerSlug ?? index}`}>
                <span className="sf-pdp-composition__name">{item.displayName}</span>
              </li>
            ))}
          </ul>
        )}
        {product.heightCm != null ? (
          <p className="sf-pdp-muted mt-3">Высота букета — {product.heightCm} см</p>
        ) : null}
        {substitutionNote ? (
          <p className="sf-pdp-composition__season">
            Сезонные цветы. Возможна равноценная замена — стиль и цена те же.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function DeliveryPanel({
  fulfillment,
  outOfCityDeliveryNote,
  city,
}: Pick<Props, 'fulfillment' | 'outOfCityDeliveryNote' | 'city'>) {
  return (
    <ProductDeliveryGuide
      fulfillment={fulfillment}
      outOfCityDeliveryNote={outOfCityDeliveryNote}
      city={city}
    />
  );
}

/** Accordion rows: Состав · Доставка · Оплата. */
export function ProductDetailInfo(props: Props) {
  const { paymentDescription } = props;
  const sections: ProductInfoSection[] = [
    {
      id: 'composition',
      label: 'Состав',
      content: <CompositionPanel {...props} />,
    },
    {
      id: 'delivery',
      label: 'Доставка',
      content: <DeliveryPanel {...props} />,
    },
  ];
  if (paymentDescription) {
    sections.push({
      id: 'payment',
      label: 'Оплата',
      content: <RichText text={paymentDescription} />,
    });
  }
  // Task 03: product body lives once under the buy panel lead — do not duplicate here.
  return <ProductInfoTabs sections={sections} />;
}


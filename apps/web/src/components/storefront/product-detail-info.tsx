import Image from 'next/image';
import type { ReactNode } from 'react';
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
  const columns = 1 + (substitutionNote ? 1 : 0);

  return (
    <div className="sf-pdp-composition-grid" data-cols={columns}>
      <div>
        {product.components.length === 0 ? (
          <p className="sf-pdp-muted">Состав уточнит флорист при сборке.</p>
        ) : (
          <ul className="sf-pdp-composition">
            {product.components.map((item, index) => (
              <li key={`${item.displayName}-${item.flowerSlug ?? index}`}>
                <span className="sf-pdp-composition__icon" aria-hidden>
                  {item.imageUrl ? (
                    <Image
                      src={item.imageUrl}
                      alt=""
                      fill
                      sizes="40px"
                      className="object-cover"
                      unoptimized={!item.imageUrl.startsWith('/')}
                    />
                  ) : (
                    <FlowerIcon />
                  )}
                </span>
                <span className="sf-pdp-composition__name">{item.displayName}</span>
              </li>
            ))}
          </ul>
        )}
        {product.heightCm != null ? (
          <p className="sf-pdp-muted mt-3">Высота букета — {product.heightCm} см</p>
        ) : null}
      </div>

      {substitutionNote ? (
        <div className="sf-pdp-note">
          <p className="sf-pdp-note__text">
            <InfoIcon />
            <span>{substitutionNote}</span>
          </p>
        </div>
      ) : null}
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

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

function FlowerIcon() {
  return (
    <Svg>
      <circle cx="12" cy="9" r="2.2" />
      <path d="M12 6.8c0-2.2 1-3.8 2.6-3.8S17 4.6 15.6 6.6M12 6.8c0-2.2-1-3.8-2.6-3.8S7 4.6 8.4 6.6M14.2 9c2.2 0 3.8 1 3.8 2.6S16.4 14 14.4 12.6M9.8 9C7.6 9 6 10 6 11.6S7.6 14 9.6 12.6M12 11.2V21M12 17c-1.8-1.8-3.8-2-5-1.6M12 18c1.6-1.6 3.4-1.8 4.6-1.4" />
    </Svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="sf-pdp-note__icon" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}

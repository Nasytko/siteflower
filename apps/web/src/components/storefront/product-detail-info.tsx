import Image from 'next/image';
import type { ReactNode } from 'react';
import type {
  ComponentUnit,
  FulfillmentSettingsPublicDto,
  ProductPublicDto,
} from '@bouquet-one/contracts';
import { pickDerivativeUrl, productImageAlt, sortProductMedia } from '@/lib/media';
import { ProductInfoTabs, type ProductInfoSection } from './product-info-tabs';

type Props = {
  product: ProductPublicDto;
  fulfillment: FulfillmentSettingsPublicDto | null;
  deliverySummary: string | null;
  substitutionNote: string | null;
  outOfCityDeliveryNote: string | null;
  paymentDescription: string | null;
  packagingNote: string | null;
  packagingImageUrl: string | null;
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

export function formatDeliveryFee(minor: string, currency: string): string | null {
  const value = Number(minor);
  if (!Number.isFinite(value) || value <= 0) return null;
  return `${(value / 100).toFixed(2).replace('.', ',')} ${currency}`;
}

function leadTimeLabel(minutes: number): string | null {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  if (minutes % 60 === 0) return `${minutes / 60} ч.`;
  return `${minutes} мин.`;
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
  packagingNote,
  packagingImageUrl,
}: Pick<Props, 'product' | 'substitutionNote' | 'packagingNote' | 'packagingImageUrl'>) {
  const media = sortProductMedia(product.media);
  const detailPhoto = media.length > 1 ? media[media.length - 1] : null;
  const columns = 1 + (substitutionNote ? 1 : 0) + (packagingNote ? 1 : 0);

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
                  <FlowerIcon />
                </span>
                <span className="sf-pdp-composition__name">{item.displayName}</span>
                {item.quantity != null ? (
                  <span className="sf-pdp-composition__qty">
                    {item.quantity}
                    {unitLabel(item.unit) ? `\u00a0${unitLabel(item.unit)}` : ''}
                  </span>
                ) : null}
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
          {detailPhoto ? (
            <div className="sf-pdp-note__photo">
              <Image
                src={pickDerivativeUrl(detailPhoto, 600) ?? detailPhoto.url}
                alt={productImageAlt(product.name, detailPhoto.alt)}
                fill
                sizes="(max-width: 1023px) 90vw, 22rem"
                className="object-cover"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {packagingNote ? (
        <div className="sf-pdp-note sf-pdp-note--plain">
          <p className="sf-pdp-note__text">
            <BoxIcon />
            <span>
              <strong>Упаковка</strong>
              {packagingNote}
            </span>
          </p>
          {packagingImageUrl ? (
            <div className="sf-pdp-note__photo">
              <Image
                src={packagingImageUrl}
                alt="Упаковка букета"
                fill
                sizes="(max-width: 1023px) 90vw, 22rem"
                className="object-cover"
                unoptimized={!packagingImageUrl.startsWith('/')}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DeliveryPanel({
  fulfillment,
  deliverySummary,
  outOfCityDeliveryNote,
  city,
}: Pick<Props, 'fulfillment' | 'deliverySummary' | 'outOfCityDeliveryNote' | 'city'>) {
  const rows: Array<{ label: string; value: string }> = [];
  if (fulfillment?.deliveryEnabled) {
    const fee = formatDeliveryFee(fulfillment.deliveryFeeMinor, fulfillment.currency);
    rows.push({
      label: city ? `Доставка по ${city}` : 'Доставка курьером',
      value: fee ?? 'бесплатно',
    });
  }
  if (outOfCityDeliveryNote) rows.push({ label: 'За городом', value: outOfCityDeliveryNote });
  if (fulfillment?.pickupEnabled) rows.push({ label: 'Самовывоз', value: 'бесплатно' });
  const lead = fulfillment ? leadTimeLabel(fulfillment.minLeadTimeMinutes) : null;
  if (lead) rows.push({ label: 'Время на сборку', value: `от ${lead}` });
  const windows = fulfillment?.timeWindows.filter((w) => w.active).map((w) => w.label) ?? [];

  return (
    <div className="sf-pdp-panel-stack">
      {deliverySummary ? <p className="sf-pdp-muted">{deliverySummary}</p> : null}
      {rows.length > 0 ? (
        <dl className="sf-pdp-facts">
          {rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {windows.length > 0 ? (
        <p className="sf-pdp-muted">Интервалы: {windows.join(', ')}.</p>
      ) : null}
      {fulfillment?.pickupInstructions ? (
        <p className="sf-pdp-muted">{fulfillment.pickupInstructions}</p>
      ) : null}
      <p className="sf-pdp-muted">Способ, дату и время выбираете при оформлении заказа.</p>
    </div>
  );
}

/** Tabs (desktop) / accordions (mobile): Состав · Доставка · Оплата · Описание. */
export function ProductDetailInfo(props: Props) {
  const { product, paymentDescription } = props;
  const sections: ProductInfoSection[] = [
    {
      id: 'composition',
      label: 'Состав',
      icon: <FlowerIcon />,
      content: <CompositionPanel {...props} />,
    },
    {
      id: 'delivery',
      label: 'Доставка',
      icon: <TruckIcon />,
      content: <DeliveryPanel {...props} />,
    },
  ];
  if (paymentDescription) {
    sections.push({
      id: 'payment',
      label: 'Оплата',
      icon: <WalletIcon />,
      content: <RichText text={paymentDescription} />,
    });
  }
  if (product.description) {
    sections.push({
      id: 'description',
      label: 'Описание',
      icon: <TextIcon />,
      content: <RichText text={product.description} />,
    });
  }
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

function TruckIcon() {
  return (
    <Svg>
      <path d="M3 6h11v10H3zM14 10h4l3 3v3h-7" />
      <circle cx="7" cy="17.5" r="1.6" />
      <circle cx="17" cy="17.5" r="1.6" />
    </Svg>
  );
}

function WalletIcon() {
  return (
    <Svg>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M16 14.5h2" />
    </Svg>
  );
}

function TextIcon() {
  return (
    <Svg>
      <path d="M5 6h14M5 10h14M5 14h10M5 18h7" />
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

function BoxIcon() {
  return (
    <svg viewBox="0 0 24 24" className="sf-pdp-note__icon" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
      <path d="M4 11h16v9H4zM3 8h18v3H3zM12 8v12M12 8c-2 0-3.5-1.3-3.5-2.8S10 3 12 5.5C14 3 15.5 3.7 15.5 5.2S14 8 12 8Z" />
    </svg>
  );
}

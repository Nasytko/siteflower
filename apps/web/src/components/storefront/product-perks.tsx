import Link from 'next/link';
import type { ReactNode } from 'react';
import type { FulfillmentSettingsPublicDto } from '@bouquet-one/contracts';
import { formatDeliveryFee } from './product-detail-info';

type Props = {
  fulfillment: FulfillmentSettingsPublicDto | null;
  city: string | null;
  pickupAddress: string | null;
  workingHours: string | null;
  outOfCityDeliveryNote: string | null;
  photoReportNote: string | null;
};

type Perk = {
  key: string;
  icon: ReactNode;
  title: string;
  lines: string[];
  href: string;
};

/** Delivery / pickup facts from Admin settings — a perk is omitted when its data is missing. */
export function ProductPerks({
  fulfillment,
  city,
  pickupAddress,
  workingHours,
  outOfCityDeliveryNote,
  photoReportNote,
}: Props) {
  const perks: Perk[] = [];

  if (fulfillment?.deliveryEnabled) {
    const fee = formatDeliveryFee(fulfillment.deliveryFeeMinor, fulfillment.currency);
    perks.push({
      key: 'delivery',
      icon: <TruckIcon />,
      title: fee ? `Доставка ${fee}` : 'Бесплатная доставка',
      lines: [
        `${city ? `по ${city}` : 'курьером'}${outOfCityDeliveryNote ? ' в черте города' : ''}`,
      ],
      href: '/dostavka',
    });
  }
  if (fulfillment?.deliveryEnabled && outOfCityDeliveryNote) {
    perks.push({
      key: 'out-of-city',
      icon: <PinIcon />,
      title: 'За городом',
      lines: [outOfCityDeliveryNote],
      href: '/dostavka',
    });
  }
  if (fulfillment?.pickupEnabled) {
    perks.push({
      key: 'pickup',
      icon: <StoreIcon />,
      title: 'Самовывоз',
      lines: [workingHours, pickupAddress].filter((line): line is string => Boolean(line)),
      href: '/kontakty',
    });
  }
  if (photoReportNote) {
    perks.push({
      key: 'photo',
      icon: <CameraIcon />,
      title: 'Фото перед отправкой',
      lines: [photoReportNote],
      href: '/dostavka',
    });
  }

  if (perks.length === 0) return null;

  return (
    <section className="sf-pdp-card sf-pdp-perks" aria-label="Доставка и самовывоз">
      <ul className="sf-pdp-perks__list" data-count={perks.length}>
        {perks.map((perk) => (
          <li key={perk.key}>
            <Link href={perk.href} className="sf-pdp-perk">
              <span className="sf-pdp-perk__icon">{perk.icon}</span>
              <span className="sf-pdp-perk__text">
                <strong>
                  {perk.title}
                  {perk.key === 'pickup' && workingHours ? (
                    <span className="sf-pdp-perk__inline">: {workingHours}</span>
                  ) : null}
                </strong>
                {perk.lines.map((line, index) => (
                  <span
                    key={line}
                    className={
                      perk.key === 'pickup' && index === 0 && workingHours
                        ? 'sf-pdp-perk__line sf-pdp-perk__line--desktop'
                        : 'sf-pdp-perk__line'
                    }
                  >
                    {line}
                  </span>
                ))}
              </span>
              <span className="sf-pdp-perk__chevron" aria-hidden>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

function TruckIcon() {
  return (
    <Svg>
      <path d="M2.5 6h11.5v10H2.5zM14 9.5h4.2l3.3 3.4V16H14" />
      <circle cx="6.5" cy="17.5" r="1.7" />
      <circle cx="17.5" cy="17.5" r="1.7" />
    </Svg>
  );
}

function PinIcon() {
  return (
    <Svg>
      <path d="M12 21s-6.5-5.8-6.5-11a6.5 6.5 0 0 1 13 0c0 5.2-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </Svg>
  );
}

function StoreIcon() {
  return (
    <Svg>
      <path d="M4 9.5 5.5 4h13L20 9.5M4 9.5V20h16V9.5M4 9.5c0 1.4 1.2 2.5 2.7 2.5s2.6-1.1 2.6-2.5c0 1.4 1.2 2.5 2.7 2.5s2.7-1.1 2.7-2.5c0 1.4 1.1 2.5 2.6 2.5S20 10.9 20 9.5" />
      <path d="M9.5 20v-4.5h5V20" />
    </Svg>
  );
}

function CameraIcon() {
  return (
    <Svg>
      <path d="M3.5 8h3.2l1.8-2.5h7L17.3 8h3.2v11h-17z" />
      <circle cx="12" cy="13.3" r="3.4" />
    </Svg>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { FULFILLMENT_MIN_LEAD_MINUTES } from '@bouquet-one/contracts';
import type { FulfillmentSettingsPublicDto } from '@bouquet-one/contracts';
import {
  computeNearestDeliverySlot,
  minutesSinceMidnightMinsk,
  type NearestDeliverySlot,
} from '@/lib/fulfillment-slots';

type Props = {
  fulfillment: FulfillmentSettingsPublicDto | null;
  outOfCityDeliveryNote: string | null;
  city?: string | null;
};

function feeLabel(minor: string, currency: string): string | null {
  const value = Number(minor);
  if (!Number.isFinite(value) || value <= 0) return null;
  return `${(value / 100).toFixed(2).replace('.', ',')} ${currency}`;
}

function nearestPhrase(slot: NearestDeliverySlot, now: Date): string {
  if (slot.dayKind === 'tomorrow') return 'завтра с 9:00';
  if (slot.dayKind === 'later') return `${slot.dayLabel} к ${slot.clockLabel}`;
  const wait = slot.startMinutes - minutesSinceMidnightMinsk(now);
  if (wait <= 75) return 'через час';
  return `сегодня к ${slot.clockLabel}`;
}

export function ProductDeliveryGuide({ fulfillment, outOfCityDeliveryNote, city }: Props) {
  const [nearest, setNearest] = useState<NearestDeliverySlot | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const lead = Math.max(fulfillment?.minLeadTimeMinutes ?? FULFILLMENT_MIN_LEAD_MINUTES, FULFILLMENT_MIN_LEAD_MINUTES);

  useEffect(() => {
    const refresh = () => {
      const current = new Date();
      setNow(current);
      setNearest(computeNearestDeliverySlot({ now: current, minLeadMinutes: lead }));
    };
    refresh();
    const id = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(id);
  }, [lead]);

  const cityFee = fulfillment ? feeLabel(fulfillment.deliveryFeeMinor, fulfillment.currency) : null;
  const phrase = nearest && now ? nearestPhrase(nearest, now) : null;

  return (
    <div className="sf-delivery-guide">
      <div className="sf-delivery-guide__hero">
        <p className="sf-delivery-guide__eyebrow">Ближайшая доставка</p>
        <p className="sf-delivery-guide__clock">{phrase ?? 'через час'}</p>
        <p className="sf-delivery-guide__hint">Не раньше, чем через час после заказа. С 9:00 до 21:00.</p>
      </div>

      <ul className="sf-delivery-guide__facts">
        {fulfillment?.deliveryEnabled !== false ? (
          <li>
            <span className="sf-delivery-guide__fact-label">{city ? `По ${city}` : 'По городу'}</span>
            <span className="sf-delivery-guide__fact-value">{cityFee ?? 'бесплатно'}</span>
          </li>
        ) : null}
        {fulfillment?.pickupEnabled !== false ? (
          <li>
            <span className="sf-delivery-guide__fact-label">Самовывоз</span>
            <span className="sf-delivery-guide__fact-value">9:00–21:00</span>
          </li>
        ) : null}
        {outOfCityDeliveryNote ? (
          <li>
            <span className="sf-delivery-guide__fact-label">За городом</span>
            <span className="sf-delivery-guide__fact-value">по согласованию</span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

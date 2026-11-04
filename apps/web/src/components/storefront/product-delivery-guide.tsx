'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FulfillmentSettingsPublicDto } from '@bouquet-one/contracts';
import {
  computeNearestDeliverySlot,
  hourlySlotChips,
  minutesSinceMidnightMinsk,
  todayMinsk,
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

export function ProductDeliveryGuide({ fulfillment, outOfCityDeliveryNote, city }: Props) {
  const [nearest, setNearest] = useState<NearestDeliverySlot | null>(null);

  useEffect(() => {
    const refresh = () => {
      setNearest(
        computeNearestDeliverySlot({
          minLeadMinutes: fulfillment?.minLeadTimeMinutes,
        }),
      );
    };
    refresh();
    const id = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(id);
  }, [fulfillment?.minLeadTimeMinutes]);

  const chips = useMemo(() => hourlySlotChips(), []);
  const today = todayMinsk(new Date());
  const earliestToday =
    minutesSinceMidnightMinsk(new Date()) + (fulfillment?.minLeadTimeMinutes ?? 60);
  const noSlotsToday = nearest != null && nearest.dayKind !== 'today';

  const cityFee = fulfillment ? feeLabel(fulfillment.deliveryFeeMinor, fulfillment.currency) : null;

  return (
    <div className="sf-delivery-guide">
      <div className="sf-delivery-guide__hero">
        <p className="sf-delivery-guide__eyebrow">Ближайшая доставка</p>
        {nearest ? (
          <>
            <p className="sf-delivery-guide__time">
              <span className="sf-delivery-guide__day">{nearest.dayLabel}</span>
              <span className="sf-delivery-guide__clock">к {nearest.clockLabel}</span>
            </p>
            <p className="sf-delivery-guide__hint">
              Интервал {nearest.windowLabel}. Готовим букет не меньше часа до выезда курьера.
            </p>
          </>
        ) : (
          <p className="sf-delivery-guide__hint">Считаем ближайший слот…</p>
        )}
      </div>

      <div className="sf-delivery-guide__block">
        <div className="sf-delivery-guide__block-head">
          <h3 className="sf-delivery-guide__title">Окна доставки</h3>
          <p className="sf-delivery-guide__sub">Каждый час · 9:00–21:00</p>
        </div>
        <ul className="sf-delivery-guide__chips" aria-label="Часы доставки в течение дня">
          {chips.map((chip) => {
            const isNext =
              nearest != null &&
              nearest.date === today &&
              nearest.startMinutes === chip.startMinutes;
            const passedToday = chip.startMinutes < earliestToday;
            return (
              <li key={chip.id}>
                <span
                  className={[
                    'sf-delivery-guide__chip',
                    isNext ? 'sf-delivery-guide__chip--next' : '',
                    passedToday ? 'sf-delivery-guide__chip--past' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {chip.label}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="sf-delivery-guide__footnote">
          {noSlotsToday
            ? 'На сегодня свободных слотов уже нет — ближайшая доставка завтра с 09:00.'
            : 'Мягко подсвечен ближайший доступный час. Остальные — в течение дня до 21:00.'}
        </p>
      </div>

      <ul className="sf-delivery-guide__facts">
        {fulfillment?.deliveryEnabled !== false ? (
          <li>
            <span className="sf-delivery-guide__fact-label">
              {city ? `По ${city}` : 'По городу'}
            </span>
            <span className="sf-delivery-guide__fact-value">{cityFee ?? 'бесплатно'}</span>
          </li>
        ) : null}
        {fulfillment?.pickupEnabled !== false ? (
          <li>
            <span className="sf-delivery-guide__fact-label">Самовывоз</span>
            <span className="sf-delivery-guide__fact-value">бесплатно · 9:00–21:00</span>
          </li>
        ) : null}
        {outOfCityDeliveryNote ? (
          <li>
            <span className="sf-delivery-guide__fact-label">За городом</span>
            <span className="sf-delivery-guide__fact-value">{outOfCityDeliveryNote}</span>
          </li>
        ) : null}
      </ul>

      <div className="sf-delivery-guide__soft">
        <p>
          Нужен час вне 9:00–21:00 — при оформлении отметьте «согласовать с менеджером» и напишите
          желаемое время.
        </p>
        <p className="sf-delivery-guide__soft-muted">
          Точные дату и интервал выбираете в корзине. Менеджер подтвердит заказ.
        </p>
      </div>
    </div>
  );
}

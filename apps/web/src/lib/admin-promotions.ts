import type {
  AdminPromotionListItemDto,
  AdminPromotionListStatus,
} from '@bouquet-one/contracts';
import { formatAdminDateTime, promotionTypeLabel } from '@/lib/admin-labels';

export type PromotionStatusTone = 'active' | 'planned' | 'ended' | 'off';

export type PromotionStatusView = {
  label: string;
  tone: PromotionStatusTone;
};

const STATUS_VIEW: Record<AdminPromotionListStatus, PromotionStatusView> = {
  active: { label: 'Идёт сейчас', tone: 'active' },
  scheduled: { label: 'Запланирована', tone: 'planned' },
  ended: { label: 'Завершена', tone: 'ended' },
  disabled: { label: 'Выключена', tone: 'off' },
};

export function promotionStatusView(row: AdminPromotionListItemDto): PromotionStatusView {
  return STATUS_VIEW[row.status] ?? { label: 'Настроена', tone: 'planned' };
}

export function promotionPeriodLabel(row: AdminPromotionListItemDto): string {
  const admin = row.promotionAdmin;
  if (!admin.startsAt && !admin.endsAt) return 'Без срока';
  const from = admin.startsAt ? formatAdminDateTime(admin.startsAt) : 'сразу';
  const to = admin.endsAt ? formatAdminDateTime(admin.endsAt) : 'бессрочно';
  return `${from} — ${to}`;
}

export function promotionTypeForRow(row: AdminPromotionListItemDto): string {
  return promotionTypeLabel(row.promotionAdmin.type);
}

/** Regular / strikethrough price — prefer public promo original when effective. */
export function promotionRegularPriceLabel(row: AdminPromotionListItemDto): string {
  return row.promotion?.originalPrice?.label ?? row.price?.label ?? '—';
}

/** Sale price when currently effective; otherwise em dash. */
export function promotionSalePriceLabel(row: AdminPromotionListItemDto): string {
  return row.promotion?.salePrice?.label ?? '—';
}

export function promotionDiscountLabel(row: AdminPromotionListItemDto): string | null {
  const percent = row.promotion?.percentOff ?? row.promotionAdmin.percentOff;
  if (percent == null || percent < 1) return null;
  return `−${percent}%`;
}

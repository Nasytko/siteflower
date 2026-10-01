/**
 * Russian Admin vocabulary. Enum names never reach the screen as primary labels.
 */

import type {
  AdminRole,
  CommercialAvailability,
  ComponentUnit,
  ProductLifecycle,
  PromotionType,
  TaxonomyVisibility,
  VariantStatus,
} from '@bouquet-one/contracts';
import {
  ADMIN_BUSINESS_TIMEZONE,
  businessLocalToUtcIso,
  utcIsoToBusinessLocal,
} from './admin-business-time';

const LIFECYCLE: Record<ProductLifecycle, string> = {
  DRAFT: 'Черновик',
  PUBLISHED: 'Опубликован',
  ARCHIVED: 'В архиве',
};

const AVAILABILITY: Record<CommercialAvailability, string> = {
  AVAILABLE: 'В наличии',
  TEMPORARILY_UNAVAILABLE: 'Временно нет',
  PREORDER: 'Под заказ',
  SEASONAL: 'Сезонный',
};

const VARIANT_STATUS: Record<VariantStatus, string> = {
  ACTIVE: 'Активен',
  INACTIVE: 'Отключён',
};

const VISIBILITY: Record<TaxonomyVisibility, string> = {
  VISIBLE: 'Показан',
  HIDDEN: 'Скрыт',
};

const UNIT: Record<ComponentUnit, string> = {
  PIECE: 'шт.',
  STEM: 'стеблей',
  BUNCH: 'пучков',
  UNSPECIFIED: 'без единицы',
};

const PROMOTION_TYPE: Record<PromotionType, string> = {
  PERCENT: 'Процент скидки',
  FIXED: 'Фиксированная цена',
};

const ROLE: Record<AdminRole, string> = {
  SUPER_ADMIN: 'Главный администратор',
  MANAGER: 'Менеджер',
  CONTENT_MANAGER: 'Контент-менеджер',
};

export function adminRoleLabel(value: AdminRole): string {
  return ROLE[value] ?? value;
}

export function lifecycleLabel(value: ProductLifecycle): string {
  return LIFECYCLE[value] ?? value;
}

export function availabilityLabel(value: CommercialAvailability): string {
  return AVAILABILITY[value] ?? value;
}

export function variantStatusLabel(value: VariantStatus): string {
  return VARIANT_STATUS[value] ?? value;
}

export function visibilityLabel(value: TaxonomyVisibility): string {
  return VISIBILITY[value] ?? value;
}

export function componentUnitLabel(value: ComponentUnit): string {
  return UNIT[value] ?? value;
}

export function promotionTypeLabel(value: PromotionType): string {
  return PROMOTION_TYPE[value] ?? value;
}

/** Operational screens: always Europe/Minsk store clock. */
export function formatAdminDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ru-BY', {
    timeZone: ADMIN_BUSINESS_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatAdminDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('ru-BY', {
    timeZone: ADMIN_BUSINESS_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** `datetime-local` value in Europe/Minsk (independent of browser TZ). */
export function toDateTimeLocalValue(iso: string | null | undefined): string {
  return utcIsoToBusinessLocal(iso);
}

/** ISO UTC from a `datetime-local` value interpreted as Europe/Minsk; null when cleared. */
export function fromDateTimeLocalValue(value: string): string | null {
  return businessLocalToUtcIso(value);
}

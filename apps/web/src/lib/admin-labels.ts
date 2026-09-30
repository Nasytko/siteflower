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

/** Local date-time for operational screens (Europe/Minsk store clock). */
export function formatAdminDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ru-BY', {
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
  return date.toLocaleDateString('ru-BY', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** `datetime-local` input value from an ISO timestamp. */
export function toDateTimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** ISO timestamp from a `datetime-local` value; null when cleared. */
export function fromDateTimeLocalValue(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

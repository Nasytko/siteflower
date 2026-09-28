/**
 * Server-authoritative cart validation & pricing.
 * Client-sent prices are never trusted as commercial truth.
 */
import type {
  CheckoutCartLineInput,
  CheckoutValidateIssueDto,
  CheckoutValidatedLineDto,
  CommercialAvailability,
  PromotionType,
} from '@bouquet-one/contracts';
import { formatPriceFromMinor } from '@bouquet-one/contracts';
import { isEffectivelyPublished } from '../catalog/catalog.logic';

export const MAX_LINE_QUANTITY = 20;
export const MAX_CART_LINES = 30;

export type VariantPriceSource = {
  product: {
    id: string;
    name: string;
    slug: string;
    lifecycle: string;
    availability: CommercialAvailability;
    currency: string;
    publishAt: Date | null;
    publishedAt: Date | null;
    unpublishAt: Date | null;
    primaryImageUrl: string | null;
  };
  variant: {
    id: string;
    name: string;
    status: string;
    /** Regular price. */
    priceMinor: bigint;
    /** Price after any currently effective promotion (equals priceMinor when none). */
    effectivePriceMinor: bigint;
    promotionType: PromotionType | null;
  } | null;
};

/** Adds the promotion snapshot the order aggregate persists on each item. */
export type ValidatedCartLine = CheckoutValidatedLineDto & {
  originalUnitPriceMinor: string | null;
  promotionType: PromotionType | null;
};

export function validateCartLines(input: {
  lines: CheckoutCartLineInput[];
  resolve: (productId: string, variantId: string) => VariantPriceSource | null;
  priorUnitPrices?: Map<string, bigint>;
  now?: Date;
}): {
  ok: boolean;
  items: ValidatedCartLine[];
  issues: CheckoutValidateIssueDto[];
  subtotalMinor: bigint;
} {
  const now = input.now ?? new Date();
  const issues: CheckoutValidateIssueDto[] = [];
  const items: ValidatedCartLine[] = [];
  let subtotal = 0n;

  if (input.lines.length === 0) {
    return {
      ok: false,
      items: [],
      issues: [
        {
          code: 'QUANTITY_INVALID',
          productId: '',
          variantId: '',
          message: 'Корзина пуста',
        },
      ],
      subtotalMinor: 0n,
    };
  }

  if (input.lines.length > MAX_CART_LINES) {
    return {
      ok: false,
      items: [],
      issues: [
        {
          code: 'QUANTITY_INVALID',
          productId: '',
          variantId: '',
          message: `В корзине слишком много позиций (максимум ${MAX_CART_LINES})`,
        },
      ],
      subtotalMinor: 0n,
    };
  }

  // Merge duplicate variant lines
  const merged = new Map<string, CheckoutCartLineInput>();
  for (const line of input.lines) {
    const key = `${line.productId}:${line.variantId}`;
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += line.quantity;
    } else {
      merged.set(key, { ...line });
    }
  }

  for (const line of merged.values()) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_LINE_QUANTITY) {
      issues.push({
        code: 'QUANTITY_INVALID',
        productId: line.productId,
        variantId: line.variantId,
        message: `Количество должно быть от 1 до ${MAX_LINE_QUANTITY}`,
      });
      continue;
    }

    const resolved = input.resolve(line.productId, line.variantId);
    if (!resolved || !resolved.variant) {
      issues.push({
        code: 'NOT_FOUND',
        productId: line.productId,
        variantId: line.variantId,
        message: 'Товар или вариант не найден',
      });
      continue;
    }

    const { product, variant } = resolved;

    if (!isEffectivelyPublished(product, now) || product.lifecycle === 'ARCHIVED') {
      issues.push({
        code: 'PRODUCT_UNAVAILABLE',
        productId: product.id,
        variantId: variant.id,
        message: `«${product.name}» сейчас нельзя заказать`,
      });
      continue;
    }

    if (product.availability === 'TEMPORARILY_UNAVAILABLE') {
      issues.push({
        code: 'PRODUCT_UNAVAILABLE',
        productId: product.id,
        variantId: variant.id,
        message: `«${product.name}» временно недоступен`,
      });
      continue;
    }

    if (variant.status !== 'ACTIVE') {
      issues.push({
        code: 'VARIANT_UNAVAILABLE',
        productId: product.id,
        variantId: variant.id,
        message: `Этот вариант «${product.name}» сейчас недоступен. Выберите другой размер.`,
      });
      continue;
    }

    // Promotional price is commercial truth at checkout time.
    const unit = variant.effectivePriceMinor;
    const promoted = unit < variant.priceMinor;
    const lineTotal = unit * BigInt(line.quantity);
    const prior = input.priorUnitPrices?.get(variant.id);
    if (prior != null && prior !== unit) {
      issues.push({
        code: 'PRICE_CHANGED',
        productId: product.id,
        variantId: variant.id,
        message: `Цена букета «${product.name}» изменилась с ${formatPriceFromMinor(prior)} на ${formatPriceFromMinor(unit)}.`,
        previousUnitPriceMinor: prior.toString(),
        currentUnitPriceMinor: unit.toString(),
      });
      // PRICE_CHANGED is informational — still allow checkout at current price
    }

    items.push({
      productId: product.id,
      variantId: variant.id,
      quantity: line.quantity,
      productName: product.name,
      productSlug: product.slug,
      variantName: variant.name,
      primaryImageUrl: product.primaryImageUrl,
      availability: product.availability,
      unitPriceMinor: unit.toString(),
      lineTotalMinor: lineTotal.toString(),
      currency: 'BYN',
      originalUnitPriceMinor: promoted ? variant.priceMinor.toString() : null,
      promotionType: promoted ? variant.promotionType : null,
    });
    subtotal += lineTotal;
  }

  const blocking = issues.filter((i) => i.code !== 'PRICE_CHANGED');
  return {
    ok: blocking.length === 0 && items.length > 0,
    items,
    issues,
    subtotalMinor: subtotal,
  };
}

/**
 * Server-authoritative cart validation & pricing.
 * Client-sent prices are never trusted as commercial truth.
 */
import type {
  CheckoutCartLineInput,
  CheckoutValidateIssueDto,
  CheckoutValidatedLineDto,
  CommercialAvailability,
  PricedOptionSelection,
  PromotionType,
} from '@bouquet-one/contracts';
import { computeLinePriceMinor, formatPriceFromMinor } from '@bouquet-one/contracts';
import { isEffectivelyPublished } from '../catalog/catalog.logic';

export const MAX_LINE_QUANTITY = 20;
export const MAX_CART_LINES = 30;

export type VariantPriceSource = {
  product: {
    id: string;
    name: string;
    slug: string;
    erpSku: string | null;
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

function lineMergeKey(line: CheckoutCartLineInput): string {
  const opts = [...(line.optionValueIds ?? [])].sort().join(',');
  return `${line.productId}:${line.variantId}:${opts}`;
}

export function validateCartLines(input: {
  lines: CheckoutCartLineInput[];
  resolve: (productId: string, variantId: string) => VariantPriceSource | null;
  /**
   * Resolve selected option value ids to priced selections.
   * When omitted, optionValueIds are rejected if present.
   */
  resolveOptions?: (
    productId: string,
    variantId: string,
    optionValueIds: string[] | undefined,
    /** Flower/stem line total after promo (unit × qty), before options. */
    baseLineMinor: bigint,
  ) => { ok: true; selections: PricedOptionSelection[] } | { ok: false; message: string };
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

  // Merge duplicate variant+options lines
  const merged = new Map<string, CheckoutCartLineInput>();
  for (const line of input.lines) {
    const key = lineMergeKey(line);
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += line.quantity;
    } else {
      merged.set(key, {
        ...line,
        optionValueIds: line.optionValueIds ? [...line.optionValueIds] : undefined,
      });
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

    // Promotional price is commercial truth at checkout time for the variant base.
    const baseUnit = variant.effectivePriceMinor;
    const baseLineMinor = baseUnit * BigInt(line.quantity);
    let optionSelections: PricedOptionSelection[] = [];
    if (line.optionValueIds && line.optionValueIds.length > 0 && !input.resolveOptions) {
      issues.push({
        code: 'OPTION_INVALID',
        productId: product.id,
        variantId: variant.id,
        message: 'Опции товара временно недоступны для оформления',
      });
      continue;
    }
    if (input.resolveOptions) {
      const opt = input.resolveOptions(
        product.id,
        variant.id,
        line.optionValueIds,
        baseLineMinor,
      );
      if (!opt.ok) {
        issues.push({
          code: 'OPTION_INVALID',
          productId: product.id,
          variantId: variant.id,
          message: opt.message,
        });
        continue;
      }
      optionSelections = opt.selections;
    }

    const promoted = baseUnit < variant.priceMinor;
    const priced = computeLinePriceMinor({
      quantity: line.quantity,
      baseUnitPriceMinor: baseUnit,
      options: optionSelections,
    });
    const prior = input.priorUnitPrices?.get(variant.id);
    if (prior != null && prior !== baseUnit) {
      issues.push({
        code: 'PRICE_CHANGED',
        productId: product.id,
        variantId: variant.id,
        message: `Цена букета «${product.name}» изменилась с ${formatPriceFromMinor(prior)} на ${formatPriceFromMinor(baseUnit)}.`,
        previousUnitPriceMinor: prior.toString(),
        currentUnitPriceMinor: baseUnit.toString(),
      });
    }

    items.push({
      productId: product.id,
      variantId: variant.id,
      quantity: line.quantity,
      productName: product.name,
      productSlug: product.slug,
      productErpSku: product.erpSku ?? null,
      variantName: variant.name,
      primaryImageUrl: product.primaryImageUrl,
      availability: product.availability,
      unitPriceMinor: priced.unitPriceMinor.toString(),
      baseUnitPriceMinor: priced.baseUnitPriceMinor.toString(),
      optionsTotalMinor: priced.optionsTotalMinor.toString(),
      optionsSnapshot: priced.optionsSnapshot,
      lineTotalMinor: priced.lineTotalMinor.toString(),
      currency: 'BYN',
      originalUnitPriceMinor: promoted ? variant.priceMinor.toString() : null,
      promotionType: promoted ? variant.promotionType : null,
    });
    subtotal += priced.lineTotalMinor;
  }

  const blocking = issues.filter((i) => i.code !== 'PRICE_CHANGED');
  return {
    ok: blocking.length === 0 && items.length > 0,
    items,
    issues,
    subtotalMinor: subtotal,
  };
}

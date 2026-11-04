import type { ProductKind } from '@bouquet-one/contracts';
import type { CartLine, CartState } from '@/lib/cart';

/** STEM qty = stems in one assembled bouquet; other kinds qty = sellable units. */
export function isStemBouquetLine(line: Pick<CartLine, 'productKind'>): boolean {
  return line.productKind === 'STEM';
}

/**
 * How many customer-facing «compositions» are in the cart.
 * 7 roses + ribbon on one STEM line = 1, not 7.
 */
export function cartCompositionCount(state: CartState): number {
  return state.items.reduce((sum, line) => {
    if (isStemBouquetLine(line)) return sum + 1;
    return sum + line.quantity;
  }, 0);
}

export function pluralRu(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

export function compositionCountLabel(count: number): string {
  return `${count} ${pluralRu(count, 'букет', 'букета', 'букетов')}`;
}

export function stemCountLabel(count: number): string {
  return `${count} ${pluralRu(count, 'ветка', 'ветки', 'веток')}`;
}

export function unitPriceSuffix(kind: ProductKind | undefined): string {
  if (kind === 'STEM') return 'за ветку';
  if (kind === 'GIFT') return 'за шт.';
  return 'за букет';
}

/** Line subtitle under the product name. */
export function cartLineSubtitle(line: CartLine): string | null {
  if (isStemBouquetLine(line)) {
    return stemCountLabel(line.quantity);
  }
  return line.variantName?.trim() || null;
}

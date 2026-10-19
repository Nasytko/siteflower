import type { ProductListItemDto } from '@bouquet-one/contracts';
import { ProductCard } from './product-card';

type Props = {
  products: ProductListItemDto[];
  /** Prefer horizontal scroll on narrow screens for 5-up shelves. */
  scrollOnMobile?: boolean;
  priorityCount?: number;
  /** Shelf flavour — sets the card photo proportions (see `.sf-product-row--*`). */
  tone?: 'promo' | 'seasonal' | 'shelf';
};

export function ProductRow({
  products,
  scrollOnMobile = true,
  priorityCount = 2,
  tone = 'shelf',
}: Props) {
  if (products.length === 0) return null;

  const classes = ['sf-product-row', `sf-product-row--${tone}`];
  if (scrollOnMobile) classes.push('sf-product-row--scroll');

  return (
    <ul className={classes.join(' ')}>
      {products.map((product, index) => (
        <li key={product.id}>
          <ProductCard
            product={product}
            priority={index < priorityCount}
            variant="compact"
            sizes="(max-width: 640px) 46vw, (max-width: 1100px) 30vw, 17rem"
          />
        </li>
      ))}
    </ul>
  );
}

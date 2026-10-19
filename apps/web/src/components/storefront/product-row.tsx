import type { ProductListItemDto } from '@bouquet-one/contracts';
import { ProductCard } from './product-card';

type Props = {
  products: ProductListItemDto[];
  /** Prefer horizontal scroll on narrow screens for 5-up shelves. */
  scrollOnMobile?: boolean;
  priorityCount?: number;
};

export function ProductRow({
  products,
  scrollOnMobile = true,
  priorityCount = 2,
}: Props) {
  if (products.length === 0) return null;

  return (
    <ul className={scrollOnMobile ? 'sf-product-row sf-product-row--scroll' : 'sf-product-row'}>
      {products.map((product, index) => (
        <li key={product.id}>
          <ProductCard
            product={product}
            priority={index < priorityCount}
            sizes="(max-width: 640px) 42vw, (max-width: 1100px) 30vw, 18vw"
          />
        </li>
      ))}
    </ul>
  );
}

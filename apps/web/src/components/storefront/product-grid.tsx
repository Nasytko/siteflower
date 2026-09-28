import type { ProductListItemDto } from '@bouquet-one/contracts';
import { ProductCard } from './product-card';

type Props = {
  products: ProductListItemDto[];
  priorityCount?: number;
};

export function ProductGrid({ products, priorityCount = 4 }: Props) {
  if (products.length === 0) return null;

  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-5 sm:gap-y-8 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-10">
      {products.map((product, index) => (
        <li key={product.id}>
          <ProductCard product={product} priority={index < priorityCount} />
        </li>
      ))}
    </ul>
  );
}

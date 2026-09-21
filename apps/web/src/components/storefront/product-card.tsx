import Image from 'next/image';
import Link from 'next/link';
import type { ProductListItemDto } from '@bouquet-one/contracts';
import { FavoriteButton } from './favorite-button';

type Props = {
  product: ProductListItemDto;
  priority?: boolean;
};

function availabilityHint(availability: ProductListItemDto['availability']): string | null {
  switch (availability) {
    case 'TEMPORARILY_UNAVAILABLE':
      return 'Временно недоступен';
    case 'PREORDER':
      return 'Под заказ';
    case 'SEASONAL':
      return 'Сезонный';
    default:
      return null;
  }
}

export function ProductCard({ product, priority = false }: Props) {
  const hint = availabilityHint(product.availability);

  return (
    <article className="group relative flex h-full flex-col">
      <Link
        href={`/bukety/${product.slug}`}
        className="flex flex-1 flex-col outline-offset-4"
        aria-label={`${product.name}, ${product.price?.label ?? 'цена по запросу'}`}
      >
        <div className="relative aspect-square overflow-hidden bg-surface">
          {product.primaryImageUrl ? (
            <Image
              src={product.primaryImageUrl}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover transition duration-700 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              priority={priority}
            />
          ) : (
            <div className="flex h-full items-end p-4 text-sm text-muted">Фото скоро</div>
          )}
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-foreground/[0.04] to-transparent opacity-0 transition group-hover:opacity-100"
            aria-hidden
          />
        </div>
        <div className="mt-4 flex items-baseline justify-between gap-3">
          {product.price ? (
            <p className="sf-price shrink-0 text-foreground">{product.price.label}</p>
          ) : (
            <span />
          )}
          <h3 className="sf-h3 line-clamp-2 text-right text-[1.05rem] text-foreground/90 transition group-hover:text-brand">
            {product.name}
          </h3>
        </div>
        {hint ? <p className="sf-small mt-1 text-right text-muted">{hint}</p> : null}
      </Link>
      <div className="absolute right-2.5 top-2.5 z-10 opacity-90 transition group-hover:opacity-100">
        <FavoriteButton productId={product.id} slug={product.slug} />
      </div>
    </article>
  );
}
